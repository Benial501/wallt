const { Op } = require('sequelize');
const { UserEntitlement, Subscription, User } = require('../models');
const logger = require('../utils/logger');
const {
  FEATURE_BANK_SYNC,
  isFeatureKey,
  ENTITLEMENT_ATTIVO,
  ENTITLEMENT_REVOCATO,
  ENTITLEMENT_SCADUTO,
  SOURCE_BETA_25,
  SOURCE_ADMIN,
  SOURCE_PREMIUM_SUBSCRIPTION,
  ENTITLEMENT_SOURCES,
  PIANO_FREE,
  PIANO_PREMIUM_BETA,
  PIANO_STAFF,
  PIANO_ETICHETTE,
  RUOLO_ADMIN,
  SUBSCRIPTION_STATUS_CON_DIRITTI,
  FEATURE_PER_PIANO,
} = require('../constants/entitlements');
const { BANK_SYNC_ENABLED } = require('../constants/appConfig');
const { getConfig } = require('./appConfig.service');
const { registraAudit, EVENTI } = require('./auditLog.service');

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  canUseFeature — l'UNICO punto di verità sui permessi
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * La domanda che il resto di WALLT pone è sempre
 *
 *     canUseFeature(userId, 'bank_sync')
 *
 * e mai `user.isPremium`. Non è una preferenza stilistica: un utente può
 * avere Bank Sync per cinque ragioni indipendenti (uno dei 25 posti beta,
 * una concessione dello staff, un abbonamento pagante, una promozione, una
 * migrazione di dati) e nessuna è deducibile dalle altre. Un booleano
 * `premium` sull'utente obbligherebbe a inventare un abbonamento finto per
 * i beta tester, e il giorno in cui arriva il pagamento reale diventerebbe
 * impossibile distinguere chi paga da chi è stato fatto passare a mano.
 *
 * La catena è quindi:
 *
 *     Subscription  →  Entitlements  →  canUseFeature  →  Features
 *
 * Bank Sync non sa nulla di piani, prezzi, Stripe o Paddle: chiede solo se
 * può. Aggiungere i pagamenti domani significa scrivere una riga in
 * `subscriptions` e chiamare `allineaEntitlementDaSubscription`; nessuna
 * riga di Bank Sync cambia.
 *
 * ── Tre condizioni, tutte necessarie ─────────────────────────────────────
 *   1. la feature è conosciuta (una stringa arbitraria dal client è rifiutata);
 *   2. l'interruttore globale è acceso (`bank_sync_enabled`): spegnerlo in
 *      produzione blocca tutti, anche chi ha l'entitlement, senza toglierlo
 *      a nessuno e senza un deploy;
 *   3. esiste un entitlement `active` e non scaduto.
 *
 * ── Scadenza pigra ───────────────────────────────────────────────────────
 * Un entitlement con `expires_at` nel passato NON è valido nemmeno se la
 * colonna `status` dice ancora `active`: la verifica guarda la data, non lo
 * stato, così non serve un cron perché una promozione scada puntuale. Lo
 * stato viene poi allineato in modo opportunistico (`expired`), e se quella
 * scrittura fallisce la decisione di accesso resta corretta comunque.
 */

/** Quale interruttore globale governa quale feature. */
const FLAG_PER_FEATURE = {
  [FEATURE_BANK_SYNC]: BANK_SYNC_ENABLED,
};

const MOTIVI = Object.freeze({
  OK: 'ok',
  FEATURE_SCONOSCIUTA: 'feature_sconosciuta',
  FEATURE_DISATTIVATA: 'feature_disattivata',
  NESSUN_ENTITLEMENT: 'nessun_entitlement',
  REVOCATO: 'entitlement_revocato',
  SCADUTO: 'entitlement_scaduto',
});

const scaduto = (entitlement, adesso) => (
  !!entitlement.expires_at && new Date(entitlement.expires_at).getTime() <= adesso.getTime()
);

/**
 * Allinea `status` a `expired` senza far fallire la lettura che l'ha
 * scoperto. La decisione di accesso non dipende da questa scrittura.
 */
const segnaScaduto = async (entitlement) => {
  try {
    await entitlement.update({ status: ENTITLEMENT_SCADUTO });
    await registraAudit({
      userId: entitlement.user_id,
      evento: EVENTI.ENTITLEMENT_SCADUTO,
      entita: 'entitlement',
      entitaId: entitlement.id,
      metadata: { feature_key: entitlement.feature_key, source: entitlement.source },
    });
  } catch (error) {
    logger.warn('Allineamento entitlement scaduto fallito', { err: error });
  }
};

