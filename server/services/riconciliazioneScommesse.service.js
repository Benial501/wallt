/**
 * Riconciliazione fra i movimenti di scommesse e il conto collegato via
 * Bank Sync — punto sorgente unico (Regola 20 applicata a questo incrocio).
 *
 * Un deposito su una piattaforma di gioco fatto con la carta di un conto
 * collegato è UNA operazione reale che due fonti indipendenti possono
 * raccontare: l'utente, subito, dalla sezione Scommesse; la banca, fino a
 * qualche giorno dopo, quando la contabilizza. Senza questo servizio il
 * racconto diventa due movimenti per un solo euro speso.
 *
 * Questo modulo risponde a quattro domande e a nessun'altra:
 *
 *  1. `adottaMovimentiGiaSegnati` — questa transazione bancaria sta ridicendo
 *     un movimento che l'utente ha già segnato a mano? Se sì, la riga
 *     esistente ADOTTA l'identità bancaria invece che nascerne una seconda.
 *  2. `listaDaConfermare` — quali righe portate dalla banca aspettano di
 *     sapere su quale piattaforma è finito il denaro?
 *  3. `confermaAttribuzione` — attribuisci questa riga a questa piattaforma.
 *  4. `archiviaProposta` — questa riga non riguarda nessuna piattaforma.
 *
 * Nessun calcolo finanziario proprio: i saldi restano di chi li possiede
 * (`scommesse.controller.js` per la piattaforma, la banca per il conto
 * collegato).
 */

const { Op } = require('sequelize');
const { AppError } = require('../utils/AppError');
const {
  sequelize, Movimento, PiattaformaScommesse, MovimentoScommesse,
} = require('../models');
const {
  TX_BOOKED, ORIGINE_OPEN_BANKING, GIORNI_ADOZIONE_PRIMA, GIORNI_ADOZIONE_DOPO,
} = require('../constants/bankSync');
const {
  ensureContoForPiattaforma, syncContoSaldoFromPiattaforma,
} = require('./scommesseContoSync.service');
const { creaNotifica, getPreferenze } = require('./notifiche/NotificheService');
const { giornoLocale, FUSO_DEFAULT } = require('./notifiche/notificheTime');
const logger = require('../utils/logger');

const CATEGORIA_DEPOSITO = 'deposito_scommesse';
const CATEGORIA_PRELIEVO = 'prelievo_scommesse';
const CATEGORIE_SCOMMESSE = [CATEGORIA_DEPOSITO, CATEGORIA_PRELIEVO];

const centesimi = (valore) => Math.round(Number(valore) * 100);

