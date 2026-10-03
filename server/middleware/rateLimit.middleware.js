const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const {
  consumeAuthRateLimit,
  decrementAuthRateLimit,
  resetAuthRateLimit,
} = require('../services/authRateLimit.service');

const RATE_LIMIT_MESSAGE = {
  error: 'Troppi tentativi. Riprova più tardi.',
};

// req.userId ha priorità (rate limit per-utente su rotte autenticate); per le
// rotte pubbliche (login/register/forgot-password) usa l'IP normalizzato con
// l'helper ufficiale, che collassa un intero blocco IPv6 in una sola chiave
// invece di farne una per indirizzo (altrimenti un attaccante potrebbe
// bypassare il rate limit ruotando indirizzi IPv6 dello stesso /64).
const userOrIpKey = (req) => (req.userId ? String(req.userId) : ipKeyGenerator(req.ip));

/**
 * Bypass dei limiti per-utente nella suite di test.
 *
 * Serve a un problema reale dell'ambiente di test, non a indebolire la
 * sicurezza: `tests/setup.js` fa `TRUNCATE ... RESTART IDENTITY` prima di
 * ogni test, quindi `users.id` riparte da 1 e utenti di test DIVERSI
 * ricevono lo stesso id. Dato che la chiave del limite è `req.userId`, un
 * limite per-utente diventa di fatto un limite per-suite, e un test fallisce
 * con 429 per una ragione che non ha nulla a che vedere con ciò che verifica.
 *
 * Due vincoli lo rendono innocuo:
 *  - è attivo SOLO con `NODE_ENV === 'test'`: in sviluppo e in produzione la
 *    funzione restituisce sempre false;
 *  - `RATE_LIMIT_NEI_TEST=on` lo disattiva, ed è così che
 *    `tests/premiumSicurezza.test.js` verifica che i limiti scattino davvero.
 *
 * Si applica solo ai limitatori per-utente su rotte autenticate. I limiti
 * delle rotte pubbliche di autenticazione NON lo usano: la loro chiave è
 * l'IP, non cambia fra i test, e `tests/authRateLimit.test.js` li verifica.
 */
const bypassNeiTest = () => process.env.NODE_ENV === 'test'
  && process.env.RATE_LIMIT_NEI_TEST !== 'on';

const createLimiter = ({
  windowMs, max, message, keyGenerator, store, bypassabileNeiTest = false,
}) => rateLimit({
  windowMs,
  max,
  standardHeaders: true,
  legacyHeaders: false,
  message: message || RATE_LIMIT_MESSAGE,
  keyGenerator: keyGenerator || userOrIpKey,
  ...(store && { store }),
  ...(bypassabileNeiTest ? { skip: bypassNeiTest } : {}),
});

class PostgresRateLimitStore {
  constructor({ route, windowMs }) {
    this.route = route;
    this.windowMs = windowMs;
    this.localKeys = false;
    this.prefix = `postgres:${route}:`;
  }

  init(options) {
    this.windowMs = options.windowMs;
  }

  increment(key) {
    return consumeAuthRateLimit({ key, route: this.route, windowMs: this.windowMs });
  }

  decrement(key) {
    return decrementAuthRateLimit({ key, route: this.route, windowMs: this.windowMs });
  }

  resetKey(key) {
    return resetAuthRateLimit({ key, route: this.route });
  }
}

const createPersistentAuthLimiter = ({
  route = 'public-auth',
  windowMs = 15 * 60 * 1000,
  max = 10,
  message,
} = {}) => createLimiter({
  windowMs,
  max,
  message,
  store: new PostgresRateLimitStore({ route, windowMs }),
});

/** Limite generoso: la SPA fa molte chiamate per pagina (home ~10+). */
const apiLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: 1200,
});

/** 10 richieste / 15 min per IP — login, register, forgot-password */
const authLimiter = createPersistentAuthLimiter({
  route: 'public-auth',
  windowMs: 15 * 60 * 1000,
  max: 10,
});

/** 3 richieste / ora — esportazione dati */
const exportLimiter = createLimiter({
  windowMs: 60 * 60 * 1000,
  max: 3,
});

/** 3 richieste / ora — eliminazione account */
const deleteAccountLimiter = createLimiter({
  windowMs: 60 * 60 * 1000,
  max: 3,
});

/** 20 richieste / 15 min per utente — verify-password, google/challenge, verify-google */
const stepUpLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Troppi tentativi di verifica. Riprova più tardi.' },
});

/** 30 upload / 15 min per utente — anteprima import */
const importUploadLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { error: 'Troppi upload di estratti conto. Riprova tra qualche minuto.' },
});

/** 15 conferme / ora per utente — import definitivo */
const importConfirmLimiter = createLimiter({
  windowMs: 60 * 60 * 1000,
  max: 15,
  message: { error: 'Troppi import confermati. Riprova tra un po\'.' },
});

/** 20 modifiche / 15 min per utente — upload e rimozione immagine profilo */
const avatarLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Troppe modifiche all\'immagine profilo. Riprova tra qualche minuto.' },
});

