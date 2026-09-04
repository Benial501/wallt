/**
 * Ambiente per le suite che NON toccano il database (jest.unit.config.js).
 *
 * A differenza di tests/env.js non sintetizza TEST_DATABASE_URL: così le
 * suite miste (es. migrations.postgres.test.js) saltano davvero la parte
 * di integrazione invece di provare a connettersi. `npm test` continua a
 * usare tests/env.js e a eseguire tutto contro PostgreSQL.
 */
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret_lungo_abbastanza_per_i_test_12345';
process.env.GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || 'test-google-client-id';
process.env.GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || 'test-google-client-secret';
delete process.env.TEST_DATABASE_URL;