const spostaGiorni = (data, giorni) => {
  const d = new Date(`${data}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + giorni);
  return d.toISOString().slice(0, 10);
};

const distanzaGiorni = (a, b) => Math.abs(
  (new Date(`${a}T00:00:00Z`) - new Date(`${b}T00:00:00Z`)) / 86400000,
);

/**
 * Il verso deve combaciare, non solo l'importo: a un'uscita bancaria
 * corrisponde un deposito che PARTE dal conto collegato, a un'entrata un
 * prelievo che ci ARRIVA. Senza questo controllo un prelievo da 50 €
 * potrebbe adottare l'identità di un deposito da 50 €.
 */
const versoCombacia = (candidato, manuale, contoId) => {
  if (candidato.tipo === 'uscita') {
    return manuale.categoria === CATEGORIA_DEPOSITO && manuale.conto_id === contoId;
  }
  if (candidato.tipo === 'entrata') {
    return manuale.categoria === CATEGORIA_PRELIEVO && manuale.conto_destinazione_id === contoId;
  }
  return false;
};

/**
 * Adotta, dove possibile, i movimenti che l'utente ha già segnato.
 *
 * Riceve i candidati normalizzati e restituisce quelli che restano davvero da
 * importare. Va chiamata DOPO la deduplica sugli id già presenti (una riga
 * già importata non deve adottare niente) e PRIMA del `DuplicateChecker`,
 * che confronta anche le descrizioni: "Deposito SNAI" e "SNAI SPA PAGAMENTO"
 * non si somigliano abbastanza, e per le righe con id stabile non girerebbe
 * nemmeno.
 *
 * Solo i candidati CON `external_transaction_id` possono adottare: è quell'id
 * che, insieme all'indice UNIQUE parziale, rende la riga adottata immune a
 * una risincronizzazione. Senza id non ci sarebbe nulla da attaccare, e la
 * riga resterebbe adottabile a ogni giro.
 */
async function adottaMovimentiGiaSegnati({ userId, connessione, candidati }) {
  const adottabili = candidati.filter((c) => c.external_transaction_id);
  if (adottabili.length === 0) {
    return { daImportare: candidati, riconciliati: 0 };
  }

  const date = adottabili.map((c) => c.data).sort();
  const dal = spostaGiorni(date[0], -GIORNI_ADOZIONE_PRIMA);
  const al = spostaGiorni(date[date.length - 1], GIORNI_ADOZIONE_DOPO);

  const manuali = await Movimento.findAll({
    where: {
      user_id: userId,
      tipo: 'trasferimento',
      categoria: { [Op.in]: CATEGORIE_SCOMMESSE },
      external_transaction_id: null,
      data: { [Op.between]: [dal, al] },
      [Op.or]: [
        { conto_id: connessione.conto_id },
        { conto_destinazione_id: connessione.conto_id },
      ],
    },
    order: [['data', 'ASC'], ['id', 'ASC']],
  });

  if (manuali.length === 0) {
    return { daImportare: candidati, riconciliati: 0 };
  }

  const consumati = new Set();
  const adottati = new Set();
  let riconciliati = 0;

  for (const candidato of adottabili) {
    const compatibili = manuali.filter((m) => !consumati.has(m.id)
      && versoCombacia(candidato, m, connessione.conto_id)
      && centesimi(m.importo) === centesimi(candidato.importo)
      && m.data >= spostaGiorni(candidato.data, -GIORNI_ADOZIONE_PRIMA)
      && m.data <= spostaGiorni(candidato.data, GIORNI_ADOZIONE_DOPO));

    if (compatibili.length === 0) continue;

    // A parità di candidati vince la data più vicina, poi il più vecchio:
    // due depositi veri dello stesso importo restano due movimenti, e
    // ciascuna transazione bancaria ne adotta uno solo.
    compatibili.sort((a, b) => distanzaGiorni(a.data, candidato.data)
      - distanzaGiorni(b.data, candidato.data) || a.id - b.id);

    const scelto = compatibili[0];
    consumati.add(scelto.id);
    adottati.add(candidato.external_transaction_id);

    // Non si tocca `origine`: la riga l'ha scritta l'utente, e
    // `eliminaDatiImportati` filtra proprio per `origine`. Marcarla
    // `open_banking` farebbe sì che "elimina i dati importati" cancelli un
    // movimento inserito a mano, togliendo alla piattaforma un accredito che
    // nessuno rimetterebbe.
    await scelto.update({
      bank_connection_id: connessione.id,
      external_transaction_id: candidato.external_transaction_id,
      stato_banca: TX_BOOKED,
    });

    riconciliati += 1;
  }

  return {
    daImportare: candidati.filter((c) => !adottati.has(c.external_transaction_id)),
    riconciliati,
  };
}

/**
 * Il filtro che definisce "proposta aperta".
 *
 * Una riga è una domanda aperta finché è un'uscita o un'entrata portata dal
 * conto collegato con una categoria di gioco: appena viene confermata
 * diventa un `trasferimento` verso il conto di gioco, e smette di
 * soddisfare questa condizione senza bisogno di ricordarselo altrove.
 */
const filtroProposte = (userId) => ({
  user_id: userId,
  origine: ORIGINE_OPEN_BANKING,
  tipo: { [Op.in]: ['uscita', 'entrata'] },
  categoria: { [Op.in]: CATEGORIE_SCOMMESSE },
  scommesse_proposta_archiviata: false,
});

/** Le righe bancarie che aspettano di sapere a quale piattaforma appartengono. */
async function listaDaConfermare(userId) {
  const righe = await Movimento.findAll({
    where: filtroProposte(userId),
    order: [['data', 'DESC'], ['id', 'DESC']],
    limit: 50,
  });

  return righe.map((m) => ({
    id: m.id,
    tipo: m.tipo,
    categoria: m.categoria,
    importo: Number(m.importo),
    data: m.data,
    descrizione: m.descrizione,
    conto_id: m.conto_id,
  }));
}

/**
 * Attribuisce una riga bancaria a una piattaforma.
 *
 * Trasforma la riga invece di crearne una nuova: il movimento reale è uno, e
 * l'unica cosa che mancava era sapere dove fosse finito il denaro.
 *
 * Il saldo del conto collegato NON viene toccato: per un conto sincronizzato
 * la verità sul saldo la dice la banca, che quell'uscita l'ha già riportata
 * (Regola 24). È l'asimmetria rispetto al percorso manuale, dove invece è
 * WALLT a scalare il conto perché la banca non ha ancora detto nulla.
 */
async function confermaAttribuzione({ userId, movimentoId, piattaformaId }) {
  return sequelize.transaction(async (transaction) => {
    const movimento = await Movimento.findOne({
      where: { id: movimentoId, ...filtroProposte(userId) },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!movimento) {
      throw new AppError('Proposta non trovata', 404);
    }

    const piattaforma = await PiattaformaScommesse.findOne({
      where: { id: piattaformaId, user_id: userId, attiva: true },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!piattaforma) {
      throw new AppError('Piattaforma non trovata', 404);
    }

    const importo = Number(movimento.importo);
    const deposito = movimento.categoria === CATEGORIA_DEPOSITO;

    if (!deposito && Number(piattaforma.saldo) < importo) {
      // Il prelievo è avvenuto davvero: la banca lo ha visto. Ma il saldo
      // registrato in WALLT non lo giustifica, e accettarlo produrrebbe un
      // saldo di gioco negativo, che non esiste. Meglio dirlo.
      throw new AppError(
        'Il saldo registrato per questa piattaforma è inferiore al prelievo: '
        + 'aggiorna prima il saldo della piattaforma, poi conferma.',
        422,
      );
    }

    const contoGioco = piattaforma.conto_id
      ? { id: piattaforma.conto_id }
      : await ensureContoForPiattaforma(piattaforma, transaction);

    await movimento.update({
      tipo: 'trasferimento',
      conto_destinazione_id: deposito ? contoGioco.id : movimento.conto_id,
      conto_id: deposito ? movimento.conto_id : contoGioco.id,
    }, { transaction });

    await MovimentoScommesse.create({
      piattaforma_id: piattaforma.id,
      user_id: userId,
      tipo: deposito ? 'deposito' : 'prelievo',
      importo,
      data: movimento.data,
      nota: 'Confermato dal conto collegato',
    }, { transaction });

    await piattaforma.update({
      saldo: deposito ? Number(piattaforma.saldo) + importo : Number(piattaforma.saldo) - importo,
    }, { transaction });

    await syncContoSaldoFromPiattaforma(piattaforma, transaction);

    return { movimento, piattaforma };
  });
}

const TIPO_NOTIFICA_DA_CONFERMARE = 'scommesse_da_confermare';

/**
 * Avvisa che ci sono conferme in sospeso.
 *
 * Una notifica per GIORNATA, non per riga: con il tetto anti-spam di una
 * notifica `normale` al giorno (Regola 14), una per riga significherebbe che
 * tutte tranne la prima restano invisibili nel centro notifiche. La
 * `dedupe_key` sul giorno locale dell'utente è ciò che lo garantisce, senza
 * che nessuno debba ricordarsi di aver già avvisato.
 *
 * Non lancia mai: è un avviso, e non deve poter far risultare fallita una
 * sincronizzazione che ha scritto i movimenti correttamente — stesso
 * principio dell'hook sul budget dopo un movimento.
 */
async function notificaProposteAperte({ userId, adesso = new Date() }) {
  try {
    const aperte = await Movimento.count({ where: filtroProposte(userId) });
    if (aperte === 0) return { creata: false, motivo: 'nessuna_proposta' };

    const preferenze = await getPreferenze(userId);
    const giorno = giornoLocale(adesso, preferenze.timezone || FUSO_DEFAULT);

    return await creaNotifica({
      userId,
      tipo: TIPO_NOTIFICA_DA_CONFERMARE,
      dedupeKey: `${TIPO_NOTIFICA_DA_CONFERMARE}:${giorno}`,
      titolo: aperte === 1 ? 'Un deposito da confermare' : 'Depositi da confermare',
      messaggio: aperte === 1
        ? 'La banca ha registrato un’operazione verso una piattaforma di gioco. '
          + 'Confermi su quale piattaforma è andata?'
        : `La banca ha registrato ${aperte} operazioni verso piattaforme di gioco. `
          + 'Confermi su quali piattaforme sono andate?',
      link: '/scommesse',
      preferenze,
      adesso,
    });
  } catch (error) {
    logger.warn('Notifica conferme scommesse non inviata', { user_id: userId, err: error });
    return { creata: false, motivo: 'errore' };
  }
}

/** "Non è un deposito di gioco": la riga resta, la domanda si spegne. */
async function archiviaProposta({ userId, movimentoId }) {
  const movimento = await Movimento.findOne({
    where: { id: movimentoId, ...filtroProposte(userId) },
  });
  if (!movimento) {
    throw new AppError('Proposta non trovata', 404);
  }
  await movimento.update({ scommesse_proposta_archiviata: true });
  return movimento;
}

module.exports = {
  adottaMovimentiGiaSegnati,
  notificaProposteAperte,
  TIPO_NOTIFICA_DA_CONFERMARE,
  listaDaConfermare,
  confermaAttribuzione,
  archiviaProposta,
  CATEGORIA_DEPOSITO,
  CATEGORIA_PRELIEVO,
  CATEGORIE_SCOMMESSE,
};
