/**
 * Punto sorgente unico degli abbonamenti (CLAUDE.md Regola 28, sul modello della
 * Regola 20). Legge i movimenti e non scrive mai su conti o movimenti: un
 * abbonamento è ciò che WALLT mostra, non denaro che si muove, e per questo non
 * entra in saldo effettivo, liquidità, patrimonio o Piano Smart.
 *
 * L'unica eccezione è l'addebito automatico scelto dall'utente: l'abbonamento crea
 * una programmazione mensile, cioè una REGOLA (`muoveSaldo` falso, Regola 11). Nemmeno
 * qui si scala nulla all'inserimento: lo fa il cron nel giorno del rinnovo. Su un
 * conto collegato a una banca non è permesso, perché quell'addebito lo riporta già
 * la sincronizzazione (Regola 24).
 */
const { Op, UniqueConstraintError } = require('sequelize');
const {
  sequelize, Abbonamento, Conto, Movimento, ScheduledPayment,
} = require('../models');
const logger = require('../utils/logger');
const { AppError } = require('../utils/AppError');
const { giornoLocale, FUSO_DEFAULT } = require('./notifiche/notificheTime');
const {
  aggiungiMesi, chiaveDaTesto, dataFine, pianifica, prossimoRinnovo, righeDoppie,
} = require('./abbonamentiRilevamento');
const { MESI_FINESTRA_LETTURA, ORIGINI, STATI } = require('../constants/abbonamenti');
const { calcolaCosti, calcolaTotali } = require('../utils/abbonamentiCosti');
const { contoCollegatoAConnessioneViva } = require('./bankSync/connections.service');
const { isContoFondo } = require('./fondoEmergenza.service');
const categorie = require('./categorie.service');

const STATO_FINITO = 'finito';
const TENTATIVI_ORDINE = 3;

const oggiLocale = () => giornoLocale(new Date(), FUSO_DEFAULT);
const inEuro = (centesimi) => (centesimi === null ? null : centesimi / 100);

// Il giorno italiano, non quello UTC: una modifica alle 00:30 è di oggi.
const giornoDi = (data) => (data ? giornoLocale(new Date(data), FUSO_DEFAULT) : null);

const sincronizzaDaiMovimenti = async (userId, oggi) => {
  const [addebiti, regole, righe, pagamenti] = await Promise.all([
    Movimento.findAll({
      where: {
        user_id: userId,
        tipo: 'uscita',
        ricorrente: false,
        data: { [Op.between]: [aggiungiMesi(oggi, -MESI_FINESTRA_LETTURA), oggi] },
      },
      attributes: ['id', 'data', 'importo', 'categoria', 'descrizione', 'ricorrenza_origine_id'],
      raw: true,
    }),
    // Tutte, anche sospese e terminate: serve sapere che cosa è successo a quelle
    // a cui una riga è legata, e di che frequenza è l'origine di un'occorrenza.
    Movimento.findAll({
      where: { user_id: userId, tipo: 'uscita', ricorrente: true },
      attributes: [
        'id', 'importo', 'categoria', 'descrizione', 'ricorrente_frequenza',
        'stato_ricorrenza', 'ricorrente_occorrenze_rimanenti', 'updatedAt',
      ],
      raw: true,
    }),
    Abbonamento.findAll({ where: { user_id: userId }, raw: true }),
    ScheduledPayment.findAll({
      where: { user_id: userId, movimento_id: { [Op.ne]: null } },
      attributes: ['movimento_id'],
      raw: true,
    }),
  ]);

  // Il movimento di un pagamento programmato o di una rata è un pagamento
  // singolo, non l'addebito di un abbonamento.
  const daPagamenti = new Set(pagamenti.map((p) => p.movimento_id));

  const righeLette = righe.map((r) => ({ ...r, modificato_utente_il: giornoDi(r.modificato_utente_il) }));

  // Prima di leggere gli addebiti: una riga di troppo non deve riceverne. Si cancella
  // solo ciò che è stato dedotto dai movimenti, e nessun movimento viene toccato.
  const doppie = righeDoppie(righeLette);
  if (doppie.length) {
    await Abbonamento.destroy({ where: { id: doppie.map((r) => r.id), user_id: userId } });
  }

  const { crea, aggiorna } = pianifica({
    movimenti: addebiti.filter((m) => !daPagamenti.has(m.id)),
    regole: regole.map((r) => ({ ...r, updatedAt: giornoDi(r.updatedAt) })),
    righe: righeLette.filter((r) => !doppie.includes(r)),
    oggi,
  });

  if (crea.length) {
    // Due letture simultanee calcolano le stesse righe: il vincolo UNIQUE ne
    // lascia passare una, e ON CONFLICT DO NOTHING non fa fallire l'altra.
    await Abbonamento.bulkCreate(
      crea.map((riga) => ({ ...riga, user_id: userId })),
      { ignoreDuplicates: true },
    );
  }
  await Promise.all(aggiorna.map(({ id, campi }) => (
    Abbonamento.update(campi, { where: { id, user_id: userId } })
  )));
};

