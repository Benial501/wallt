const { Op } = require('sequelize');
const { PremiumAccessRequest, User, UserEntitlement } = require('../models');
const logger = require('../utils/logger');
const {
  FEATURE_BANK_SYNC,
  isFeatureRichiedibile,
  RICHIESTA_PENDING,
  RICHIESTA_APPROVED,
  RICHIESTA_REJECTED,
  RICHIESTA_CANCELLED,
  RICHIESTA_AUTO_APPROVED_BETA,
  RICHIESTA_STATI,
  RICHIESTA_STATI_CONCESSI,
  SOURCE_ADMIN,
  ENTITLEMENT_ATTIVO,
} = require('../constants/entitlements');
const { grantEntitlement, descriviPianiBatch } = require('./entitlements.service');
const { registraAudit, EVENTI } = require('./auditLog.service');

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Richieste di accesso a Premium
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Risponde a una domanda che il pannello utenti non sa porre: non "chi HA
 * Premium" ma "chi lo VUOLE". Prima dei pagamenti è l'unico modo di sapere
 * se la funzione interessa, e a chi darla quando i posti beta sono finiti.
 *
 * ── Una richiesta non autorizza niente ───────────────────────────────────
 * Nessun punto del codice legge `premium_access_requests` per decidere un
 * accesso: la domanda resta `canUseFeature(userId, feature)` (Regola 23).
 * Approvare CHIAMA `grantEntitlement(source: 'admin')` ed è quella scrittura
 * ad autorizzare. Cambiare uno `status` a mano nel database non darebbe
 * accesso a nessuno, ed è il comportamento voluto: un secondo stato che
 * concede permessi sarebbe un secondo `user.premium`, cioè esattamente ciò
 * che questa architettura esiste per evitare.
 *
 * ── Perché l'approvazione non consuma un posto beta ──────────────────────
 * `grantEntitlement` RIFIUTA `source: 'beta_25'`: quella origine la scrive
 * solo `betaSlots.service` dentro il suo lock. Quindi una concessione dello
 * staff non può, per costruzione, falsare il conteggio dei 25 — non serve
 * ricordarsene qui, lo impedisce il service dei permessi.
 *
 * ── E non assegna nemmeno un posto beta ──────────────────────────────────
 * Anche quando i posti sono ancora liberi, `creaRichiesta` crea una
 * `pending` e non attiva niente: aprire una seconda strada verso `beta_25`
 * significherebbe avere due punti che distribuiscono una quota a numero
 * chiuso, uno dei quali non la conta. I posti si prendono solo da
 * `POST /bank-sync/claim-beta`.
 *
 * ── Una riga per utente e feature ────────────────────────────────────────
 * `UNIQUE(user_id, requested_feature)` sta nel database. Conseguenze volute:
 * premere due volte il pulsante non crea due righe, e una richiesta
 * rifiutata non si aggira presentandone un'altra. Lo storico della
 * decisione resta nella riga e in `audit_logs`.
 *
 * Una sola transizione riapre una riga: `cancelled → pending`. Annullare è
 * un'azione dell'utente, non una decisione dello staff, e ripresentarsi è
 * legittimo. Riaprire una `rejected` cancellerebbe invece una decisione che
 * il brief chiede esplicitamente di conservare.
 */

const ESITI_CREAZIONE = Object.freeze({
  CREATA: 'creata',
  RIAPERTA: 'riaperta',
  GIA_INVIATA: 'gia_inviata',
  GIA_DECISA: 'gia_decisa',
  GIA_ATTIVA: 'gia_attiva',
});

const errore = (messaggio, statusCode) => Object.assign(new Error(messaggio), { statusCode });

/** La forma esposta dall'API. Nessun campo interno, nessun dato di altri. */
const serializza = (riga) => ({
  id: riga.id,
  requested_feature: riga.requested_feature,
  status: riga.status,
  requested_at: riga.requested_at,
  reviewed_at: riga.reviewed_at,
  decision_reason: riga.decision_reason,
});

