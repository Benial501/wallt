/**
 * Suite che girano senza PostgreSQL: config, entrypoint Vercel, logger,
 * migrazioni (a livello di codice) e rotta cron con service mockato.
 * Sono un sottoinsieme di `npm test`, non un rimpiazzo: la suite completa
 * (jest.config.js) resta l'unica autorevole e richiede un database.
 */
module.exports = {
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/tests/env.unit.js'],
  testMatch: [
    '<rootDir>/tests/validateEnv.test.js',
    '<rootDir>/tests/databaseConfig.test.js',
    '<rootDir>/tests/migrations.postgres.test.js',
    '<rootDir>/tests/loggerServerless.test.js',
    '<rootDir>/tests/vercelHandler.test.js',
    '<rootDir>/tests/cron.test.js',
  ],
  testTimeout: 20000,
  verbose: true,
  forceExit: true,
};
