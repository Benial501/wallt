require('dotenv').config();

const logger = require('../utils/logger');
const { validateProductionEnv } = require('../config/validateEnv');

// La validazione avviene prima di importare configurazioni dipendenti dalle
// variabili d'ambiente. Non apre connessioni e non esegue migrazioni.
validateProductionEnv(logger);

const { createApp } = require('../app');
const EmailService = require('../services/email/EmailService');

EmailService.initEmailService();

module.exports = createApp();