const normalizzaFeature = (feature) => {
  const scelta = feature ?? FEATURE_BANK_SYNC;
  if (!isFeatureRichiedibile(scelta)) {
    throw errore('Feature non valida', 400);
  }
  return scelta;
};

/**
 * Crea (o ritrova) la richiesta dell'utente.
 *
 * `userId` arriva SEMPRE dal JWT, mai dal corpo della richiesta: il
 * chiamante è il controller, che lo legge da `req.userId`. Nessun parametro
 * di questa funzione permette di scrivere per conto di qualcun altro.
 *
 * @returns {Promise<{esito: string, richiesta: object}>}
 */
async function creaRichiesta({ userId, feature = FEATURE_BANK_SYNC }) {
  const requestedFeature = normalizzaFeature(feature);

  // `findOrCreate` e non "cerca, poi inserisci": con due POST simultanee la
  // seconda viola la UNIQUE e Sequelize rilegge la riga esistente invece di
  // propagare l'errore. È il motivo per cui il vincolo sta nel database.
  const [riga, creata] = await PremiumAccessRequest.findOrCreate({
    where: { user_id: userId, requested_feature: requestedFeature },
    defaults: {
      user_id: userId,
      requested_feature: requestedFeature,
      status: RICHIESTA_PENDING,
      requested_at: new Date(),
    },
  });

  if (creata) {
    await registraAudit({
      userId,
      evento: EVENTI.RICHIESTA_CREATA,
      entita: 'premium_request',
      entitaId: riga.id,
      metadata: { requested_feature: requestedFeature },
    });
    return { esito: ESITI_CREAZIONE.CREATA, richiesta: serializza(riga) };
  }

  if (riga.status === RICHIESTA_CANCELLED) {
    await riga.update({
      status: RICHIESTA_PENDING,
      requested_at: new Date(),
      reviewed_at: null,
      reviewed_by: null,
      decision_reason: null,
    });
    await registraAudit({
      userId,
      evento: EVENTI.RICHIESTA_CREATA,
      entita: 'premium_request',
      entitaId: riga.id,
      metadata: { requested_feature: requestedFeature, riaperta: true },
    });
    return { esito: ESITI_CREAZIONE.RIAPERTA, richiesta: serializza(riga) };
  }

  if (RICHIESTA_STATI_CONCESSI.includes(riga.status)) {
    return { esito: ESITI_CREAZIONE.GIA_ATTIVA, richiesta: serializza(riga) };
  }

  if (riga.status === RICHIESTA_REJECTED) {
    return { esito: ESITI_CREAZIONE.GIA_DECISA, richiesta: serializza(riga) };
  }

  // `pending`: nessun duplicato, nessuna scrittura, nessun evento di audit
  // in più. Premere due volte il pulsante non è un fatto da registrare.
  return { esito: ESITI_CREAZIONE.GIA_INVIATA, richiesta: serializza(riga) };
}

/** Le richieste dell'utente autenticato. Mai quelle di altri. */
async function richiesteUtente(userId) {
  const righe = await PremiumAccessRequest.findAll({
    where: { user_id: userId },
    order: [['requested_at', 'DESC']],
  });
  return righe.map(serializza);
}

/**
 * Annulla la propria richiesta.
 *
 * Il filtro su `user_id` è nella `where`, non in un controllo successivo:
 * una riga di un altro utente non viene nemmeno letta, quindi non esiste un
 * ramo in cui un id altrui possa produrre una modifica. Solo una `pending`
 * si annulla — ritirare una decisione dello staff non è un'azione
 * dell'utente.
 */
