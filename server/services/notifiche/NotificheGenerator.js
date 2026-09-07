const cron = require('node-cron');
const { Op } = require('sequelize');
const { User, Movimento, Obiettivo } = require('../../models');
const { CATEGORIA_USCITA_DISPLAY } = require('../../constants/categorie');
const { calcolaStatoBudget } = require('../budgetStato.service');
const logger = require('../../utils/logger');
const {
  PRIORITA, creaNotifica, getPreferenze, potaNotificheVecchie,
} = require('./NotificheService');
const { inviaNotifichePendenti } = require('./PushService');
const {
  partiLocali, parseOrario, sommaGiorni, istanteDaOrarioLocale, settimanaIso,
} = require('./notificheTime');

/**
 * Generatore delle notifiche: contiene le regole di business, una per tipo.
 *
 * Ogni regola è idempotente grazie alla `dedupe_key`: rieseguire il job (o
 * eseguirlo più volte al giorno) non produce doppioni, quindi l'endpoint cron
 * può essere richiamato con qualsiasi frequenza senza effetti collaterali.
 *
 * Nessuna regola lancia: un errore su un utente viene registrato e il job
 * prosegue con gli altri.
 */

/** Soglie di avanzamento degli obiettivi che meritano un avviso. */
const TRAGUARDI_OBIETTIVO = [50, 75, 100];

/** Etichette leggibili per le categorie di budget (non tutte sono categorie di movimento). */
const ETICHETTE_BUDGET = {
  cibo: 'Cibo e spesa',
  acquisti: 'Acquisti',
  benzina: 'Benzina',
  scommesse: 'Scommesse',
  risparmio: 'Risparmio',
};

const etichettaCategoria = (categoria) => ETICHETTE_BUDGET[categoria]
  || CATEGORIA_USCITA_DISPLAY[categoria]?.nome
  || String(categoria || '').replace(/_/g, ' ');

const toNumber = (val) => parseFloat(val) || 0;

const troncaDescrizione = (descrizione, max = 60) => {
  const testo = String(descrizione || '').trim();
  if (!testo) return null;
  return testo.length > max ? `${testo.slice(0, max - 1)}…` : testo;
};

/**
 * Estremi (istanti assoluti) del giorno locale dell'utente: servono per
 * capire se ha usato WALLT "oggi" nel SUO fuso, non in quello del server.
 */
const estremiGiornoLocale = (giorno, timezone) => ({
  inizio: istanteDaOrarioLocale(giorno, '00:00', timezone),
  fine: istanteDaOrarioLocale(sommaGiorni(giorno, 1), '00:00', timezone),
});

/**
 * L'utente ha già aggiornato WALLT oggi?
 * Conta sia i movimenti DATATI oggi sia quelli INSERITI oggi (chi registra
 * stamattina la spesa di ieri ha comunque aggiornato l'app).
 */
const haRegistratoMovimentiOggi = async (userId, giorno, timezone) => {
  const { inizio, fine } = estremiGiornoLocale(giorno, timezone);

  const quanti = await Movimento.count({
    where: {
      user_id: userId,
      tipo: { [Op.in]: ['entrata', 'uscita'] },
      [Op.or]: [
        { data: giorno },
        { createdAt: { [Op.gte]: inizio, [Op.lt]: fine } },
      ],
    },
  });

  return quanti > 0;
};

/**
 * 1) Promemoria giornaliero.
 * Parte solo dopo l'orario scelto dall'utente, solo se non ha registrato
 * nulla, non ha marcato la giornata come controllata e non ha già consumato
 * il limite di notifiche.
 */