const statoEffettivo = (riga, oggi) => {
  const fine = dataFine(riga);
  return riga.stato === STATI.ATTIVO && fine && oggi >= fine ? STATO_FINITO : riga.stato;
};

const presenta = (riga, oggi) => {
  const costi = calcolaCosti(riga);
  return {
    id: riga.id,
    servizio_id: riga.servizio_id,
    icona: riga.icona,
    nome: riga.nome,
    costo: Number(riga.costo),
    periodo_mesi: riga.periodo_mesi,
    durata_mesi: riga.durata_mesi,
    data_inizio: riga.data_inizio,
    data_fine: dataFine(riga),
    stato_effettivo: statoEffettivo(riga, oggi),
    origine: riga.origine,
    da_verificare: riga.da_verificare,
    riattivato_da_addebito: riga.riattivato_da_addebito,
    annullato_il: riga.annullato_il,
    ultimo_addebito_data: riga.ultimo_addebito_data,
    ultimo_addebito_importo: riga.ultimo_addebito_importo === null ? null : Number(riga.ultimo_addebito_importo),
    movimento_ricorrente_id: riga.movimento_ricorrente_id,
    giorno_rinnovo: riga.giorno_rinnovo ?? null,
    conto_id: riga.conto_id ?? null,
    addebito_automatico: Boolean(riga.addebito_automatico),
    prossimo_rinnovo: riga.stato === STATI.ATTIVO ? prossimoRinnovo(riga, oggi) : null,
    // Vero solo per il rinnovo che sta per arrivare: uno saltato in passato
    // non dice più nulla, e il rinnovo dopo torna a contare da sé.
    rinnovo_saltato: Boolean(riga.rinnovo_saltato && riga.stato === STATI.ATTIVO
      && String(riga.rinnovo_saltato).slice(0, 10) === prossimoRinnovo(riga, oggi)),
    costi: {
      al_mese: inEuro(costi.al_mese),
      in_un_anno: inEuro(costi.in_un_anno),
      in_totale: inEuro(costi.in_totale),
      peso_annuo: inEuro(costi.peso_annuo),
    },
  };
};

const elenco = async (userId) => {
  const oggi = oggiLocale();
  try {
    await sincronizzaDaiMovimenti(userId, oggi);
  } catch (err) {
    // Una lettura delle transazioni fallita non deve nascondere ciò che è già salvato.
    logger.error('Errore nella lettura degli abbonamenti dai movimenti', { err });
  }

  const righe = await Abbonamento.findAll({ where: { user_id: userId }, raw: true });
  const attive = righe.filter((riga) => statoEffettivo(riga, oggi) === STATI.ATTIVO);
  const totali = calcolaTotali(attive);

  return {
    attivi: attive
      .map((riga) => presenta(riga, oggi))
      .sort((a, b) => b.costi.in_un_anno - a.costi.in_un_anno || a.nome.localeCompare(b.nome, 'it')),
    non_attivi: righe
      .filter((riga) => statoEffettivo(riga, oggi) !== STATI.ATTIVO)
      .map((riga) => presenta(riga, oggi))
      .sort((a, b) => a.nome.localeCompare(b.nome, 'it')),
    totali: {
      al_mese: inEuro(totali.al_mese),
      all_anno: inEuro(totali.all_anno),
      se_tutti_12_mesi: inEuro(totali.se_tutti_12_mesi),
    },
  };
};