async function annullaRichiesta({ userId, id }) {
  const riga = await PremiumAccessRequest.findOne({
    where: { id, user_id: userId },
  });
  if (!riga) throw errore('Richiesta non trovata', 404);

  if (riga.status !== RICHIESTA_PENDING) {
    throw errore('Questa richiesta non è più annullabile', 409);
  }

  await riga.update({ status: RICHIESTA_CANCELLED });

  await registraAudit({
    userId,
    evento: EVENTI.RICHIESTA_ANNULLATA,
    entita: 'premium_request',
    entitaId: riga.id,
    metadata: { requested_feature: riga.requested_feature },
  });

  return serializza(riga);
}

/**
 * Registra che l'utente è entrato automaticamente nella beta.
 *
 * Chiamata da `betaSlots.service` DOPO che il posto è stato assegnato. Non
 * lancia mai, per la stessa ragione di `registraAudit`: il diritto è già
 * stato concesso in una transazione conclusa, e far fallire il claim perché
 * non si è riusciti a scrivere una riga di registro significherebbe
 * mostrare un errore a chi ha appena ottenuto l'accesso.
 *
 * Non consuma nulla e non concede nulla: il posto l'ha già assegnato il
 * lock. Qui si annota soltanto che quella persona aveva chiesto Premium.
 */
async function registraAutoApprovata({ userId, feature = FEATURE_BANK_SYNC }) {
  try {
    if (!isFeatureRichiedibile(feature)) return null;

    const adesso = new Date();
    const [riga, creata] = await PremiumAccessRequest.findOrCreate({
      where: { user_id: userId, requested_feature: feature },
      defaults: {
        user_id: userId,
        requested_feature: feature,
        status: RICHIESTA_AUTO_APPROVED_BETA,
        requested_at: adesso,
        reviewed_at: adesso,
        // Nessun revisore: non ha deciso una persona, ha deciso la quota.
        reviewed_by: null,
      },
    });

    if (!creata) {
      if (RICHIESTA_STATI_CONCESSI.includes(riga.status)) return serializza(riga);
      await riga.update({
        status: RICHIESTA_AUTO_APPROVED_BETA,
        reviewed_at: adesso,
        reviewed_by: null,
        decision_reason: null,
      });
    }

    await registraAudit({
      userId,
      evento: EVENTI.RICHIESTA_BETA_AUTO,
      entita: 'premium_request',
      entitaId: riga.id,
      metadata: { requested_feature: feature, nuova: creata },
    });

    return serializza(riga);
  } catch (error) {
    logger.warn('Registrazione richiesta auto-approvata fallita', { err: error });
    return null;
  }
}

/**
 * Chiude la richiesta di un utente a cui il diritto è appena stato concesso
 * per un'altra strada (la tabella utenti dell'area amministrativa).
 *
 * Senza, restava un'incoerenza visibile: l'amministratore concedeva Bank
 * Sync dalla lista utenti e la richiesta di quella stessa persona restava
 * `pending` per sempre, con la coda che continuava a segnalare un lavoro
 * già fatto. L'invariante che si vuole è semplice — **se il diritto è stato
 * concesso dallo staff, la sua richiesta risulta approvata**.
 *
 * Chiude anche una `rejected` o una `cancelled`: concedere il diritto dopo
 * averlo negato è una decisione nuova che supera la precedente, e quella
 * precedente non va perduta — resta in `audit_logs`, dove i due eventi
 * (`premium_request_rejected`, poi `premium_request_approved`) raccontano la
 * storia per intero. Gli stati già concessi non vengono toccati.
 *
 * **Non lancia mai.** Viene chiamata dopo una concessione già riuscita: far
 * fallire la risposta perché non si è riusciti ad aggiornare una riga di
 * coda trasformerebbe un'operazione corretta in un errore.
 *
 * @returns {Promise<object|null>} la richiesta chiusa, o null se non c'era
 *   niente da chiudere.
 */