/** La riga di entitlement di questo utente per questa feature, o null. */
const trovaEntitlement = (userId, featureKey, { transaction, lock = false } = {}) => (
  UserEntitlement.findOne({
    where: { user_id: userId, feature_key: featureKey },
    transaction,
    ...(lock && transaction ? { lock: transaction.LOCK.UPDATE } : {}),
  })
);

/**
 * Può questo utente usare questa feature?
 *
 * Non lancia: restituisce sempre una decisione con il motivo, perché il
 * motivo è ciò che permette all'interfaccia di proporre l'azione giusta
 * (offrire la beta è diverso da dire "funzione temporaneamente sospesa").
 *
 * @returns {Promise<{consentito: boolean, motivo: string, source: string|null,
 *   expires_at: Date|null, entitlement_id: number|null}>}
 */
async function canUseFeature(userId, featureKey, { transaction = null } = {}) {
  const negato = (motivo, extra = {}) => ({
    consentito: false, motivo, source: null, expires_at: null, entitlement_id: null, ...extra,
  });

  if (!isFeatureKey(featureKey)) return negato(MOTIVI.FEATURE_SCONOSCIUTA);

  const flag = FLAG_PER_FEATURE[featureKey];
  if (flag) {
    const attiva = await getConfig(flag);
    if (!attiva) return negato(MOTIVI.FEATURE_DISATTIVATA);
  }

  const entitlement = await trovaEntitlement(userId, featureKey, { transaction });
  if (!entitlement) return negato(MOTIVI.NESSUN_ENTITLEMENT);

  if (entitlement.status === ENTITLEMENT_REVOCATO) {
    return negato(MOTIVI.REVOCATO, { entitlement_id: entitlement.id });
  }

  const adesso = new Date();
  if (scaduto(entitlement, adesso)) {
    if (entitlement.status === ENTITLEMENT_ATTIVO) await segnaScaduto(entitlement);
    return negato(MOTIVI.SCADUTO, { entitlement_id: entitlement.id });
  }

  if (entitlement.status !== ENTITLEMENT_ATTIVO) {
    return negato(MOTIVI.SCADUTO, { entitlement_id: entitlement.id });
  }

  return {
    consentito: true,
    motivo: MOTIVI.OK,
    source: entitlement.source,
    expires_at: entitlement.expires_at,
    entitlement_id: entitlement.id,
  };
}

/**
 * Concede un entitlement.
 *
 * `beta_25` è ESCLUSA di proposito: quel `source` consuma uno dei posti a
 * numero chiuso e può essere assegnato soltanto da `betaSlots.service.js`,
 * che lo fa dentro un lock. Permetterlo qui significherebbe avere due strade
 * per occupare un posto, una delle quali non conta i posti.
 *
 * Idempotente: se l'utente ha già l'entitlement attivo non cambia nulla e
 * non sovrascrive il `source` — altrimenti una concessione amministrativa a
 * un utente che è già fra i 25 libererebbe silenziosamente un posto beta,
 * falsando la quota.
 *
 * @returns {Promise<{creato: boolean, giaAttivo: boolean, entitlement: object}>}
 */
async function grantEntitlement({
  userId,
  featureKey,
  source,
  actorUserId = null,
  expiresAt = null,
  nota = null,
  transaction = null,
}) {
  if (!isFeatureKey(featureKey)) {
    throw Object.assign(new Error('Feature non valida'), { statusCode: 400 });
  }
  if (!ENTITLEMENT_SOURCES.includes(source)) {
    throw Object.assign(new Error('Origine entitlement non valida'), { statusCode: 400 });
  }
  if (source === SOURCE_BETA_25) {
    throw Object.assign(
      new Error('Un posto della beta si assegna solo da betaSlots.service (quota a numero chiuso)'),
      { statusCode: 500 },
    );
  }

  const esistente = await trovaEntitlement(userId, featureKey, { transaction, lock: true });

  if (esistente && esistente.status === ENTITLEMENT_ATTIVO
      && !scaduto(esistente, new Date())) {
    return { creato: false, giaAttivo: true, entitlement: esistente };
  }

  if (esistente) {
    // Riattivazione: una riga revocata o scaduta torna attiva con la nuova
    // origine. Non consuma posti beta perché una riga non attiva non è
    // contata dalla quota.
    await esistente.update({
      status: ENTITLEMENT_ATTIVO,
      source,
      granted_at: new Date(),
      expires_at: expiresAt,
      revoked_at: null,
      actor_user_id: actorUserId,
      nota,
    }, { transaction });
    return { creato: false, giaAttivo: false, entitlement: esistente };
  }

  const entitlement = await UserEntitlement.create({
    user_id: userId,
    feature_key: featureKey,
    status: ENTITLEMENT_ATTIVO,
    source,
    granted_at: new Date(),
    expires_at: expiresAt,
    actor_user_id: actorUserId,
    nota,
  }, { transaction });

  return { creato: true, giaAttivo: false, entitlement };
}

