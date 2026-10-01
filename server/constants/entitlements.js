/**
 * Vocabolario di piani, entitlement e feature (WALLT Premium).
 *
 * Sta in `constants/` e non dentro un service per la ragione già documentata
 * in `constants/fondoEmergenza.js` e `constants/pianoSmart.js`: questi valori
 * li usano validator, controller, service, middleware e il test-contratto del
 * client, che gira nel job "Frontend (build)" della CI dove
 * `server/node_modules` non esiste. Qui dentro non deve entrare nessun
 * `require`: il primo che aggiunge `require('../models')` rende il contratto
 * non più verificabile in CI senza che nessun test lo segnali.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * PRINCIPIO ARCHITETTURALE: il piano commerciale NON è il permesso.
 *
 *     Subscription  →  Entitlements  →  Features
 *
 * Non esiste e non deve esistere un `user.premium`. La domanda che il codice
 * pone è sempre `canUseFeature(userId, 'bank_sync')`, mai `user.isPremium`:
 * un utente può avere Bank Sync per cinque ragioni diverse (beta gratuita,
 * concessione dello staff, abbonamento pagante, promozione, migrazione) e
 * nessuna di queste è deducibile dalle altre. Il piano serve solo a *dire*
 * all'utente cosa ha; l'entitlement è ciò che *autorizza*.
 */

// ── Feature ────────────────────────────────────────────────────────────────

/** Sincronizzazione bancaria via provider Open Banking. */
const FEATURE_BANK_SYNC = 'bank_sync';

/** Tutte le feature governate da un entitlement. Elenco chiuso: una feature
 * non presente qui non è autorizzabile, e `canUseFeature` la rifiuta invece
 * di accettare una stringa arbitraria arrivata dal client. */
const FEATURE_KEYS = [FEATURE_BANK_SYNC];

const isFeatureKey = (value) => FEATURE_KEYS.includes(value);

// ── Stato di un entitlement ────────────────────────────────────────────────

const ENTITLEMENT_ATTIVO = 'active';
const ENTITLEMENT_REVOCATO = 'revoked';
const ENTITLEMENT_SCADUTO = 'expired';

const ENTITLEMENT_STATUS = [ENTITLEMENT_ATTIVO, ENTITLEMENT_REVOCATO, ENTITLEMENT_SCADUTO];

// ── Origine di un entitlement ──────────────────────────────────────────────
//
// `source` non è decorativo: è ciò che distingue chi occupa uno dei 25 posti
// beta da chi ha ricevuto l'accesso dallo staff. Tenerle separate è un
// requisito, non un dettaglio: un utente con `admin` non consuma la quota
// `beta_25` (vedi betaSlots.service.js).

/** Uno dei primi N utenti che hanno ATTIVATO Bank Sync. Consuma un posto. */
const SOURCE_BETA_25 = 'beta_25';
/** Concessione manuale di un amministratore. Non consuma posti beta. */
const SOURCE_ADMIN = 'admin';
/** Derivato da un abbonamento pagante attivo. */
const SOURCE_PREMIUM_SUBSCRIPTION = 'premium_subscription';
/** Promozione a tempo (usa `expires_at`). */
const SOURCE_PROMOTION = 'promotion';
/** Assegnato da una migrazione di dati, non da un'azione umana. */
const SOURCE_MIGRATION = 'migration';

const ENTITLEMENT_SOURCES = [
  SOURCE_BETA_25,
  SOURCE_ADMIN,
  SOURCE_PREMIUM_SUBSCRIPTION,
  SOURCE_PROMOTION,
  SOURCE_MIGRATION,
];

/**
 * Le sole origini che un utente può ottenere con un'azione propria.
 *
 * Serve a rendere impossibile per costruzione ciò che il brief vieta: il
 * client non scrive mai `source`, e l'unico endpoint che un utente può
 * chiamare per ottenere un entitlement (`POST /bank-sync/claim-beta`) ha
 * `beta_25` cablato nel servizio. `admin` e `premium_subscription` arrivano
 * solo da una rotta admin o da un evento di billing verificato.
 */
const SOURCES_AUTO_ASSEGNABILI = [SOURCE_BETA_25];

// ── Piani commerciali ──────────────────────────────────────────────────────

const PIANO_FREE = 'free';
const PIANO_PREMIUM_BETA = 'premium_beta';
const PIANO_PREMIUM = 'premium';

const PIANI = [PIANO_FREE, PIANO_PREMIUM_BETA, PIANO_PREMIUM];

/** Etichette mostrate all'utente. Italiano, come ogni testo di interfaccia. */
const PIANO_ETICHETTE = {
  [PIANO_FREE]: 'WALLT Free',
  [PIANO_PREMIUM_BETA]: 'WALLT Premium Beta',
  [PIANO_PREMIUM]: 'WALLT Premium',
};

// ── Stato di un abbonamento ────────────────────────────────────────────────

const SUB_ATTIVA = 'active';
const SUB_PROVA = 'trialing';
const SUB_INSOLUTA = 'past_due';
const SUB_ANNULLATA = 'canceled';
const SUB_INCOMPLETA = 'incomplete';

const SUBSCRIPTION_STATUS = [SUB_ATTIVA, SUB_PROVA, SUB_INSOLUTA, SUB_ANNULLATA, SUB_INCOMPLETA];