async function chiudiPerConcessione({ userId, feature = FEATURE_BANK_SYNC, actorUserId = null, motivo = null }) {
  try {
    const riga = await PremiumAccessRequest.findOne({
      where: { user_id: userId, requested_feature: feature },
    });
    if (!riga) return null;
    if (RICHIESTA_STATI_CONCESSI.includes(riga.status)) return null;

    const precedente = riga.status;
    await riga.update({
      status: RICHIESTA_APPROVED,
      reviewed_at: new Date(),
      reviewed_by: actorUserId,
      decision_reason: motivo,
    });

    await registraAudit({
      userId,
      actorUserId,
      evento: EVENTI.RICHIESTA_APPROVATA,
      entita: 'premium_request',
      entitaId: riga.id,
      metadata: {
        requested_feature: feature,
        source: SOURCE_ADMIN,
        // Dice che l'approvazione è arrivata da una concessione diretta e
        // non dal pulsante "Approva": sono due gesti diversi dello staff.
        da_concessione_diretta: true,
        stato_precedente: precedente,
      },
    });

    return serializza(riga);
  } catch (error) {
    logger.warn('Chiusura automatica della richiesta Premium fallita', { err: error });
    return null;
  }
}

/** La richiesta vista dallo staff: include il soggetto. */
const caricaPerAdmin = (id) => PremiumAccessRequest.findByPk(id, {
  include: [{ model: User, as: 'utente', attributes: ['id', 'nome', 'email'] }],
});

/**
 * Approva una richiesta e concede l'entitlement.
 *
 * L'origine è `admin`, cablata qui: non arriva né dal client né dal
 * chiamante. Conseguenza voluta — e verificata da un test — una concessione
 * approvata NON consuma uno dei 25 posti beta, e resta possibile anche dopo
 * che sono esauriti.
 */
async function approva({ id, actorUserId, motivo = null }) {
  const riga = await caricaPerAdmin(id);
  if (!riga) throw errore('Richiesta non trovata', 404);

  if (RICHIESTA_STATI_CONCESSI.includes(riga.status)) {
    throw errore('Questa richiesta è già stata approvata', 409);
  }

  const esito = await grantEntitlement({
    userId: riga.user_id,
    featureKey: riga.requested_feature,
    source: SOURCE_ADMIN,
    actorUserId,
    nota: motivo,
  });

  await riga.update({
    status: RICHIESTA_APPROVED,
    reviewed_at: new Date(),
    reviewed_by: actorUserId,
    decision_reason: motivo,
  });

  await registraAudit({
    userId: riga.user_id,
    actorUserId,
    evento: EVENTI.RICHIESTA_APPROVATA,
    entita: 'premium_request',
    entitaId: riga.id,
    metadata: {
      requested_feature: riga.requested_feature,
      source: SOURCE_ADMIN,
      entitlement_gia_attivo: esito.giaAttivo,
    },
  });

  return { richiesta: serializza(riga), entitlement: esito.entitlement, giaAttivo: esito.giaAttivo };
}

/**
 * Rifiuta una richiesta.
 *
 * NON tocca gli entitlement. Rifiutare una domanda e revocare un diritto
 * sono due operazioni diverse (brief, punto 10): un utente può avere Bank
 * Sync per un'altra ragione — un posto beta, una promozione — e rifiutargli
 * una richiesta non deve toglierglielo. Chi vuole togliere il diritto usa
 * la revoca, che è un'altra azione con un altro evento di audit.
 *
 * La riga non viene eliminata: resta lo storico della decisione.
 */
async function rifiuta({ id, actorUserId, motivo = null }) {
  const riga = await caricaPerAdmin(id);
  if (!riga) throw errore('Richiesta non trovata', 404);

  if (riga.status === RICHIESTA_REJECTED) {
    throw errore('Questa richiesta è già stata rifiutata', 409);
  }

  await riga.update({
    status: RICHIESTA_REJECTED,
    reviewed_at: new Date(),
    reviewed_by: actorUserId,
    decision_reason: motivo,
  });

  await registraAudit({
    userId: riga.user_id,
    actorUserId,
    evento: EVENTI.RICHIESTA_RIFIUTATA,
    entita: 'premium_request',
    entitaId: riga.id,
    metadata: { requested_feature: riga.requested_feature, con_motivo: !!motivo },
  });

  return { richiesta: serializza(riga) };
}