/**
 * Revoca un entitlement.
 *
 * NON tocca i dati: i movimenti già importati restano, e la connessione
 * bancaria va sospesa dal chiamante (`connections.service.sospendiPerEntitlement`).
 * La separazione è voluta — un service dei permessi che chiamasse Bank Sync
 * creerebbe una dipendenza circolare — e il middleware `requireFeature`
 * blocca comunque ogni sincronizzazione anche se la sospensione non fosse
 * andata a buon fine: due barriere indipendenti sulla stessa regola.
 *
 * @returns {Promise<{eraAttivo: boolean, entitlement: object|null}>}
 */
async function revokeEntitlement({
  userId, featureKey, actorUserId = null, nota = null, transaction = null,
}) {
  if (!isFeatureKey(featureKey)) {
    throw Object.assign(new Error('Feature non valida'), { statusCode: 400 });
  }

  const esistente = await trovaEntitlement(userId, featureKey, { transaction, lock: true });
  if (!esistente) return { eraAttivo: false, entitlement: null };

  const eraAttivo = esistente.status === ENTITLEMENT_ATTIVO && !scaduto(esistente, new Date());

  await esistente.update({
    status: ENTITLEMENT_REVOCATO,
    revoked_at: new Date(),
    actor_user_id: actorUserId,
    nota: nota ?? esistente.nota,
  }, { transaction });

  return { eraAttivo, entitlement: esistente };
}

/** Tutti gli entitlement di un utente, nella forma esposta dall'API. */
async function listEntitlements(userId) {
  const righe = await UserEntitlement.findAll({
    where: { user_id: userId },
    order: [['feature_key', 'ASC']],
  });
  const adesso = new Date();
  return righe.map((e) => ({
    feature_key: e.feature_key,
    status: scaduto(e, adesso) && e.status === ENTITLEMENT_ATTIVO ? ENTITLEMENT_SCADUTO : e.status,
    source: e.source,
    granted_at: e.granted_at,
    expires_at: e.expires_at,
  }));
}

/**
 * L'abbonamento che dà diritti, se esiste. `past_due` è incluso di proposito
 * (vedi SUBSCRIPTION_STATUS_CON_DIRITTI): un pagamento in ritardo non deve
 * spegnere la sincronizzazione mentre il provider di pagamento ritenta.
 */
const subscriptionConDiritti = (userId, { transaction } = {}) => Subscription.findOne({
  where: { user_id: userId, status: { [Op.in]: SUBSCRIPTION_STATUS_CON_DIRITTI } },
  // La più recente: un utente non dovrebbe avere due abbonamenti con diritti
  // contemporaneamente, ma se succedesse vince quello creato dopo invece di
  // uno a caso.
  order: [['id', 'DESC']],
  transaction,
});

/**
 * Il piano COMMERCIALE dell'utente, che è una cosa diversa dai suoi permessi.
 *
 * Un utente a cui lo staff ha concesso Bank Sync resta sul piano `free`: non
 * ha comprato niente e non è fra i 25 della beta. Il suo accesso si legge
 * dagli entitlement, dove è registrato con `source: 'admin'`. Mescolare le
 * due cose — mostrarlo come "Premium Beta" perché ha la feature — è
 * esattamente l'errore che questa architettura esiste per evitare: renderebbe
 * impossibile sapere quanti posti beta sono davvero occupati.
 */
function derivaPiano(subscription, entitlements, { ruolo = null } = {}) {
  const betaAttiva = entitlements.some(
    (e) => e.source === SOURCE_BETA_25 && e.status === ENTITLEMENT_ATTIVO,
  );
  // Un abbonamento vero vince su tutto: se un amministratore paga davvero, è
  // un cliente pagante, e il suo piano è quello che ha comprato.
  if (subscription) return subscription.plan;
  // Lo staff prima della beta: chi amministra WALLT non occupa un posto dei
  // 25 e non deve comparire come se lo occupasse. `staff` non concede
  // niente — la feature resta decisa da `canUseFeature`.
  if (ruolo === RUOLO_ADMIN) return PIANO_STAFF;
  return betaAttiva ? PIANO_PREMIUM_BETA : PIANO_FREE;
}

