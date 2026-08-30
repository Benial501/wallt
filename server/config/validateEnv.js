/**
 * Validazione delle variabili d'ambiente all'avvio. In produzione fallisce
 * velocemente con un errore chiaro invece di partire con placeholder o
 * fallback silenziosi pericolosi (es. DB_USER=root/DB_PASSWORD='' in
 * config/database.js, pensati solo per comodità in sviluppo).
 *
 * Non stampa mai i valori delle variabili, solo i nomi mancanti/non validi.
 */

const REQUIRED_ALWAYS = [
  'JWT_SECRET',
  'DB_HOST',
  'DB_USER',
  'DB_PASSWORD',
  'DB_NAME',
  'CORS_ORIGINS',
];

const isSet = (name) => {
  const value = process.env[name];
  return typeof value === 'string' && value.trim().length > 0;
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

  if (isSet('JWT_SECRET') && process.env.JWT_SECRET.length < 32) {
    errors.push('JWT_SECRET is too short for production (minimum 32 characters recommended)');
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
 * In produzione: valida e termina il processo (exit 1) se manca qualcosa di
 * critico, prima di tentare qualunque connessione DB o avvio del server.
 * Fuori produzione: non fa nulla (dev/test hanno i loro fallback/placeholder
 * espliciti in .env.example / .env.test.example).
 */
const validateProductionEnv = (logger) => {
  if (process.env.NODE_ENV !== 'production') return;

  const errors = collectProductionConfigErrors();
  if (errors.length === 0) return;

  for (const message of errors) {
    logger.error(message);
  }
  logger.error(`Avvio interrotto: ${errors.length} variabile/i d'ambiente mancante/i o non valida/e in produzione.`);
  process.exit(1);
};

module.exports = {
  validateProductionEnv,
  collectProductionConfigErrors,
};
