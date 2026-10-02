/**
 * Vocabolario di WALLT Premium lato client.
 *
 * Duplica di proposito le costanti del server, come già fanno
 * `utils/pianoSmart.js` e `utils/fondoEmergenza.js`: il client deve poterle
 * usare senza chiederle all'API. La divergenza è il rischio, e per questo
 * `tests/entitlementsContratto.test.js` confronta questo file con
 * `server/constants/entitlements.js` e con `server/constants/bankSync.js`, e
 * si rompe se uno dei due cambia da solo.
 *
 * ── Qui NON si decide niente ─────────────────────────────────────────────
 * Il client usa questi valori per scegliere cosa MOSTRARE: l'invito alla
 * beta, la schermata Premium, il pulsante "Ricollega" invece di "Riprova".
 * I permessi li applica il server, che non si fida di nulla di ciò che
 * arriva da qui. Se questo file mentisse, l'utente vedrebbe un pulsante che
 * riceve un 403 — non otterrebbe un accesso.
 */

// ── Feature ────────────────────────────────────────────────────────────────

export const FEATURE_BANK_SYNC = 'bank_sync';
export const FEATURE_KEYS = Object.freeze([FEATURE_BANK_SYNC]);

// ── Piani ──────────────────────────────────────────────────────────────────

export const PIANO_FREE = 'free';
export const PIANO_PREMIUM_BETA = 'premium_beta';
export const PIANO_PREMIUM = 'premium';
/** Chi lavora a WALLT. Piano derivato dal ruolo, mai scritto negli
 * abbonamenti, e come ogni piano non autorizza niente: le feature restano
 * una concessione esplicita. */
export const PIANO_STAFF = 'staff';
export const PIANI = Object.freeze([PIANO_FREE, PIANO_PREMIUM_BETA, PIANO_PREMIUM, PIANO_STAFF]);

/** Le etichette mostrate all'utente. Stesse stringhe del server, così la
 * pagina del piano non cambia nome al piano fra due schermate. */
export const PIANO_ETICHETTE = Object.freeze({
  [PIANO_FREE]: 'WALLT Free',
  [PIANO_PREMIUM_BETA]: 'WALLT Premium Beta',
  [PIANO_PREMIUM]: 'WALLT Premium',
  [PIANO_STAFF]: 'WALLT Premium — staff',
});

// ── Origine del permesso ───────────────────────────────────────────────────

export const SOURCE_BETA_25 = 'beta_25';
export const SOURCE_ADMIN = 'admin';
export const SOURCE_PREMIUM_SUBSCRIPTION = 'premium_subscription';
export const SOURCE_PROMOTION = 'promotion';
export const SOURCE_MIGRATION = 'migration';
export const ENTITLEMENT_SOURCES = Object.freeze([
  SOURCE_BETA_25, SOURCE_ADMIN, SOURCE_PREMIUM_SUBSCRIPTION,
  SOURCE_PROMOTION, SOURCE_MIGRATION,
]);

/**
 * Come si spiega all'utente da dove viene il suo accesso.
 *
 * Serve a non mentirgli: chi ha ricevuto l'accesso dallo staff non è "fra i
 * primi 25" e non deve leggerlo, e chi paga non deve vedersi chiamare beta
 * tester.
 */
export const SOURCE_ETICHETTE = Object.freeze({
  [SOURCE_BETA_25]: 'Incluso nella beta gratuita',
  [SOURCE_ADMIN]: 'Attivato dallo staff WALLT',
  [SOURCE_PREMIUM_SUBSCRIPTION]: 'Incluso nel tuo abbonamento',
  [SOURCE_PROMOTION]: 'Promozione a tempo',
  [SOURCE_MIGRATION]: 'Accesso mantenuto',
});

// ── Richieste di accesso a Premium ─────────────────────────────────────────
//
// Una richiesta NON è un permesso: serve a far sapere allo staff che qualcuno
// vuole Premium, e a far sapere all'utente che la sua richiesta è arrivata.
// L'accesso continua a dipendere solo dall'entitlement.

export const RICHIESTA_PENDING = 'pending';
export const RICHIESTA_APPROVED = 'approved';
export const RICHIESTA_REJECTED = 'rejected';
export const RICHIESTA_CANCELLED = 'cancelled';
export const RICHIESTA_AUTO_APPROVED_BETA = 'auto_approved_beta';

export const RICHIESTA_STATI = Object.freeze([
  RICHIESTA_PENDING, RICHIESTA_APPROVED, RICHIESTA_REJECTED,
  RICHIESTA_CANCELLED, RICHIESTA_AUTO_APPROVED_BETA,
]);

/** Come si chiama ciascuno stato nel pannello di amministrazione. */
export const RICHIESTA_ETICHETTE = Object.freeze({
  [RICHIESTA_PENDING]: 'In attesa',
  [RICHIESTA_APPROVED]: 'Approvata',
  [RICHIESTA_REJECTED]: 'Rifiutata',
  [RICHIESTA_CANCELLED]: 'Annullata',
  [RICHIESTA_AUTO_APPROVED_BETA]: 'Beta automatica',
});

