/**
 * Validazione delle variabili d'ambiente all'avvio. In produzione fallisce
 * velocemente con un errore chiaro invece di partire con placeholder o
 * fallback silenziosi pericolosi.
 *
 * Il database può essere configurato in DUE modi mutuamente alternativi:
 *   A) DATABASE_URL  — connection string PostgreSQL completa (Supabase/Vercel);
 *   B) DB_HOST + DB_USER + DB_PASSWORD + DB_NAME — parametri separati.
 * Se DATABASE_URL è presente vince lei e le DB_* vengono ignorate
 * (vedi config/database.js): non serve impostarle entrambe.
 *
 * Non stampa mai i valori delle variabili, solo i nomi mancanti/non validi.
 */

const REQUIRED_ALWAYS = [
  'JWT_SECRET',
  'CORS_ORIGINS',
  'CRON_SECRET',
];

/** Modalità B: tutte e quattro devono essere presenti, o nessuna. */
const DB_PARAM_VARS = ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'];

const POSTGRES_PROTOCOLS = new Set(['postgres:', 'postgresql:']);

const isSet = (name) => {
  const value = process.env[name];
  return typeof value === 'string' && value.trim().length > 0;
};

/**
 * @returns {string|null} motivo per cui la connection string non è valida,
 * oppure null se è valida. Non include mai la stringa stessa (contiene la
 * password del database).
 */
const invalidDatabaseUrlReason = (rawUrl) => {
  let parsed;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    return 'not a parsable URL';
  }

  if (!POSTGRES_PROTOCOLS.has(parsed.protocol)) {
    return 'protocol must be postgres:// or postgresql://';
  }
  if (!parsed.hostname) {
    return 'missing host';
  }
  if (parsed.pathname.replace(/^\//, '').length === 0) {
    return 'missing database name in the path';
  }
  return null;
};

/**
 * Modalità A oppure modalità B, mai il requisito di entrambe.
 * @returns {string[]}
 */
const collectDatabaseConfigErrors = () => {
  if (isSet('DATABASE_URL')) {
    const reason = invalidDatabaseUrlReason(process.env.DATABASE_URL);
    return reason ? [`DATABASE_URL is not a valid PostgreSQL connection string: ${reason}`] : [];
  }

  const missing = DB_PARAM_VARS.filter((name) => !isSet(name));
  if (missing.length === DB_PARAM_VARS.length) {
    return ['Missing database configuration: set DATABASE_URL (recommended for Supabase/Vercel), '
      + `or all of ${DB_PARAM_VARS.join(', ')}`];
  }
  if (missing.length > 0) {
    return [`Incomplete database configuration: missing ${missing.join(', ')} `
      + '(set DATABASE_URL instead to configure the connection in one variable)'];
  }
  return [];
};

/**
 * @returns {string[]} elenco di errori (nomi variabile + motivo), vuoto se tutto ok.
 */
const collectProductionConfigErrors = () => {
  const errors = [];

  for (const name of REQUIRED_ALWAYS) {
    if (!isSet(name)) {
      errors.push(`Missing required environment variable: ${name}`);
    }
  }

  errors.push(...collectDatabaseConfigErrors());

  if (isSet('JWT_SECRET') && process.env.JWT_SECRET.length < 32) {
    errors.push('JWT_SECRET is too short for production (minimum 32 characters recommended)');
  }

  if (isSet('CRON_SECRET') && process.env.CRON_SECRET.length < 32) {
    errors.push('CRON_SECRET is too short for production (minimum 32 characters required)');
  }

  // Google OAuth è opzionale, ma se configurato deve esserlo completamente:
  // un solo dei due valori impostato è quasi certamente un errore di config.
  const googleIdSet = isSet('GOOGLE_CLIENT_ID');
  const googleSecretSet = isSet('GOOGLE_CLIENT_SECRET');
  if (googleIdSet !== googleSecretSet) {
    errors.push('GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must both be set, or both left empty');
  }

  // Se Google è abilitato, serve un callback URL esplicito: altrimenti
  // config/passport.js ricade su un dominio placeholder che rompe il login
  // Google in silenzio (vedi docs/SECURITY.md).
  if (googleIdSet && googleSecretSet && !isSet('GOOGLE_CALLBACK_URL') && !isSet('API_URL')) {
    errors.push('GOOGLE_CALLBACK_URL (or API_URL) is required when GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET are set');
  }

  return errors;
};

/**
 * In produzione: valida e interrompe l'avvio se manca qualcosa di critico,
 * prima di tentare qualunque connessione DB. Fuori produzione non fa nulla
 * (dev/test hanno i loro fallback espliciti in .env.example / .env.test).
 *
 * @param {{error: Function}} logger
 * @param {{onInvalid?: 'exit'|'throw'}} [options]
 *   'exit'  (default) — processo long-running: `process.exit(1)`.
 *   'throw' — ambiente serverless: `process.exit()` durante l'import di una
 *   Vercel Function terminerebbe l'istanza senza un errore diagnosticabile,
 *   quindi l'errore viene propagato e finisce nei log della funzione.
 */
const validateProductionEnv = (logger, { onInvalid = 'exit' } = {}) => {
  if (process.env.NODE_ENV !== 'production') return;

  const errors = collectProductionConfigErrors();
  if (errors.length === 0) return;

  for (const message of errors) {
    logger.error(message);
  }
  const summary = `Avvio interrotto: ${errors.length} variabile/i d'ambiente mancante/i o non valida/e in produzione.`;
  logger.error(summary);

  if (onInvalid === 'throw') {
    throw new Error(`${summary} ${errors.join(' | ')}`);
  }
  process.exit(1);
};

module.exports = {
  validateProductionEnv,
  collectProductionConfigErrors,
  collectDatabaseConfigErrors,
};