const regolaPromemoriaGiornaliero = async ({ userId, preferenze, adesso }) => {
  if (!preferenze.promemoria_giornaliero_attivo) return null;

  const locale = partiLocali(adesso, preferenze.timezone);
  const orario = parseOrario(preferenze.orario_promemoria);
  if (locale.minutiDelGiorno < orario.minutiDelGiorno) return null;

  if (preferenze.giornata_controllata_il === locale.data) return null;

  if (await haRegistratoMovimentiOggi(userId, locale.data, preferenze.timezone)) return null;

  return creaNotifica({
    userId,
    preferenze,
    adesso,
    tipo: 'promemoria_giornaliero',
    dedupeKey: `promemoria:${locale.data}`,
    titolo: 'Ricordati di aggiornare Wallt',
    messaggio: 'Non hai ancora registrato movimenti oggi. Bastano pochi secondi per aggiornare entrate e uscite.',
    link: '/movimenti',
    priorita: PRIORITA.NORMALE,
    metadata: { giorno: locale.data },
    // Un promemoria consegnato il giorno dopo non ha senso: se il limite è
    // saturo si salta del tutto e si riproverà domani.
    saltaSeOltreLimite: true,
  });
};

/**
 * 2) e 3) Budget all'80% e budget superato.
 * Una sola notifica per categoria, per soglia, per mese.
 */
const regolaBudget = async ({ userId, preferenze, adesso }) => {
  if (!preferenze.alert_budget_attivi) return [];

  const locale = partiLocali(adesso, preferenze.timezone);
  const risultato = await calcolaStatoBudget({
    userId,
    mese: locale.mese,
    anno: locale.anno,
  });
  if (!risultato) return [];

  const esiti = [];

  for (const categoria of risultato.stato) {
    if (categoria.budget_importo <= 0) continue;

    const etichetta = etichettaCategoria(categoria.categoria);
    const base = `budget:${risultato.budget.id}:${categoria.categoria}`;
    const metadata = {
      budget_id: risultato.budget.id,
      categoria: categoria.categoria,
      periodo: locale.periodo,
    };

    if (categoria.percentuale_usata >= 100) {
      esiti.push(await creaNotifica({
        userId,
        preferenze,
        adesso,
        tipo: 'budget_superato',
        dedupeKey: `${base}:100:${locale.periodo}`,
        titolo: 'Budget superato',
        messaggio: `Hai superato il budget previsto per la categoria ${etichetta}.`,
        link: '/budget',
        // Avviso importante: può occupare il secondo slot della giornata.
        priorita: PRIORITA.URGENTE,
        metadata,
      }));
      // Niente avviso "80%" a posteriori quando la soglia è già stata sfondata.
      continue;
    }

    if (categoria.percentuale_usata >= 80) {
      esiti.push(await creaNotifica({
        userId,
        preferenze,
        adesso,
        tipo: 'budget_80',
        dedupeKey: `${base}:80:${locale.periodo}`,
        titolo: 'Budget quasi raggiunto',
        messaggio: `Hai utilizzato l'80% del budget della categoria ${etichetta}.`,
        link: '/budget',
        priorita: PRIORITA.NORMALE,
        metadata,
      }));
    }
  }

  return esiti;
};

/**
 * 4) Pagamenti ricorrenti: un solo avviso il giorno prima della scadenza.
 * Replica la regola del cron delle ricorrenti (`ricorrenti.service.js`):
 * solo frequenza mensile e confronto esatto sul giorno del mese.
 */
const regolaRicorrenti = async ({ userId, preferenze, adesso }) => {
  if (!preferenze.alert_ricorrenti_attivi) return [];

  const locale = partiLocali(adesso, preferenze.timezone);
  const domani = sommaGiorni(locale.data, 1);
  const [annoDomani, meseDomani, giornoDomani] = domani.split('-');
  const periodoDomani = `${annoDomani}-${meseDomani}`;
  const giornoDelMese = Number(giornoDomani);

  const ricorrenti = await Movimento.findAll({
    where: {
      user_id: userId,
      ricorrente: true,
      ricorrente_frequenza: 'mensile',
      ricorrente_giorno: giornoDelMese,
      tipo: { [Op.in]: ['entrata', 'uscita'] },
    },
  });

  const esiti = [];
  for (const movimento of ricorrenti) {
    const descrizione = troncaDescrizione(movimento.descrizione);
    const messaggio = movimento.tipo === 'entrata'
      ? `Domani è prevista un'entrata ricorrente${descrizione ? `: ${descrizione}` : ''}.`
      : `Domani è previsto un pagamento ricorrente${descrizione ? `: ${descrizione}` : ''}.`;

    esiti.push(await creaNotifica({
      userId,
      preferenze,
      adesso,
      tipo: 'ricorrente_imminente',
      dedupeKey: `ricorrente:${movimento.id}:${periodoDomani}`,
      titolo: movimento.tipo === 'entrata' ? 'Entrata in arrivo' : 'Pagamento in arrivo',
      messaggio,
      link: '/movimenti',
      // Scadenza imminente: rientra fra gli avvisi importanti.
      priorita: PRIORITA.URGENTE,
      metadata: { movimento_id: movimento.id, periodo: periodoDomani },
    }));
  }

  return esiti;
};

