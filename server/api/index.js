require('dotenv').config();

const logger = require('../utils/logger');
const { validateProductionEnv } = require('../config/validateEnv');

// La validazione avviene prima di importare le configurazioni che dipendono
// dalle variabili d'ambiente. Non apre connessioni e non esegue migrazioni.
//
// onInvalid: 'throw' — in una Vercel Function `process.exit()` durante
// l'import ucciderebbe l'istanza senza lasciare un errore leggibile nei log:
// qui l'eccezione viene propagata e resta visibile nel Runtime Log.
validateProductionEnv(logger, { onInvalid: 'throw' });

const { createApp } = require('../app');
const EmailService = require('../services/email/EmailService');

const emailInit = EmailService.initEmailService();
if (!emailInit.ok) {
  logger.error(
    '[email] Reset password via email non disponibile finché RESEND_API_KEY e EMAIL_FROM '
    + 'non sono configurate nelle variabili d\'ambiente del progetto.',
  );
}

// Nessun app.listen(): Vercel invoca l'app Express come handler della richiesta.
module.exports = createApp();
