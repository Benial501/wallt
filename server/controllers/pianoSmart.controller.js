/**
 * Piano Smart — controller.
 *
 * Due regole che governano tutto questo file:
 *
 * 1. **Il backend ricalcola sempre.** Nessuna allocazione raccomandata
 *    proveniente dal browser viene creduta: `POST /` rigenera il piano dal
 *    FinancialContext corrente e usa il proprio risultato come `recommended`.
 *    Del client accetta solo le allocazioni `final`, e solo dopo averle
 *    validate contro gli invarianti.
 * 2. **Nessuna scrittura finanziaria.** Creare, modificare o archiviare un
 *    piano non tocca saldi, movimenti, trasferimenti, obiettivi, investimenti o
 *    debiti. Piano Smart V1 è pianificazione: le uniche tabelle scritte qui
 *    sono `piani_smart` e `piani_smart_allocazioni`.
 *
 * La proprietà è verificata con `where: { id, user_id: req.userId }` su ogni
 * lettura e ogni scrittura, mai con una findByPk seguita da un confronto: un
 * confronto si può dimenticare in un ramo, una WHERE no.
 */
const logger = require('../utils/logger');
const { sequelize, PianoSmart, PianoSmartAllocazione } = require('../models');
const { CATEGORIE, TRANSIZIONI_STATO, CHIAVI_CONTESTO_MANUALE } = require('../constants/pianoSmart');
const { getFinancialContext } = require('../services/financialContext.service');
const { getReadiness } = require('../services/pianoSmart/readiness.service');
const { generaPiano } = require('../services/pianoSmart/allocation.service');
const { validaAllocazioniFinali } = require('../services/pianoSmart/validation.service');
const { toCents, fromCents, percentuale } = require('../services/pianoSmart/money');
const {
  serializePreview, serializePiano, serializePianoLista, buildContextSnapshot,
  serializeMetadata,
} = require('../services/pianoSmart/serializer');

/** Ordine di lettura delle allocazioni: sempre quello canonico delle categorie,
 * non l'ordine di inserimento nel database. */
const ordinaAllocazioni = (righe) => CATEGORIE
  .map((c) => righe.find((r) => r.category === c))
  .filter(Boolean);

const caricaAllocazioni = (planId, transaction) => PianoSmartAllocazione.findAll({
  where: { plan_id: planId }, transaction,
}).then(ordinaAllocazioni);

/** Solo le chiavi previste, solo valori utilizzabili: una risposta manuale
 * arbitraria non deve poter entrare nello snapshot. */
const filtraRisposteManuali = (risposte) => {
  if (!risposte || typeof risposte !== 'object' || Array.isArray(risposte)) return {};
  const esito = {};
  CHIAVI_CONTESTO_MANUALE.forEach((chiave) => {
    if (risposte[chiave] === undefined || risposte[chiave] === null || risposte[chiave] === '') return;
    esito[chiave] = risposte[chiave];
  });
  return esito;
};

/**
 * Traduce il corpo della richiesta in input del motore.
 *
 * `amount` e `mandatoryExpenses` sono già stati validati dal middleware, ma la
 * conversione in centesimi va rifatta qui: è l'unico punto in cui il valore
 * entra nel motore, e fidarsi di una validazione avvenuta altrove vorrebbe dire
 * dipendere dall'ordine dei middleware.
 */
const leggiInput = (body) => {
  const incomingCents = toCents(body.amount);
  const mandatoryCents = body.mandatoryExpenses === undefined || body.mandatoryExpenses === null
    || body.mandatoryExpenses === '' ? 0 : toCents(body.mandatoryExpenses);
  return {
    incomingCents,
    mandatoryCents,
    sourceType: body.sourceType,
    sourceRecurring: body.recurring === true,
    manualAnswers: filtraRisposteManuali(body.manualContextAnswers),
  };
};

/**
 * Genera il piano raccomandato dal contesto attuale dell'utente. Usato sia da
 * preview sia da save: è la garanzia che le due strade producano lo stesso
 * risultato a parità di input e di contesto.
 */