/** Gli stati che danno diritto alle feature del piano. `past_due` resta
 * incluso di proposito: un pagamento in ritardo non deve spegnere la
 * sincronizzazione bancaria mentre il provider di pagamento ritenta. */
const SUBSCRIPTION_STATUS_CON_DIRITTI = [SUB_ATTIVA, SUB_PROVA, SUB_INSOLUTA];

/** Le feature incluse in ciascun piano commerciale. È la tabella che un
 * webhook di billing consulterà per tradurre "subscription attiva" in
 * entitlement, senza che Bank Sync sappia nulla di Stripe o Paddle. */
const FEATURE_PER_PIANO = {
  [PIANO_FREE]: [],
  [PIANO_PREMIUM_BETA]: [FEATURE_BANK_SYNC],
  [PIANO_PREMIUM]: [FEATURE_BANK_SYNC],
};

// ── Richieste di accesso a Premium ─────────────────────────────────────────
//
// Una RICHIESTA non è un PERMESSO, e questa distinzione è la stessa che
// separa il piano commerciale dall'entitlement: nessun punto del codice
// legge `premium_access_requests` per decidere un accesso — la domanda resta
// `canUseFeature`. Qui si registra soltanto chi ha manifestato interesse,
// così l'amministratore può distinguere "tutti gli utenti" da "chi ha
// davvero chiesto Premium" prima che i pagamenti esistano.

/** Inviata, in attesa di una decisione dello staff. */
const RICHIESTA_PENDING = 'pending';
/** Approvata: l'entitlement è stato concesso con `source: 'admin'`. */
const RICHIESTA_APPROVED = 'approved';
/** Rifiutata. La riga resta: è lo storico della decisione. */
const RICHIESTA_REJECTED = 'rejected';
/** Ritirata dall'utente stesso. */
const RICHIESTA_CANCELLED = 'cancelled';
/** L'utente ha chiesto Premium mentre i posti beta erano ancora liberi ed è
 * entrato automaticamente. Distinto da `approved` perché nessuno ha deciso
 * nulla: lo ha fatto la quota. */
const RICHIESTA_AUTO_APPROVED_BETA = 'auto_approved_beta';

const RICHIESTA_STATI = [
  RICHIESTA_PENDING,
  RICHIESTA_APPROVED,
  RICHIESTA_REJECTED,
  RICHIESTA_CANCELLED,
  RICHIESTA_AUTO_APPROVED_BETA,
];

/** Gli stati in cui una richiesta attende ancora una decisione. Serve ai
 * contatori e a decidere se una seconda POST deve dire "già inviata". */
const RICHIESTA_STATI_APERTI = [RICHIESTA_PENDING];

/** Gli stati che rappresentano un esito positivo, comunque ottenuto. */
const RICHIESTA_STATI_CONCESSI = [RICHIESTA_APPROVED, RICHIESTA_AUTO_APPROVED_BETA];

const isRichiestaStato = (value) => RICHIESTA_STATI.includes(value);

/** Le feature per cui ha senso aprire una richiesta. Oggi una sola: un
 * valore arbitrario dal client viene rifiutato invece di creare una riga
 * che nessuna schermata saprebbe mostrare. */
const FEATURE_RICHIEDIBILI = [FEATURE_BANK_SYNC];

const isFeatureRichiedibile = (value) => FEATURE_RICHIEDIBILI.includes(value);

// ── Ruoli ──────────────────────────────────────────────────────────────────

const RUOLO_UTENTE = 'utente';
const RUOLO_ADMIN = 'admin';
const RUOLI = [RUOLO_UTENTE, RUOLO_ADMIN];

module.exports = {
  FEATURE_BANK_SYNC,
  FEATURE_KEYS,
  isFeatureKey,
  ENTITLEMENT_ATTIVO,
  ENTITLEMENT_REVOCATO,
  ENTITLEMENT_SCADUTO,
  ENTITLEMENT_STATUS,
  SOURCE_BETA_25,
  SOURCE_ADMIN,
  SOURCE_PREMIUM_SUBSCRIPTION,
  SOURCE_PROMOTION,
  SOURCE_MIGRATION,
  ENTITLEMENT_SOURCES,
  SOURCES_AUTO_ASSEGNABILI,
  PIANO_FREE,
  PIANO_PREMIUM_BETA,
  PIANO_PREMIUM,
  PIANI,
  PIANO_ETICHETTE,
  SUB_ATTIVA,
  SUB_PROVA,
  SUB_INSOLUTA,
  SUB_ANNULLATA,
  SUB_INCOMPLETA,
  SUBSCRIPTION_STATUS,
  SUBSCRIPTION_STATUS_CON_DIRITTI,
  FEATURE_PER_PIANO,
  RICHIESTA_PENDING,
  RICHIESTA_APPROVED,
  RICHIESTA_REJECTED,
  RICHIESTA_CANCELLED,
  RICHIESTA_AUTO_APPROVED_BETA,
  RICHIESTA_STATI,
  RICHIESTA_STATI_APERTI,
  RICHIESTA_STATI_CONCESSI,
  isRichiestaStato,
  FEATURE_RICHIEDIBILI,
  isFeatureRichiedibile,
  RUOLO_UTENTE,
  RUOLO_ADMIN,
  RUOLI,
};