/**
 * 5) Obiettivi di risparmio: 50%, 75%, 100%.
 * Per ogni obiettivo si notifica solo il traguardo più alto raggiunto e non
 * ancora annunciato: superare 50% e 75% insieme non genera due notifiche.
 */
const regolaObiettivi = async ({ userId, preferenze, adesso }) => {
  if (!preferenze.alert_obiettivi_attivi) return [];

  const obiettivi = await Obiettivo.findAll({ where: { user_id: userId } });
  const esiti = [];

  for (const obiettivo of obiettivi) {
    const target = toNumber(obiettivo.importo_target);
    if (target <= 0) continue;

    const percentuale = (toNumber(obiettivo.importo_attuale) / target) * 100;
    const traguardo = [...TRAGUARDI_OBIETTIVO].reverse().find((t) => percentuale >= t);
    if (!traguardo) continue;

    const raggiunto = traguardo === 100;
    esiti.push(await creaNotifica({
      userId,
      preferenze,
      adesso,
      tipo: raggiunto ? 'obiettivo_raggiunto' : 'obiettivo_traguardo',
      dedupeKey: `obiettivo:${obiettivo.id}:${traguardo}`,
      titolo: raggiunto ? 'Obiettivo raggiunto' : 'Traguardo raggiunto',
      messaggio: raggiunto
        ? `Complimenti: hai raggiunto l'obiettivo "${obiettivo.nome}".`
        : `Sei al ${traguardo}% dell'obiettivo "${obiettivo.nome}".`,
      link: '/obiettivi',
      priorita: PRIORITA.NORMALE,
      metadata: { obiettivo_id: obiettivo.id, traguardo },
    }));
  }

  return esiti;
};

/** Totali della settimana (lunedì → domenica) che precede il giorno indicato. */
const totaliSettimana = async (userId, primoGiorno, ultimoGiorno) => {
  const movimenti = await Movimento.findAll({
    where: {
      user_id: userId,
      tipo: { [Op.in]: ['entrata', 'uscita'] },
      data: { [Op.between]: [primoGiorno, ultimoGiorno] },
    },
    attributes: ['tipo', 'importo', 'categoria'],
  });

  let entrate = 0;
  let uscite = 0;
  const perCategoria = {};

  movimenti.forEach((m) => {
    const importo = toNumber(m.importo);
    if (m.tipo === 'entrata') {
      entrate += importo;
      return;
    }
    uscite += importo;
    const cat = m.categoria || 'altro_uscita';
    perCategoria[cat] = (perCategoria[cat] || 0) + importo;
  });

  const topCategoria = Object.entries(perCategoria)
    .sort((a, b) => b[1] - a[1])[0] || null;

  return {
    movimenti: movimenti.length,
    entrate: Math.round(entrate * 100) / 100,
    uscite: Math.round(uscite * 100) / 100,
    risparmio_netto: Math.round((entrate - uscite) * 100) / 100,
    categoria_top: topCategoria
      ? { categoria: topCategoria[0], etichetta: etichettaCategoria(topCategoria[0]), totale: Math.round(topCategoria[1] * 100) / 100 }
      : null,
  };
};

/**
 * 6) Riepilogo settimanale (facoltativo, spento di default).
 * Solo il lunedì e al massimo una volta per settimana ISO. I numeri stanno
 * nel `metadata` e si leggono in app: la notifica di sistema resta generica.
 */