const calcolaRaccomandazione = async (userId, input) => {
  const context = await getFinancialContext(userId);
  const piano = generaPiano({
    incomingCents: input.incomingCents,
    mandatoryCents: input.mandatoryCents,
    sourceType: input.sourceType,
    sourceRecurring: input.sourceRecurring,
    context,
    manualAnswers: input.manualAnswers,
  });
  return { context, piano };
};

/**
 * Legge e valida le allocazioni finali inviate dal client.
 *
 * Accetta importi come stringhe decimali o numeri; rifiuta tutto ciò che non è
 * un importo valido, le categorie mancanti/ripetute/sconosciute, le somme che
 * non coincidono col capitale allocabile e le violazioni dei cap. I cap valgono
 * anche sulle scelte manuali: assegnare a `goals` più di quanto gli obiettivi
 * debbano raggiungere non è una preferenza, è denaro destinato a un traguardo
 * che non esiste.
 */
const leggiAllocazioni = (allocations, { allocatableCents, caps }) => {
  if (!Array.isArray(allocations)) {
    return { valido: false, errori: ['Il campo allocations deve essere un elenco.'], centesimi: null };
  }

  const centesimi = {};
  const errori = [];
  allocations.forEach((riga) => {
    if (!riga || typeof riga !== 'object') {
      errori.push('Ogni allocazione deve essere un oggetto con categoria e importo.');
      return;
    }
    const categoria = riga.category;
    const importo = riga.finalAmount ?? riga.amount ?? riga.recommendedAmount;
    const cents = toCents(importo);
    if (cents === null) {
      errori.push(`Importo non valido per la categoria ${categoria ?? 'non indicata'}.`);
      return;
    }
    if (centesimi[categoria] !== undefined) {
      errori.push(`Categorie ripetute: ${categoria}.`);
      return;
    }
    centesimi[categoria] = cents;
  });
  if (errori.length > 0) return { valido: false, errori, centesimi: null };

  const elenco = Object.entries(centesimi).map(([category, cents]) => ({
    category,
    cents,
    percentage: percentuale(cents, allocatableCents),
  }));

  const esito = validaAllocazioniFinali({
    allocazioni: elenco, allocatableCents, caps,
  });
  if (!esito.valido) return { valido: false, errori: esito.errori, centesimi: null };
  return { valido: true, errori: [], centesimi };
};

// --------------------------------------------------------------------------
// GET /api/piano-smart/readiness
// --------------------------------------------------------------------------
const getReadinessHandler = async (req, res) => {
  try {
    const readiness = await getReadiness(req.userId);
    return res.json(readiness);
  } catch (error) {
    logger.error('Errore getReadiness piano smart', { err: error });
    return res.status(500).json({ error: 'Errore nel calcolo dello stato dei dati' });
  }
};

// --------------------------------------------------------------------------
// POST /api/piano-smart/preview — calcola, non salva
// --------------------------------------------------------------------------
const previewPiano = async (req, res) => {
  try {
    const input = leggiInput(req.body);
    const { context, piano } = await calcolaRaccomandazione(req.userId, input);
    return res.json(serializePreview(piano, context));
  } catch (error) {
    // Una violazione degli invarianti è un errore di calcolo, non un input
    // sbagliato: va distinta nella risposta perché il client la classifica.
    if (error.violazioni) {
      logger.error('Invarianti violati in preview piano smart', { err: error, userId: req.userId });
      return res.status(500).json({ error: 'Errore nel calcolo del piano' });
    }
    logger.error('Errore preview piano smart', { err: error });
    return res.status(500).json({ error: 'Errore nella generazione del piano' });
  }
};