/**
 * Cosa legge l'UTENTE sulla propria richiesta.
 *
 * Sono frasi diverse dalle etichette amministrative perché rispondono a una
 * domanda diversa: "Approvata" descrive la riga, "Hai accesso a WALLT
 * Premium" descrive la sua situazione.
 */
export const RICHIESTA_MESSAGGI_UTENTE = Object.freeze({
  [RICHIESTA_PENDING]: {
    titolo: 'Richiesta inviata',
    testo: 'Ti faremo sapere quando potrai accedere a WALLT Premium.',
  },
  [RICHIESTA_APPROVED]: {
    titolo: 'Richiesta approvata',
    testo: 'Hai accesso a WALLT Premium: puoi collegare il tuo conto bancario.',
  },
  [RICHIESTA_REJECTED]: {
    titolo: 'Richiesta valutata',
    testo: 'Per ora non è stato possibile darti accesso. Ti avviseremo quando WALLT Premium sarà disponibile per tutti.',
  },
  [RICHIESTA_CANCELLED]: {
    titolo: 'Richiesta annullata',
    testo: 'Puoi richiedere di nuovo l\'accesso quando vuoi.',
  },
  [RICHIESTA_AUTO_APPROVED_BETA]: {
    titolo: 'Sei nella beta gratuita',
    testo: 'La tua richiesta è stata accolta automaticamente: hai uno dei posti gratuiti.',
  },
});

/** Una richiesta che attende ancora una decisione. */
export const RICHIESTA_IN_ATTESA = (stato) => stato === RICHIESTA_PENDING;

/** Si può (ri)chiedere l'accesso? Solo se non esiste una richiesta, o se
 * l'utente l'aveva annullata lui stesso. Dopo una decisione dello staff il
 * pulsante non ricompare: la decisione resta. */
export const puoRichiedere = (richiesta) => (
  !richiesta || richiesta.status === RICHIESTA_CANCELLED
);

// ── Stato di una connessione bancaria ──────────────────────────────────────

export const STATO_IN_ATTESA = 'in_attesa';
export const STATO_ATTIVA = 'attiva';
export const STATO_CONSENSO_SCADUTO = 'consenso_scaduto';
export const STATO_ERRORE = 'errore';
export const STATO_SOSPESA_ENTITLEMENT = 'sospesa_entitlement';
export const STATO_REVOCATA = 'revocata';
export const CONNECTION_STATUS = Object.freeze([
  STATO_IN_ATTESA, STATO_ATTIVA, STATO_CONSENSO_SCADUTO,
  STATO_ERRORE, STATO_SOSPESA_ENTITLEMENT, STATO_REVOCATA,
]);

// ── Motivi per cui l'accesso è negato ──────────────────────────────────────
//
// Arrivano nel campo `motivo` di una risposta 403. Sono ciò che permette di
// mostrare la schermata giusta senza una seconda chiamata.

export const MOTIVO_OK = 'ok';
export const MOTIVO_FEATURE_SCONOSCIUTA = 'feature_sconosciuta';
export const MOTIVO_FEATURE_DISATTIVATA = 'feature_disattivata';
export const MOTIVO_NESSUN_ENTITLEMENT = 'nessun_entitlement';
export const MOTIVO_REVOCATO = 'entitlement_revocato';
export const MOTIVO_SCADUTO = 'entitlement_scaduto';

// ── Codici d'errore della sincronizzazione ─────────────────────────────────

export const ERR_NETWORK = 'NETWORK_ERROR';
export const ERR_PROVIDER = 'PROVIDER_ERROR';
export const ERR_RATE_LIMIT = 'RATE_LIMIT';
export const ERR_CONSENT_EXPIRED = 'CONSENT_EXPIRED';
export const ERR_AUTHORIZATION_REVOKED = 'AUTHORIZATION_REVOKED';
export const ERR_BANK_UNAVAILABLE = 'BANK_UNAVAILABLE';
export const ERR_SYNC_FAILED = 'SYNC_FAILED';
export const ERR_NO_TRANSACTIONS = 'NO_TRANSACTIONS';
export const ERR_SYNC_IN_CORSO = 'SYNC_IN_CORSO';
export const ERR_COOLDOWN = 'COOLDOWN';
export const ERR_CONFIG = 'PROVIDER_NON_CONFIGURATO';

export const SYNC_ERROR_CODES = Object.freeze([
  ERR_NETWORK, ERR_PROVIDER, ERR_RATE_LIMIT, ERR_CONSENT_EXPIRED,
  ERR_AUTHORIZATION_REVOKED, ERR_BANK_UNAVAILABLE, ERR_SYNC_FAILED,
  ERR_NO_TRANSACTIONS, ERR_SYNC_IN_CORSO, ERR_COOLDOWN, ERR_CONFIG,
]);