const regolaRiepilogoSettimanale = async ({ userId, preferenze, adesso }) => {
  if (!preferenze.riepilogo_settimanale_attivo) return null;

  const locale = partiLocali(adesso, preferenze.timezone);
  const giornoSettimana = new Date(Date.UTC(locale.anno, locale.mese - 1, locale.giorno)).getUTCDay();
  if (giornoSettimana !== 1) return null; // solo lunedì

  const inizioSettimanaScorsa = sommaGiorni(locale.data, -7);
  const fineSettimanaScorsa = sommaGiorni(locale.data, -1);
  const inizioPrecedente = sommaGiorni(locale.data, -14);
  const finePrecedente = sommaGiorni(locale.data, -8);

  const [settimana, precedente] = await Promise.all([
    totaliSettimana(userId, inizioSettimanaScorsa, fineSettimanaScorsa),
    totaliSettimana(userId, inizioPrecedente, finePrecedente),
  ]);

  // Una settimana senza alcun movimento non merita un riepilogo vuoto.
  if (settimana.movimenti === 0) return null;

  return creaNotifica({
    userId,
    preferenze,
    adesso,
    tipo: 'riepilogo_settimanale',
    dedupeKey: `riepilogo:${settimanaIso(adesso, preferenze.timezone)}`,
    titolo: 'Il tuo riepilogo settimanale',
    messaggio: 'Controlla come hai gestito le tue finanze questa settimana.',
    link: '/analisi',
    priorita: PRIORITA.NORMALE,
    metadata: {
      periodo: { da: inizioSettimanaScorsa, a: fineSettimanaScorsa },
      settimana,
      settimana_precedente: precedente.movimenti > 0 ? precedente : null,
    },
  });
};

/** Le regole urgenti girano per prime: hanno diritto al secondo slot. */
const REGOLE = [
  { nome: 'budget', esegui: regolaBudget },
  { nome: 'ricorrenti', esegui: regolaRicorrenti },
  { nome: 'obiettivi', esegui: regolaObiettivi },
  { nome: 'riepilogo_settimanale', esegui: regolaRiepilogoSettimanale },
  { nome: 'promemoria_giornaliero', esegui: regolaPromemoriaGiornaliero },
];

const contaEsiti = (esito, risultato) => {
  const elenco = Array.isArray(risultato) ? risultato : [risultato];
  elenco.filter(Boolean).forEach((r) => {
    if (r.creata) {
      esito.create += 1;
      if (r.limitata) esito.solo_in_app += 1;
      if (r.rinviata) esito.rinviate += 1;
    } else if (r.motivo === 'duplicata') {
      esito.duplicate += 1;
    } else {
      esito.saltate += 1;
    }
  });
};

/** Genera le notifiche per un singolo utente. Non lancia mai. */
const generaPerUtente = async ({ userId, adesso = new Date(), soloRegole = null }) => {
  const esito = {
    create: 0, duplicate: 0, saltate: 0, solo_in_app: 0, rinviate: 0, errori: 0,
  };

  try {
    const preferenze = await getPreferenze(userId);
    const regole = soloRegole
      ? REGOLE.filter((r) => soloRegole.includes(r.nome))
      : REGOLE;

    for (const regola of regole) {
      try {
        contaEsiti(esito, await regola.esegui({ userId, preferenze, adesso }));
      } catch (error) {
        esito.errori += 1;
        logger.error('Regola notifiche fallita', { err: error, userId, regola: regola.nome });
      }
    }
  } catch (error) {
    esito.errori += 1;
    logger.error('Generazione notifiche fallita per utente', { err: error, userId });
  }

  return esito;
};

let esecuzioneAttiva = null;