// --------------------------------------------------------------------------
// POST /api/piano-smart — ricalcola e salva
// --------------------------------------------------------------------------
const createPiano = async (req, res) => {
  try {
    const input = leggiInput(req.body);
    const { context, piano } = await calcolaRaccomandazione(req.userId, input);

    // Le allocazioni finali: quelle inviate dal client, oppure le raccomandate
    // quando il client non le modifica. Le `recommended` restano SEMPRE quelle
    // del motore, qualunque cosa il client abbia mandato.
    const finali = req.body.allocations === undefined || req.body.allocations === null
      ? {
        valido: true,
        errori: [],
        centesimi: Object.fromEntries(
          piano.allocations.map((a) => [a.category, a.recommendedCents]),
        ),
      }
      : leggiAllocazioni(req.body.allocations, {
        allocatableCents: piano.allocatableCents, caps: piano.caps,
      });
    if (!finali.valido) {
      return res.status(400).json({ error: finali.errori[0], errori: finali.errori });
    }

    const snapshot = buildContextSnapshot({ piano, context, manualAnswers: input.manualAnswers });

    const creato = await sequelize.transaction(async (transaction) => {
      const riga = await PianoSmart.create({
        user_id: req.userId,
        incoming_amount: fromCents(piano.incomingCents),
        source_type: piano.sourceType,
        source_recurring: piano.sourceRecurring,
        mandatory_expenses: fromCents(piano.mandatoryCents),
        allocatable_capital: fromCents(piano.allocatableCents),
        recommended_total: fromCents(piano.allocatableCents),
        engine_version: piano.engineVersion,
        context_snapshot: snapshot,
        reason_codes: piano.reasonCodes,
        status: 'draft',
      }, { transaction });

      await PianoSmartAllocazione.bulkCreate(piano.allocations.map((a) => ({
        plan_id: riga.id,
        category: a.category,
        recommended_amount: fromCents(a.recommendedCents),
        final_amount: fromCents(finali.centesimi[a.category]),
        recommended_percentage: a.recommendedPercentage,
        final_percentage: percentuale(finali.centesimi[a.category], piano.allocatableCents),
        metadata: serializeMetadata(a.metadata),
        reason_codes: a.reasonCodes,
      })), { transaction });

      return riga;
    });

    const allocazioni = await caricaAllocazioni(creato.id);
    return res.status(201).json(serializePiano(creato, allocazioni));
  } catch (error) {
    if (error.violazioni) {
      logger.error('Invarianti violati in create piano smart', { err: error, userId: req.userId });
      return res.status(500).json({ error: 'Errore nel calcolo del piano' });
    }
    logger.error('Errore createPiano piano smart', { err: error, userId: req.userId });
    const code = error?.original?.code || error?.parent?.code;
    if (code === '42P01') return res.status(503).json({ error: 'Schema Piano Smart non disponibile: esegui la migration del backend.' });
    if (code === '42703') return res.status(503).json({ error: 'Schema Piano Smart non aggiornato: applica la migration più recente.' });
    if (code === '23503' || code === '23514' || code === '23505') return res.status(422).json({ error: 'Il piano non rispetta i vincoli dello schema dati.', code });
    return res.status(500).json({ error: 'Errore nel salvataggio del piano', code: 'SMART_PLAN_SAVE_FAILED' });
  }
};

// --------------------------------------------------------------------------
// GET /api/piano-smart — elenco dei piani dell'utente autenticato
// --------------------------------------------------------------------------
const listPiani = async (req, res) => {
  try {
    const piani = await PianoSmart.findAll({
      where: { user_id: req.userId },
      order: [['createdAt', 'DESC'], ['id', 'DESC']],
      include: [{ model: PianoSmartAllocazione, as: 'allocazioni' }],
    });
    // `{ data, total }`: il client scarta l'involucro leggendo `data`.
    return res.json({
      data: piani.map((p) => serializePianoLista(p, ordinaAllocazioni(p.allocazioni || []))),
      total: piani.length,
    });
  } catch (error) {
    logger.error('Errore listPiani piano smart', { err: error });
    return res.status(500).json({ error: 'Errore nel recupero dei piani' });
  }
};