export const ERRORI_RICHIEDONO_RICONNESSIONE = Object.freeze([
  ERR_CONSENT_EXPIRED, ERR_AUTHORIZATION_REVOKED,
]);

/**
 * Cosa l'utente legge, e cosa può fare, per ciascun codice d'errore.
 *
 * Il brief è esplicito su questo: "Connessione scaduta → [Ricollega]" è una
 * situazione DIVERSA da "La banca è temporaneamente non disponibile →
 * [Riprova]", e un "Errore generico" per tutte e due porterebbe l'utente a
 * premere il pulsante sbagliato. `azione` è ciò che la UI mostra.
 *
 * Nessun messaggio contiene dettagli tecnici: lo stack, la risposta HTTP
 * grezza del provider e i suoi identificatori restano nei log del server.
 */
export const ERRORE_MESSAGGI = Object.freeze({
  [ERR_CONSENT_EXPIRED]: {
    titolo: 'Il collegamento con la banca è scaduto',
    testo: 'Le banche chiedono di riconfermare l\'autorizzazione ogni 90 giorni. I movimenti già importati sono al sicuro.',
    azione: 'ricollega',
  },
  [ERR_AUTHORIZATION_REVOKED]: {
    titolo: 'L\'autorizzazione è stata revocata',
    testo: 'Il collegamento non è più valido. Puoi ricollegare il conto quando vuoi: i dati già importati restano.',
    azione: 'ricollega',
  },
  [ERR_BANK_UNAVAILABLE]: {
    titolo: 'La banca non risponde',
    testo: 'È un problema temporaneo della banca, non dei tuoi dati. Riprova fra qualche minuto.',
    azione: 'riprova',
  },
  [ERR_NETWORK]: {
    titolo: 'Connessione non raggiungibile',
    testo: 'Non è stato possibile contattare la banca. Controlla la connessione e riprova.',
    azione: 'riprova',
  },
  [ERR_RATE_LIMIT]: {
    titolo: 'Troppe richieste alla banca',
    testo: 'La banca limita quante volte al giorno possiamo chiedere i tuoi movimenti. Riprova più tardi.',
    azione: 'attendi',
  },
  [ERR_COOLDOWN]: {
    titolo: 'Hai sincronizzato di recente',
    testo: 'I tuoi movimenti sono già aggiornati. Riprova fra qualche minuto.',
    azione: 'attendi',
  },
  [ERR_SYNC_IN_CORSO]: {
    titolo: 'Sincronizzazione già in corso',
    testo: 'Stiamo già aggiornando questo conto. Fra poco vedrai i movimenti nuovi.',
    azione: 'attendi',
  },
  [ERR_NO_TRANSACTIONS]: {
    titolo: 'Nessun movimento nuovo',
    testo: 'La banca non ha registrato nuove operazioni da sincronizzare.',
    azione: 'nessuna',
  },
  [ERR_CONFIG]: {
    titolo: 'Funzione non ancora disponibile',
    testo: 'La sincronizzazione bancaria non è attiva su questo ambiente.',
    azione: 'nessuna',
  },
  [ERR_PROVIDER]: {
    titolo: 'Non è stato possibile aggiornare il conto',
    testo: 'I tuoi dati precedenti sono ancora disponibili. Riprova fra poco.',
    azione: 'riprova',
  },
  [ERR_SYNC_FAILED]: {
    titolo: 'Non è stato possibile aggiornare il conto',
    testo: 'I tuoi dati precedenti sono ancora disponibili. Riprova fra poco.',
    azione: 'riprova',
  },
});

/** Il messaggio da mostrare per un codice, con un ripiego che non mente mai
 * sulla sorte dei dati. */
export const messaggioErrore = (codice) => ERRORE_MESSAGGI[codice] ?? {
  titolo: 'Non è stato possibile aggiornare il conto',
  testo: 'I tuoi dati precedenti sono ancora disponibili. Riprova fra poco.',
  azione: 'riprova',
};

export const richiedeRiconnessione = (codice) => ERRORI_RICHIEDONO_RICONNESSIONE.includes(codice);

/** Vero se questo conto WALLT è alimentato da una connessione bancaria. Serve
 * a non offrire su un conto sincronizzato azioni che il server rifiuterebbe
 * o che la banca sovrascriverebbe alla sincronizzazione successiva. */
export const isContoSincronizzato = (conto, connessione) => (
  !!conto && !!connessione && connessione.conto_id === conto.id
);

/** Un solo conto bancario sincronizzato per utente. Il limite lo impone il
 * server (indice parziale nel database): qui serve solo a mostrare "Gestisci
 * conto" invece di "Aggiungi un altro conto". */
export const MAX_CONNESSIONI_PER_UTENTE = 1;
