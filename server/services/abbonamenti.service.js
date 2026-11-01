/**
 * Punto sorgente unico degli abbonamenti (CLAUDE.md Regola 28, sul modello della
 * Regola 20). Legge i movimenti e non scrive mai su conti o movimenti: un
 * abbonamento è ciò che WALLT mostra, non denaro che si muove, e per questo non
 * entra in saldo effettivo, liquidità, patrimonio o Piano Smart.
 */
const { Op, UniqueConstraintError } = require('sequelize');
const { Abbonamento, Movimento, ScheduledPayment } = require('../models');
const logger = require('../utils/logger');
const { AppError } = require('../utils/AppError');
const { giornoLocale, FUSO_DEFAULT } = require('./notifiche/notificheTime');
const {
  aggiungiMesi, chiaveDaTesto, dataFine, pianifica, righeDoppie,
} = require('./abbonamentiRilevamento');
const { MESI_FINESTRA_LETTURA, ORIGINI, STATI } = require('../constants/abbonamenti');
const { calcolaCosti, calcolaTotali } = require('../utils/abbonamentiCosti');

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
}) => ({
  nome,
  servizio_id: servizioId ?? null,
  icona: icona ?? null,
  costo,
  periodo_mesi: periodoMesi,
  durata_mesi: durataMesi ?? null,
  // Senza durata la data di inizio non significa nulla.
  data_inizio: durataMesi == null ? null : dataInizio,
});

const crea = async (userId, dati) => {
  const campi = campiModificabili(dati);
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
  return presenta(riga.get({ plain: true }), oggiLocale());
};

const modifica = async (userId, id, dati) => {
  const riga = await trova(userId, id);
  if (riga.stato !== STATI.ATTIVO) throw new AppError('Ripristina l\'abbonamento prima di modificarlo', 409);

  const campi = campiModificabili(dati);
  const salva = (ordine) => riga.update({
    ...campi,
    ...(ordine === undefined ? {} : { ordine, chiave: chiaveManuale(campi) }),
    da_verificare: false,
    riattivato_da_addebito: false,
    annullato_il: null,
    modificato_utente_il: new Date(),
  });

  // La chiave di una riga trovata nei movimenti non cambia: rinominarla farebbe
  // ricreare lo stesso servizio alla lettura successiva.
  const chiave = chiaveManuale(campi);
  if (riga.origine === ORIGINI.MANUALE && chiave !== riga.chiave) {
    await conOrdineLibero(userId, chiave, salva);
  } else {
    await salva();
  }
  return presenta(riga.get({ plain: true }), oggiLocale());
};

const annulla = async (userId, id) => {
  const riga = await trova(userId, id);
  if (riga.stato !== STATI.ATTIVO) throw new AppError('L\'abbonamento non è attivo', 409);
  await riga.update({
    stato: STATI.ANNULLATO,
    annullato_il: oggiLocale(),
    riattivato_da_addebito: false,
    modificato_utente_il: new Date(),
  });
  return presenta(riga.get({ plain: true }), oggiLocale());
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
  elenco, crea, modifica, annulla, escludi, ripristina,
};
