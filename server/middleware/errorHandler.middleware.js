const {
  AppError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  BadRequestError,
} = require('../utils/AppError');
const { logError, logWarn, sanitizeMeta } = require('../utils/logger');

const GENERIC_ERROR = 'Si è verificato un errore. Riprova più tardi.';

const isProduction = () => process.env.NODE_ENV === 'production';

const DEFAULT_MESSAGES = {
  400: 'I dati inviati non sono validi.',
  401: 'Non autorizzato.',
  403: 'Accesso negato.',
  404: 'Risorsa non trovata.',
  409: 'Risorsa già esistente.',
  500: GENERIC_ERROR,
};

const isUnknownColumnError = (err) => {
  const sqlMessage = err?.original?.sqlMessage || err?.parent?.sqlMessage || '';
  return sqlMessage.includes('Unknown column') || err?.message?.includes('Unknown column');
};

const normalizeError = (err) => {
  if (err instanceof AppError) {
    return err;
  }

  if (err?.name === 'SequelizeValidationError') {
    const details = err.errors?.map((e) => e.message).filter(Boolean);
    const message = details?.length
      ? `I dati inviati non sono validi: ${details.join('; ')}`
      : DEFAULT_MESSAGES[400];
    return new BadRequestError(message);
  }

  if (err?.name === 'SequelizeUniqueConstraintError') {
    return new AppError(DEFAULT_MESSAGES[409], 409);
  }

  if (err?.name === 'JsonWebTokenError' || err?.name === 'TokenExpiredError') {
    return new UnauthorizedError('Token non valido o scaduto.');
  }

  if (err?.name === 'MulterError') {
    return new BadRequestError('File non valido o troppo grande.');
  }

  if (isUnknownColumnError(err)) {
    return new AppError(
      'Database non aggiornato. Riavvia il server per applicare le migrazioni.',
      500,
    );
  }

  if (err?.statusCode >= 400 && err?.statusCode < 600 && err?.message) {
    return new AppError(err.message, err.statusCode);
  }

  return err;
};

const resolveStatusCode = (err) => {
  if (err instanceof AppError) return err.statusCode;
  if (err?.statusCode >= 400 && err?.statusCode < 600) return err.statusCode;
  if (err?.status >= 400 && err?.status < 600) return err.status;
  return 500;
};

const resolveClientMessage = (err, statusCode) => {
  if (err instanceof AppError && err.isOperational) {
    return err.message;
  }
  return DEFAULT_MESSAGES[statusCode] || DEFAULT_MESSAGES[500];
};

const errorHandler = (err, req, res, _next) => {
  const normalized = normalizeError(err);
  const statusCode = resolveStatusCode(normalized);
  const meta = sanitizeMeta({
    method: req.method,
    path: req.originalUrl,
    statusCode,
    name: err?.name,
    message: err?.message,
    userId: req.userId,
  });

  // 4xx = richiesta non valida / risorsa assente (non crash). 5xx = errore server.
  if (statusCode >= 500) {
    logError('Request error', sanitizeMeta({
      ...meta,
      stack: err?.stack,
      sql: err?.original?.sql || err?.parent?.sql,
      sqlMessage: err?.original?.sqlMessage || err?.parent?.sqlMessage,
    }));
  } else {
    logWarn('Request rejected', meta);
  }

  if (isProduction()) {
    if (statusCode >= 500) {
      return res.status(statusCode).json({ error: GENERIC_ERROR });
    }

    return res.status(statusCode).json({
      error: resolveClientMessage(normalized, statusCode),
    });
  }

  const response = {
    error: normalized?.message || err?.message || GENERIC_ERROR,
    statusCode,
  };

  if (err?.stack) {
    response.stack = err.stack;
  }

  if (err?.name === 'SequelizeValidationError' && err.errors?.length) {
    response.dettagli = err.errors.map((e) => ({
      campo: e.path,
      messaggio: e.message,
    }));
  }

  return res.status(statusCode).json(response);
};

const notFoundHandler = (req, _res, next) => {
  next(new NotFoundError('Endpoint non trovato'));
};

module.exports = {
  errorHandler,
  notFoundHandler,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  BadRequestError,
  AppError,
};
