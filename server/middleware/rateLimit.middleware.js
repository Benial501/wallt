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

const createLimiter = ({ windowMs, max, message, keyGenerator, store }) => rateLimit({
  windowMs,
  max,
  standardHeaders: true,
  legacyHeaders: false,
  message: message || RATE_LIMIT_MESSAGE,
  keyGenerator: keyGenerator || userOrIpKey,
  ...(store && { store }),
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

/** @deprecated usa importUploadLimiter / importConfirmLimiter */
const importLimiter = importUploadLimiter;

module.exports = {
  apiLimiter,
  authLimiter,
  exportLimiter,
  deleteAccountLimiter,
  stepUpLimiter,
  importLimiter,
  importUploadLimiter,
  importConfirmLimiter,
  createPersistentAuthLimiter,
  PostgresRateLimitStore,
};
