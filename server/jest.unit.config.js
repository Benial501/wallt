/**
 * Suite che girano senza PostgreSQL: config, entrypoint Vercel, logger,
 * migrazioni (a livello di codice), rotta cron con service mockato e il
 * motore puro di Piano Smart (money, profile, engine, invarianti, scenari
 * e situazione corrente: non toccano il database per progetto, vedi
 * services/pianoSmart/ e services/pianoSmartV2/currentSituation.service.js).
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
    '<rootDir>/tests/avatarImage.test.js',
    '<rootDir>/tests/welcomeEmail.test.js',
    '<rootDir>/tests/supportEmail.test.js',
    '<rootDir>/tests/scommesseStats.test.js',
    '<rootDir>/tests/pianoSmartMoney.test.js',
    '<rootDir>/tests/pianoSmartProfile.test.js',
    '<rootDir>/tests/pianoSmartEngine.test.js',
    '<rootDir>/tests/pianoSmartInvarianti.test.js',
    '<rootDir>/tests/pianoSmartScenari.test.js',
    '<rootDir>/tests/pianoSmartCurrentSituation.test.js',
    '<rootDir>/tests/pianoSmartV2Serializer.test.js',
    '<rootDir>/tests/pianoSmartChangeTimeline.test.js',
    '<rootDir>/tests/pianoSmartRecurringCashFlow.test.js',
    '<rootDir>/tests/aggregaMedieSpeseFrequenti.test.js',
    '<rootDir>/tests/speseMedie.test.js',
  ],
  testTimeout: 20000,
  verbose: true,
  forceExit: true,
};
