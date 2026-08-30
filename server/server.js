require('dotenv').config();

const logger = require('./utils/logger');
const { validateProductionEnv } = require('./config/validateEnv');

// Deve girare PRIMA di qualunque altro require che tocchi env-dependent
// config (DB, passport/Google, ecc.): in produzione, con variabili critiche
// mancanti, il processo termina qui con un errore chiaro invece di partire
// con fallback silenziosi pericolosi (es. DB_USER=root/DB_PASSWORD='').
validateProductionEnv(logger);

const { createApp } = require('./app');
const { sequelize } = require('./models');
const { avviaCronRicorrenti } = require('./services/ricorrenti.service');
const EmailService = require('./services/email/EmailService');

const PORT = process.env.PORT || 3000;
const app = createApp();

// In produzione le migrazioni NON vengono eseguite automaticamente all'avvio:
// su un deploy multi-istanza, più processi che partono in parallelo
// lancerebbero `db:migrate` in concorrenza sullo stesso DB (race condition
// sullo schema), e un DB_NAME misconfigurato applicherebbe silenziosamente
// migrazioni al database sbagliato. In produzione le migrazioni vanno
// eseguite come step di deploy separato e deliberato, PRIMA di avviare il
// processo applicativo (es. `npx sequelize-cli db:migrate` in una release
// task dedicata). Per riabilitare il comportamento precedente in casi
// eccezionali, impostare RUN_MIGRATIONS_ON_BOOT=true.
const shouldAutoMigrate = () => {
  if (process.env.RUN_MIGRATIONS_ON_BOOT === 'true') return true;
  if (process.env.RUN_MIGRATIONS_ON_BOOT === 'false') return false;
  return process.env.NODE_ENV !== 'production';
};

const runPendingMigrations = () => {
  if (!shouldAutoMigrate()) {
    logger.info('Auto-migrate disabilitato (NODE_ENV=production): eseguire le migrazioni come step di deploy separato.');
    return;
  }
  try {
    const { execSync } = require('child_process');
    execSync('npx sequelize-cli db:migrate', { stdio: 'pipe' });
    logger.info('Migrazioni DB verificate');
  } catch (error) {
    logger.warn('Attenzione: migrazioni DB non eseguite automaticamente', { err: error });
  }
};

const startServer = async () => {
  try {
    runPendingMigrations();
    await sequelize.authenticate();
    logger.info('DB connesso');

    const emailInit = EmailService.initEmailService();
    if (!emailInit.ok) {
      logger.error(
        '[email] Reset password via email non disponibile finché RESEND_API_KEY e EMAIL_FROM '
        + 'non sono configurati in server/.env',
      );
    }

    avviaCronRicorrenti();

    app.listen(PORT, () => {
      logger.info(`Server WALLT in ascolto su http://localhost:${PORT}`);
    });
  } catch (error) {
    logger.error('Impossibile avviare il server', { err: error });
    process.exit(1);
  }
};

if (require.main === module) {
  startServer();
}

module.exports = {
  app,
  shouldAutoMigrate,
  runPendingMigrations,
  startServer,
};