const trova = async (userId, id) => {
  const riga = await Abbonamento.findOne({ where: { id, user_id: userId } });
  if (!riga) throw new AppError('Abbonamento non trovato', 404);
  return riga;
};

const chiaveManuale = ({ servizio_id: servizioId, nome }) => (
  servizioId || chiaveDaTesto(nome) || nome.toLowerCase().slice(0, 120)
);

const prossimoOrdine = async (userId, chiave) => {
  const ultima = await Abbonamento.findOne({
    where: { user_id: userId, chiave },
    order: [['ordine', 'DESC']],
    attributes: ['ordine'],
  });
  return ultima ? ultima.ordine + 1 : 0;
};

/** Ripete se un'altra richiesta ha preso lo stesso `ordine` nel frattempo. */
const conOrdineLibero = async (userId, chiave, scrivi) => {
  for (let tentativo = 1; ; tentativo += 1) {
    try {
      // eslint-disable-next-line no-await-in-loop
      return await scrivi(await prossimoOrdine(userId, chiave));
    } catch (err) {
      if (!(err instanceof UniqueConstraintError) || tentativo === TENTATIVI_ORDINE) throw err;
    }
  }
};

const campiModificabili = ({
  nome, servizio_id: servizioId, icona, costo, periodo_mesi: periodoMesi, durata_mesi: durataMesi, data_inizio: dataInizio,
  giorno_rinnovo: giornoRinnovo, conto_id: contoId,
}) => ({
  giorno_rinnovo: giornoRinnovo ?? null,
  conto_id: contoId ?? null,
  nome,
  servizio_id: servizioId ?? null,
  icona: icona ?? null,
  costo,
  periodo_mesi: periodoMesi,
  durata_mesi: durataMesi ?? null,
  // Senza durata la data di inizio non significa nulla.
  data_inizio: durataMesi == null ? null : dataInizio,
});

const CATEGORIA_ADDEBITO = 'abbonamenti';

const verificaConto = async (userId, contoId) => {
  if (contoId == null) return null;
  const conto = await Conto.findOne({ where: { id: contoId, user_id: userId, attivo: true } });
  if (!conto) throw new AppError('Conto non trovato', 404);
  if (isContoFondo(conto)) {
    throw new AppError('Il fondo di emergenza non accetta uscite dirette: scegli un altro conto', 422);
  }
  return conto;
};

// Un addebito da WALLT su un conto collegato arriverebbe anche dalla banca: lo
// stesso euro scalato due volte. Il server lo rifiuta anche se l'interfaccia
// nasconde l'opzione, così non passa neanche da una chiamata diretta.
const verificaAddebito = async (userId, campi) => {
  if (campi.periodo_mesi !== 1) {
    throw new AppError('L\'addebito automatico è disponibile solo per gli abbonamenti mensili', 422);
  }
  if (!campi.conto_id || !campi.giorno_rinnovo) {
    throw new AppError('Per l\'addebito automatico servono il conto e il giorno del rinnovo', 422);
  }
  if (await contoCollegatoAConnessioneViva(campi.conto_id, userId)) {
    throw new AppError('Questo conto è collegato alla banca: il pagamento arriverà dalla sincronizzazione', 422);
  }
};

// La categoria eliminata dall'utente non si riscrive in automatico (Regola 18).
const categoriaAddebito = async (userId) => {
  const elenco = await categorie.list(userId);
  return elenco.some((c) => c.id === CATEGORIA_ADDEBITO && c.tipo === 'uscita') ? CATEGORIA_ADDEBITO : 'da_verificare';
};