const eseguiProcessaNotifiche = async (adesso) => {
  const riepilogo = {
    utenti: 0, create: 0, duplicate: 0, saltate: 0, solo_in_app: 0, rinviate: 0, errori: 0,
  };

  logger.info('Notifications job started');

  const utenti = await User.findAll({ attributes: ['id'] });

  for (const utente of utenti) {
    riepilogo.utenti += 1;
    const esito = await generaPerUtente({ userId: utente.id, adesso });
    riepilogo.create += esito.create;
    riepilogo.duplicate += esito.duplicate;
    riepilogo.saltate += esito.saltate;
    riepilogo.solo_in_app += esito.solo_in_app;
    riepilogo.rinviate += esito.rinviate;
    riepilogo.errori += esito.errori;
  }

  // Il push è un effetto collaterale opzionale: un suo fallimento non deve
  // invalidare le notifiche già scritte nel centro notifiche.
  try {
    riepilogo.push = await inviaNotifichePendenti({ adesso });
  } catch (error) {
    riepilogo.errori += 1;
    logger.error('Invio push fallito', { err: error });
  }

  try {
    riepilogo.potate = await potaNotificheVecchie(adesso);
  } catch (error) {
    logger.warn('Potatura notifiche non riuscita', { err: error });
  }

  logger.info('Notifications job completed', riepilogo);
  return riepilogo;
};

/**
 * Punto d'ingresso del job (cron Vercel, cron locale o invocazione manuale).
 * Come per le ricorrenti, un'esecuzione già in corso viene condivisa invece
 * di essere duplicata.
 */
const processaNotifiche = async (adesso = new Date()) => {
  if (esecuzioneAttiva) return esecuzioneAttiva;

  esecuzioneAttiva = eseguiProcessaNotifiche(adesso);
  try {
    return await esecuzioneAttiva;
  } finally {
    esecuzioneAttiva = null;
  }
};

/**
 * Valutazione "a caldo" dopo una scrittura sui movimenti: fa scattare gli
 * avvisi di budget senza aspettare il cron del giorno dopo.
 *
 * Va attesa (`await`) dal controller PRIMA di rispondere, non lasciata in
 * background: su Vercel la funzione serverless può essere congelata subito
 * dopo la risposta, e il lavoro pianificato con setImmediate resterebbe a
 * metà (query interrotte, notifiche mai scritte).
 *
 * Costo sul percorso comune: una SELECT indicizzata sul budget del mese, che
 * esce subito se l'utente non ne ha uno. Il push parte solo quando è appena
 * nata una notifica, cioè al massimo una volta per categoria e per soglia.
 *
 * Non lancia mai: gira FUORI dalla transazione del controller e non può
 * alterare saldi, esito dell'operazione o risposta HTTP.
 */
const valutaBudgetDopoMovimento = async (userId) => {
  try {
    const esito = await generaPerUtente({ userId, soloRegole: ['budget'] });
    if (esito.create > 0) {
      await inviaNotifichePendenti({ userId });
    }
    return esito;
  } catch (error) {
    logger.warn('Valutazione budget post-movimento fallita', { err: error, userId });
    return null;
  }
};

/**
 * Cron locale (solo `npm run dev` / server long-running). Su Vercel il
 * compito è di Vercel Cron, che chiama GET /api/cron/notifiche: qui non
 * verrebbe mai eseguito perché la funzione serverless non resta viva.
 *
 * Ogni ora: la generazione è idempotente, e con un controllo orario l'orario
 * di promemoria scelto dall'utente viene rispettato al minuto.
 */
function avviaCronNotifiche() {
  cron.schedule('0 * * * *', () => {
    processaNotifiche().catch((error) => {
      logger.error('Notifications job failed', { err: error });
    });
  }, {
    timezone: 'Europe/Rome',
  });
  logger.info('Notifications cron scheduled (hourly, Europe/Rome)');
}

module.exports = {
  TRAGUARDI_OBIETTIVO,
  avviaCronNotifiche,
  etichettaCategoria,
  haRegistratoMovimentiOggi,
  regolaPromemoriaGiornaliero,
  regolaBudget,
  regolaRicorrenti,
  regolaObiettivi,
  regolaRiepilogoSettimanale,
  generaPerUtente,
  processaNotifiche,
  valutaBudgetDopoMovimento,
};
