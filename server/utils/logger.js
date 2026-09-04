const fs = require('fs');
const path = require('path');
const winston = require('winston');

const LOGS_DIR = path.join(__dirname, '..', 'logs');
const isProduction = process.env.NODE_ENV === 'production';
const isVercel = process.env.VERCEL === '1';

// Su Vercel (e su qualsiasi filesystem in sola lettura) i transport su file non
// sono utilizzabili: i log vanno sullo stdout della funzione. Non è un errore
// da nascondere, è una capacità della piattaforma da rilevare una volta sola.
// La console resta sempre attiva, quindi nessun log viene perso in silenzio.
const fileLoggingEnabled = (() => {
  if (isVercel) return false;
  try {
    fs.mkdirSync(LOGS_DIR, { recursive: true });
    return true;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn(
      `[logger] Log su file disattivati: impossibile creare ${LOGS_DIR} (${error.code || error.message}). `
      + 'I log restano disponibili su stdout.',
    );
    return false;
  }
})();

const SENSITIVE_KEYS = new Set([
  'password',
  'password_attuale',
  'nuova_password',
  'newpassword',
  'new_password',
  'hash',
  'token',
  'step_up_token',
  'access_token',
  'refresh_token',
  'authorization',
  'resettoken',
  'reset_token',
  'descrizione',
  'description',
  'nota',
  'note',
  'narration',
  'causale',
  'motivo',
  'dettaglio',
  'transactions',
  'html',
  'text',
]);

const FINANCIAL_KEYS = new Set([
  'importo',
  'saldo',
  'saldo_iniziale',
  'saldo_attuale',
  'saldo_dopo',
  'importo_target',
  'importo_totale',
  'importo_iniziale',
  'importo_attuale',
  'patrimonio',
  'patrimonio_totale',
  'entrata_mensile',
  'costo_abitazione',
  'stima_bollette',
  'spesa_benzina',
  'spesa_mezzi',
  'spese_fisse_extra',
  'limite_mensile',
  'budget_importo',
  'totale_entrate_giorno',
  'totale_uscite_giorno',
]);

const JWT_PATTERN = /eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g;
const BEARER_PATTERN = /Bearer\s+[A-Za-z0-9._-]+/gi;
const EMAIL_PATTERN = /([a-zA-Z0-9._%+-])[a-zA-Z0-9._%+-]*@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g;

const maskEmail = (value) => {
  if (typeof value !== 'string') return value;
  return value.replace(EMAIL_PATTERN, (_match, first, domain) => `${first}***@${domain}`);
};

const sanitizeString = (value) => {
  if (typeof value !== 'string') return value;
  let sanitized = maskEmail(value);
  sanitized = sanitized.replace(JWT_PATTERN, '[JWT_REDACTED]');
  sanitized = sanitized.replace(BEARER_PATTERN, 'Bearer [JWT_REDACTED]');
  return sanitized;
};

const normalizeKey = (key) => String(key || '').toLowerCase().replace(/[^a-z0-9_]/g, '');

const sanitizeValue = (value, key = '') => {
  const normalizedKey = normalizeKey(key);

  if (value == null) return value;

  if (value instanceof Error) {
    return {
      name: value.name,
      message: sanitizeString(value.message),
      stack: value.stack,
      code: value.code,
      statusCode: value.statusCode,
    };
  }

  if (SENSITIVE_KEYS.has(normalizedKey)) {
    return '[REDACTED]';
  }

  if (FINANCIAL_KEYS.has(normalizedKey)) {
    return '[REDACTED]';
  }

  if (normalizedKey === 'email' || normalizedKey === 'to' || normalizedKey === 'from') {
    return maskEmail(String(value));
  }

  if (typeof value === 'string') {
    return sanitizeString(value);
  }

  if (Array.isArray(value)) {
    return value.map((item, index) => sanitizeValue(item, `${key}[${index}]`));
  }

  if (typeof value === 'object') {
    return sanitizeMeta(value);
  }

  return value;
};

const sanitizeMeta = (meta) => {
  if (meta == null) return meta;
  if (typeof meta !== 'object') return sanitizeValue(meta);

  const sanitized = {};
  for (const [key, value] of Object.entries(meta)) {
    if (key === 'err' || key === 'error') {
      sanitized[key] = sanitizeValue(value, key);
      continue;
    }
    sanitized[key] = sanitizeValue(value, key);
  }
  return sanitized;
};

const sanitizeFormat = winston.format((info) => {
  info.message = sanitizeString(info.message);

  if (info.meta && typeof info.meta === 'object') {
    info.meta = sanitizeMeta(info.meta);
  }

  const reserved = new Set(['level', 'message', 'timestamp', 'meta', 'stack']);
  for (const [key, value] of Object.entries(info)) {
    if (!reserved.has(key)) {
      info[key] = sanitizeValue(value, key);
    }
  }

  return info;
});

const devFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.printf(({ timestamp, level, message, meta, stack, ...rest }) => {
    const extra = { ...rest };
    if (meta) extra.meta = meta;
    const payload = Object.keys(extra).length > 0
      ? `\n${JSON.stringify(extra, null, 2)}`
      : '';
    const stackTrace = stack ? `\n${stack}` : '';
    return `${timestamp} ${level}: ${message}${payload}${stackTrace}`;
  }),
);

const prodFormat = winston.format.json();

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug'),
  levels: winston.config.npm.levels,
  defaultMeta: { service: 'wallt-api' },
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    sanitizeFormat(),
    isProduction ? prodFormat : devFormat,
  ),
  transports: [
    ...(fileLoggingEnabled ? [
      new winston.transports.File({
        filename: path.join(LOGS_DIR, 'error.log'),
        level: 'error',
        maxsize: 10 * 1024 * 1024,
        maxFiles: 5,
      }),
      new winston.transports.File({
        filename: path.join(LOGS_DIR, 'combined.log'),
        maxsize: 10 * 1024 * 1024,
        maxFiles: 5,
      }),
    ] : []),
    new winston.transports.Console({
      format: isProduction
        ? winston.format.combine(
          winston.format.timestamp(),
          winston.format.errors({ stack: true }),
          sanitizeFormat(),
          prodFormat,
        )
        : winston.format.combine(
          winston.format.timestamp(),
          winston.format.errors({ stack: true }),
          sanitizeFormat(),
          devFormat,
        ),
    }),
  ],
});

const write = (level, message, meta) => {
  const payload = meta === undefined ? {} : meta;
  if (payload instanceof Error) {
    logger.log(level, message, { meta: { err: payload } });
    return;
  }
  logger.log(level, message, { meta: payload });
};

module.exports = {
  error: (message, meta) => write('error', message, meta),
  warn: (message, meta) => write('warn', message, meta),
  info: (message, meta) => write('info', message, meta),
  debug: (message, meta) => write('debug', message, meta),
  logError: (message, meta) => write('error', message, meta),
  logWarn: (message, meta) => write('warn', message, meta),
  logInfo: (message, meta) => write('info', message, meta),
  sanitizeMeta,
};