/**
 * 60 anteprime / 15 min per utente — preview di Piano Smart.
 *
 * Ha un limite proprio perché ogni preview espande l'intero FinancialContext:
 * conti, movimenti su tutta la finestra, obiettivi, debiti, investimenti,
 * ricorrenti. È la richiesta più costosa dell'API per singola chiamata, e il
 * limite globale di 1200/15min non protegge da un ciclo di preview.
 */
const pianoSmartPreviewLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: 60,
  message: { error: 'Troppe anteprime di piano richieste. Riprova tra qualche minuto.' },
});

/**
 * --- Bank Sync ------------------------------------------------------------
 *
 * Ogni rotta che costa quota al provider Open Banking, o che concede un
 * diritto, ha un limite proprio: il tetto globale di 1200/15min non protegge
 * da un ciclo su una singola rotta, ed è esattamente quello che consumerebbe
 * la quota API di un fornitore a pagamento.
 *
 * I limiti sono per-utente (`req.userId`) sulle rotte autenticate. Non
 * sostituiscono il cooldown del motore di sincronizzazione, che è una
 * seconda barriera di natura diversa: il rate limit protegge l'API, il
 * cooldown protegge la quota della singola connessione bancaria.
 */

/** 5 tentativi / ora — rivendicazione di un posto beta. Un utente che riesce
 * ne ha bisogno una volta sola nella vita. */
const bankClaimLimiter = createLimiter({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: { error: 'Troppi tentativi di attivazione. Riprova più tardi.' },
  bypassabileNeiTest: true,
});

/** 10 autorizzazioni avviate / ora — ognuna crea una requisition presso il
 * provider, che ha un costo e una quota. */
const bankConnectLimiter = createLimiter({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: { error: 'Troppi tentativi di collegamento. Riprova più tardi.' },
  bypassabileNeiTest: true,
});

/** 30 callback / 15 min — un ritorno dalla banca, più i refresh di pagina.
 * Serve anche a rendere impraticabile il tentativo di indovinare uno `state`. */
const bankCallbackLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { error: 'Troppi tentativi. Riprova più tardi.' },
  bypassabileNeiTest: true,
});

/** 20 associazioni / 15 min — la riconciliazione interroga il provider a ogni
 * chiamata: il limite protegge la sua quota, non il nostro database. */
const bankRiconciliazioneLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Troppi tentativi di associazione. Riprova tra qualche minuto.' },
  bypassabileNeiTest: true,
});

/** 20 sincronizzazioni manuali / ora per utente. */
const bankSyncLimiter = createLimiter({
  windowMs: 60 * 60 * 1000,
  max: 20,
  message: { error: 'Hai sincronizzato troppe volte. Riprova più tardi.' },
  bypassabileNeiTest: true,
});

/** 3 / ora — cancellazione dei movimenti importati: distruttiva e
 * irreversibile, come l'eliminazione dell'account. */
const bankDangerLimiter = createLimiter({
  windowMs: 60 * 60 * 1000,
  max: 3,
  message: { error: 'Troppe richieste su un\'operazione irreversibile. Riprova più tardi.' },
  bypassabileNeiTest: true,
});

/**
 * 10 richieste Premium / ora per utente.
 *
 * La UNIQUE nel database impedisce i duplicati, ma non impedisce di
 * MARTELLARE l'endpoint: ogni chiamata resta una transazione, una lettura e
 * (sul primo passaggio) una scrittura di audit. Il vincolo protegge i dati,
 * il limite protegge il server — sono due cose diverse, e averne una sola
 * lascia scoperta l'altra. Dieci è generoso per un'azione che nella vita di
 * un utente capita una volta.
 */
const premiumRequestLimiter = createLimiter({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: { error: 'Troppe richieste di accesso. Riprova pi\u00f9 tardi.' },
  bypassabileNeiTest: true,
});

/** 300 / 15 min — area di amministrazione. Generoso (la pagina fa più
 * chiamate) ma non illimitato: un'azione amministrativa che concede diritti
 * non deve essere richiamabile in ciclo. */
const adminLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: 300,
  message: { error: 'Troppe richieste amministrative. Riprova più tardi.' },
  bypassabileNeiTest: true,
});

/** @deprecated usa importUploadLimiter / importConfirmLimiter */
const importLimiter = importUploadLimiter;

module.exports = {
  apiLimiter,
  authLimiter,
  exportLimiter,
  deleteAccountLimiter,
  stepUpLimiter,
  avatarLimiter,
  importLimiter,
  importUploadLimiter,
  importConfirmLimiter,
  pianoSmartPreviewLimiter,
  bankClaimLimiter,
  bankConnectLimiter,
  bankCallbackLimiter,
  bankRiconciliazioneLimiter,
  bankSyncLimiter,
  bankDangerLimiter,
  adminLimiter,
  premiumRequestLimiter,
  createPersistentAuthLimiter,
  PostgresRateLimitStore,
  bypassNeiTest,
};
