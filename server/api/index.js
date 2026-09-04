require('dotenv').config();

const logger = require('../utils/logger');
const { collectProductionConfigErrors } = require('../config/validateEnv');

/**
 * Handler di fallback: risponde 503 con il motivo per cui il backend non è
 * partito, invece di far fallire l'import della Vercel Function con un
 * FUNCTION_INVOCATION_FAILED opaco e senza log leggibili.
 *
 * Non nasconde nulla: l'errore viene comunque loggato per intero. Espone solo
 * NOMI di variabili e messaggi di errore, mai valori o segreti.
 */
const handlerDiDiagnostica = (dettagli) => (_req, res) => {
  res.statusCode = 503;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify({
    error: 'Configurazione del server incompleta o inizializzazione fallita',
    dettagli,
  }));
};

const erroriConfig = process.env.NODE_ENV === 'production'
  ? collectProductionConfigErrors()
  : [];

if (erroriConfig.length > 0) {
  for (const messaggio of erroriConfig) logger.error(messaggio);
  logger.error(`Avvio interrotto: ${erroriConfig.length} variabile/i d'ambiente mancante/i o non valida/e.`);
  module.exports = handlerDiDiagnostica(erroriConfig);
} else {
  let app;
  try {
    // eslint-disable-next-line global-require
    const { createApp } = require('../app');
    // eslint-disable-next-line global-require
    const EmailService = require('../services/email/EmailService');

    const emailInit = EmailService.initEmailService();
    if (!emailInit.ok) {
      logger.error(
        '[email] Reset password via email non disponibile finché RESEND_API_KEY e EMAIL_FROM '
        + 'non sono configurate nelle variabili d\'ambiente del progetto.',
      );
    }

    // Nessun app.listen(): Vercel invoca l'app Express come handler.
    app = createApp();
  } catch (error) {
    logger.error('Inizializzazione del backend fallita', { err: error });
    app = handlerDiDiagnostica([error.message]);
  }
  module.exports = app;
}