const campiProgrammazione = (campi) => ({
  conto_id: campi.conto_id,
  importo: campi.costo,
  descrizione: campi.nome,
  ricorrente_giorno: campi.giorno_rinnovo,
  ricorrente_occorrenze_rimanenti: campi.durata_mesi ?? null,
});

// Una regola, non un movimento avvenuto: `ricorrente: true` tiene fermo il saldo
// finché il cron non genera l'occorrenza nel giorno del rinnovo.
const creaProgrammazione = async (userId, campi, transaction) => Movimento.create({
  ...campiProgrammazione(campi),
  user_id: userId,
  tipo: 'uscita',
  categoria: await categoriaAddebito(userId),
  data: oggiLocale(),
  ricorrente: true,
  ricorrente_frequenza: 'mensile',
  stato_ricorrenza: 'attiva',
}, { transaction });

// Terminata, non eliminata: le occorrenze già addebitate restano. Il legame si
// toglie, altrimenti la lettura successiva annullerebbe l'abbonamento (Regola 28).
const terminaProgrammazione = async (userId, riga, transaction) => {
  await Movimento.update(
    { stato_ricorrenza: 'terminata' },
    { where: { id: riga.movimento_ricorrente_id, user_id: userId, ricorrente: true }, transaction },
  );
  return { movimento_ricorrente_id: null, addebito_automatico: false };
};

const crea = async (userId, dati) => {
  const campi = campiModificabili(dati);
  const addebito = dati.addebito_automatico === true;
  await verificaConto(userId, campi.conto_id);
  if (addebito) await verificaAddebito(userId, campi);

  const chiave = chiaveManuale(campi);
  const riga = await conOrdineLibero(userId, chiave, (ordine) => Abbonamento.create({
    ...campi,
    user_id: userId,
    chiave,
    ordine,
    stato: STATI.ATTIVO,
    origine: ORIGINI.MANUALE,
    modificato_utente_il: new Date(),
  }));

  if (addebito) {
    try {
      await sequelize.transaction(async (transaction) => {
        const programmazione = await creaProgrammazione(userId, campi, transaction);
        await riga.update({ movimento_ricorrente_id: programmazione.id, addebito_automatico: true }, { transaction });
      });
    } catch (err) {
      // Meglio nessun abbonamento che uno che dice di addebitarsi e non lo fa.
      await riga.destroy();
      throw err;
    }
  }
  return presenta(riga.get({ plain: true }), oggiLocale());
};

const modifica = async (userId, id, dati) => {
  const riga = await trova(userId, id);
  if (riga.stato !== STATI.ATTIVO) throw new AppError('Ripristina l\'abbonamento prima di modificarlo', 409);

  const campi = campiModificabili(dati);
  // Senza il campo nel corpo la scelta già fatta resta com'è.
  const addebito = dati.addebito_automatico === undefined ? riga.addebito_automatico : dati.addebito_automatico === true;
  await verificaConto(userId, campi.conto_id);
  if (addebito) await verificaAddebito(userId, campi);
  if (addebito && !riga.addebito_automatico && riga.movimento_ricorrente_id) {
    throw new AppError('È già legato a una programmazione: gestisci l\'addebito da Programmate', 409);
  }

  await sequelize.transaction(async (transaction) => {
    let legame = {};
    if (addebito && riga.addebito_automatico) {
      // Le occorrenze rimanenti non si toccano: riscriverle farebbe ripartire il conto.
      const { ricorrente_occorrenze_rimanenti: _rimanenti, ...aggiornati } = campiProgrammazione(campi);
      await Movimento.update(aggiornati, {
        where: { id: riga.movimento_ricorrente_id, user_id: userId, ricorrente: true }, transaction,
      });
    } else if (addebito) {
      const programmazione = await creaProgrammazione(userId, campi, transaction);
      legame = { movimento_ricorrente_id: programmazione.id, addebito_automatico: true };
    } else if (riga.addebito_automatico) {
      legame = await terminaProgrammazione(userId, riga, transaction);
    }

    const salva = (ordine) => riga.update({
      ...campi,
      ...legame,
      ...(ordine === undefined ? {} : { ordine, chiave: chiaveManuale(campi) }),
      da_verificare: false,
      riattivato_da_addebito: false,
      annullato_il: null,
      modificato_utente_il: new Date(),
    }, { transaction });

    // La chiave di una riga trovata nei movimenti non cambia: rinominarla farebbe
    // ricreare lo stesso servizio alla lettura successiva.
    const chiave = chiaveManuale(campi);
    if (riga.origine === ORIGINI.MANUALE && chiave !== riga.chiave) {
      await salva(await prossimoOrdine(userId, chiave));
    } else {
      await salva();
    }
  });
  return presenta(riga.get({ plain: true }), oggiLocale());
};