/**
 * L'elenco per il pannello amministrativo.
 *
 * Include nome, email ed entitlement del soggetto: sono i dati che servono
 * a decidere. Non include né movimenti né saldi: i dati finanziari di una
 * persona non sono dati di amministrazione.
 */
async function elenco({ stato = null, limite = 100 } = {}) {
  const where = {};
  if (stato) {
    const stati = Array.isArray(stato) ? stato : [stato];
    const validi = stati.filter((s) => RICHIESTA_STATI.includes(s));
    if (validi.length === 0) throw errore('Stato non valido', 400);
    where.status = { [Op.in]: validi };
  }

  const righe = await PremiumAccessRequest.findAll({
    where,
    include: [
      { model: User, as: 'utente', attributes: ['id', 'nome', 'email'] },
      { model: User, as: 'revisore', attributes: ['id', 'email'], required: false },
    ],
    // Le più recenti in cima, ma a parità di data le `pending` restano
    // leggibili grazie al filtro: l'ordinamento non sostituisce la coda.
    order: [['requested_at', 'DESC'], ['id', 'DESC']],
    limit: Math.min(Math.max(Number(limite) || 100, 1), 500),
  });

  const userIds = [...new Set(righe.map((r) => r.user_id))];
  // Il piano di tutti in due query, con la STESSA funzione che lo deriva
  // nella pagina del singolo utente: una lista che mostrasse un piano
  // diverso da quello della scheda sarebbe peggio di una lista lenta.
  const [entitlements, piani] = await Promise.all([
    userIds.length
      ? UserEntitlement.findAll({ where: { user_id: { [Op.in]: userIds } } })
      : [],
    descriviPianiBatch(userIds),
  ]);
  const perUtente = new Map();
  entitlements.forEach((e) => {
    const elencoUtente = perUtente.get(e.user_id) || [];
    elencoUtente.push(e);
    perUtente.set(e.user_id, elencoUtente);
  });

  return righe.map((r) => {
    const suoi = perUtente.get(r.user_id) || [];
    const feature = suoi.find((e) => e.feature_key === r.requested_feature) ?? null;
    return {
      id: r.id,
      user_id: r.user_id,
      nome: r.utente?.nome ?? null,
      email: r.utente?.email ?? null,
      piano: piani.get(r.user_id)?.piano ?? null,
      piano_etichetta: piani.get(r.user_id)?.piano_etichetta ?? null,
      requested_feature: r.requested_feature,
      status: r.status,
      requested_at: r.requested_at,
      reviewed_at: r.reviewed_at,
      reviewed_by: r.reviewed_by,
      revisore_email: r.revisore?.email ?? null,
      decision_reason: r.decision_reason,
      bank_sync: feature ? {
        stato: feature.status,
        source: feature.source,
        attivo: feature.status === ENTITLEMENT_ATTIVO,
      } : null,
    };
  });
}

/** Quante richieste per stato. Ogni stato compare, anche a zero: una
 * colonna che sparisce quando è vuota fa sembrare che il filtro sia rotto. */
async function contatori() {
  const righe = await PremiumAccessRequest.findAll({
    attributes: ['status'],
    raw: true,
  });
  const base = Object.fromEntries(RICHIESTA_STATI.map((s) => [s, 0]));
  righe.forEach((r) => {
    if (base[r.status] !== undefined) base[r.status] += 1;
  });
  return { ...base, totale: righe.length };
}

module.exports = {
  ESITI_CREAZIONE,
  creaRichiesta,
  richiesteUtente,
  annullaRichiesta,
  registraAutoApprovata,
  chiudiPerConcessione,
  approva,
  rifiuta,
  elenco,
  contatori,
  serializza,
};