async function descriviPiano(userId) {
  const [subscription, entitlements, utente] = await Promise.all([
    subscriptionConDiritti(userId),
    listEntitlements(userId),
    // Il ruolo si legge dal database, come ovunque: non arriva dal token né
    // dal chiamante (Regola 25).
    User.findByPk(userId, { attributes: ['ruolo'] }),
  ]);

  const piano = derivaPiano(subscription, entitlements, { ruolo: utente?.ruolo ?? null });

  return {
    piano,
    piano_etichetta: PIANO_ETICHETTE[piano] ?? PIANO_ETICHETTE[PIANO_FREE],
    // Gratis finché non esiste un abbonamento reale. Nessun prezzo finto.
    gratuito: !subscription,
    entitlements,
    feature_incluse_nel_piano: FEATURE_PER_PIANO[piano] ?? [],
    abbonamento: subscription ? {
      // Gli identificatori del fornitore di pagamento NON escono mai verso il
      // browser: non servono al client e sono dati di fatturazione.
      stato: subscription.status,
      periodo_fine: subscription.current_period_end,
      disdetta_a_fine_periodo: subscription.cancel_at_period_end,
    } : null,
  };
}

/**
 * Il piano di PIÙ utenti in due query.
 *
 * Esiste per la lista amministrativa, che altrimenti farebbe due query per
 * riga. Usa `derivaPiano`, la stessa funzione di `descriviPiano`: la regola
 * che decide il piano resta in un punto solo, e una lista che mostrasse un
 * piano diverso da quello della pagina del singolo utente sarebbe peggio di
 * una lista lenta.
 *
 * @returns {Promise<Map<number, {piano: string, piano_etichetta: string}>>}
 */
async function descriviPianiBatch(userIds) {
  if (!Array.isArray(userIds) || userIds.length === 0) return new Map();

  const [subscriptions, entitlements, utenti] = await Promise.all([
    Subscription.findAll({
      where: {
        user_id: { [Op.in]: userIds },
        status: { [Op.in]: SUBSCRIPTION_STATUS_CON_DIRITTI },
      },
      order: [['id', 'ASC']],
    }),
    UserEntitlement.findAll({ where: { user_id: { [Op.in]: userIds } } }),
    User.findAll({ where: { id: { [Op.in]: userIds } }, attributes: ['id', 'ruolo'] }),
  ]);

  const ruoloPerUtente = new Map(utenti.map((u) => [u.id, u.ruolo]));

  // L'ultima vince, come in `subscriptionConDiritti` (ordinata per id).
  const perUtenteSub = new Map(subscriptions.map((s) => [s.user_id, s]));
  const perUtenteEnt = new Map();
  entitlements.forEach((e) => {
    const elenco = perUtenteEnt.get(e.user_id) || [];
    elenco.push(e);
    perUtenteEnt.set(e.user_id, elenco);
  });

  const adesso = new Date();
  return new Map(userIds.map((userId) => {
    const righe = (perUtenteEnt.get(userId) || []).map((e) => ({
      source: e.source,
      status: scaduto(e, adesso) && e.status === ENTITLEMENT_ATTIVO
        ? ENTITLEMENT_SCADUTO : e.status,
    }));
    const piano = derivaPiano(
      perUtenteSub.get(userId) ?? null,
      righe,
      { ruolo: ruoloPerUtente.get(userId) ?? null },
    );
    return [userId, {
      piano,
      piano_etichetta: PIANO_ETICHETTE[piano] ?? PIANO_ETICHETTE[PIANO_FREE],
    }];
  }));
}

module.exports = {
  MOTIVI,
  FLAG_PER_FEATURE,
  canUseFeature,
  grantEntitlement,
  revokeEntitlement,
  listEntitlements,
  trovaEntitlement,
  descriviPiano,
  descriviPianiBatch,
  derivaPiano,
  subscriptionConDiritti,
  // riesportati per comodità dei chiamanti, che non devono conoscere il
  // percorso delle costanti per usare il service
  FEATURE_BANK_SYNC,
  SOURCE_ADMIN,
  SOURCE_PREMIUM_SUBSCRIPTION,
};