const annulla = async (userId, id) => {
  const riga = await trova(userId, id);
  if (riga.stato !== STATI.ATTIVO) throw new AppError('L\'abbonamento non è attivo', 409);
  // Un addebito creato da qui si ferma insieme all'abbonamento; una programmazione
  // creata da Programmate resta dell'utente (Regola 28).
  const legame = riga.addebito_automatico ? await terminaProgrammazione(userId, riga) : {};
  await riga.update({
    ...legame,
    stato: STATI.ANNULLATO,
    annullato_il: oggiLocale(),
    riattivato_da_addebito: false,
    modificato_utente_il: new Date(),
  });
  return presenta(riga.get({ plain: true }), oggiLocale());
};

/**
 * «Questo mese non lo pago»: il prossimo rinnovo esce dagli impegni del saldo
 * effettivo senza annullare l'abbonamento. Non tocca conti né movimenti
 * (Regola 28). Con una programmazione legata il rinnovo lo governa lei, e si
 * sospende da Programmate: saltarlo qui lascerebbe il cron ad addebitarlo.
 */
const saltaRinnovo = async (userId, id, salta) => {
  const riga = await trova(userId, id);
  if (riga.stato !== STATI.ATTIVO) throw new AppError('L\'abbonamento non è attivo', 409);
  if (riga.movimento_ricorrente_id) {
    throw new AppError('Questo abbonamento ha una programmazione: sospendila da Programmate', 409);
  }
  const oggi = oggiLocale();
  const rinnovo = prossimoRinnovo(riga.get({ plain: true }), oggi);
  if (salta && !rinnovo) throw new AppError('Indica il giorno del rinnovo per poterlo saltare', 422);
  await riga.update({ rinnovo_saltato: salta ? rinnovo : null, modificato_utente_il: new Date() });
  return presenta(riga.get({ plain: true }), oggi);
};

const escludi = async (userId, id) => {
  const riga = await trova(userId, id);
  if (riga.origine !== ORIGINI.RILEVATO) {
    throw new AppError('Solo un abbonamento trovato nelle transazioni si può escludere', 422);
  }
  await riga.update({
    stato: STATI.ESCLUSO,
    riattivato_da_addebito: false,
    modificato_utente_il: new Date(),
  });
  return presenta(riga.get({ plain: true }), oggiLocale());
};

const ripristina = async (userId, id) => {
  const riga = await trova(userId, id);
  const oggi = oggiLocale();
  const fine = dataFine(riga);
  const finito = fine && oggi >= fine;
  await riga.update({
    stato: STATI.ATTIVO,
    annullato_il: null,
    riattivato_da_addebito: false,
    modificato_utente_il: new Date(),
    // Rimetterlo fra gli attivi con una scadenza passata lo farebbe sparire
    // subito: se è ancora attivo, la vecchia durata non vale più.
    ...(finito ? { durata_mesi: null, data_inizio: null, da_verificare: true } : {}),
  });
  return presenta(riga.get({ plain: true }), oggi);
};

module.exports = {
  elenco, crea, modifica, annulla, escludi, ripristina, saltaRinnovo,
};