// --------------------------------------------------------------------------
// GET /api/piano-smart/:id — dettaglio, solo proprietario
// --------------------------------------------------------------------------
const getPiano = async (req, res) => {
  try {
    const piano = await PianoSmart.findOne({
      where: { id: req.params.id, user_id: req.userId },
      include: [{ model: PianoSmartAllocazione, as: 'allocazioni' }],
    });
    if (!piano) return res.status(404).json({ error: 'Piano non trovato' });
    return res.json(serializePiano(piano, ordinaAllocazioni(piano.allocazioni || [])));
  } catch (error) {
    logger.error('Errore getPiano piano smart', { err: error });
    return res.status(500).json({ error: 'Errore nel recupero del piano' });
  }
};

// --------------------------------------------------------------------------
// PATCH /api/piano-smart/:id — allocazioni finali e/o stato
// --------------------------------------------------------------------------
const updatePiano = async (req, res) => {
  try {
    const piano = await PianoSmart.findOne({
      where: { id: req.params.id, user_id: req.userId },
    });
    if (!piano) return res.status(404).json({ error: 'Piano non trovato' });

    const { status, allocations } = req.body;
    if (status === undefined && allocations === undefined) {
      return res.status(400).json({ error: 'Niente da aggiornare: indica status oppure allocations.' });
    }

    if (status !== undefined) {
      const ammesse = TRANSIZIONI_STATO[piano.status] || [];
      if (status !== piano.status && !ammesse.includes(status)) {
        return res.status(400).json({
          error: `Transizione non ammessa da "${piano.status}" a "${status}".`,
        });
      }
    }

    if (allocations !== undefined) {
      const esito = aggiornaAllocazioniFinali(piano, allocations);
      if (!esito.valido) {
        return res.status(400).json({ error: esito.errori[0], errori: esito.errori });
      }
      const allocatableCents = toCents(String(piano.allocatable_capital));
      await sequelize.transaction(async (transaction) => {
        // Una UPDATE per categoria: la UNIQUE (plan_id, category) garantisce
        // che ognuna esista una volta sola, quindi non serve cancellare e
        // ricreare (che perderebbe le `recommended`).
        await Promise.all(CATEGORIE.map((categoria) => PianoSmartAllocazione.update({
          final_amount: fromCents(esito.centesimi[categoria]),
          final_percentage: percentuale(esito.centesimi[categoria], allocatableCents),
        }, {
          where: { plan_id: piano.id, category: categoria },
          transaction,
        })));
        if (status !== undefined) await piano.update({ status }, { transaction });
      });
    } else if (status !== undefined) {
      await piano.update({ status });
    }

    const aggiornato = await PianoSmart.findOne({
      where: { id: piano.id, user_id: req.userId },
      include: [{ model: PianoSmartAllocazione, as: 'allocazioni' }],
    });
    return res.json(serializePiano(aggiornato, ordinaAllocazioni(aggiornato.allocazioni || [])));
  } catch (error) {
    logger.error('Errore updatePiano piano smart', { err: error });
    return res.status(500).json({ error: 'Errore nell\'aggiornamento del piano' });
  }
};

/**
 * Valida le allocazioni finali di un PATCH contro i cap **conservati nello
 * snapshot**, non contro un contesto ricalcolato.
 *
 * Il motivo è concreto: fra la creazione del piano e la modifica delle sue
 * allocazioni l'utente può aver versato su un obiettivo o sul fondo, e i cap
 * di oggi sarebbero più bassi di quelli validi quando il piano è stato
 * proposto. Rivalidare su un contesto fresco rifiuterebbe una scelta che era
 * legittima nel momento in cui è stata fatta.
 */
const aggiornaAllocazioniFinali = (piano, allocations) => {
  const allocatableCents = toCents(String(piano.allocatable_capital));
  if (allocatableCents === null) {
    return { valido: false, errori: ['Capitale allocabile del piano non leggibile.'], centesimi: null };
  }
  const snapshot = piano.context_snapshot || {};
  const caps = snapshot.capsCents || {};
  return leggiAllocazioni(allocations, { allocatableCents, caps });
};

module.exports = {
  getReadinessHandler,
  previewPiano,
  createPiano,
  listPiani,
  getPiano,
  updatePiano,
};
