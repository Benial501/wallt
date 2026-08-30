/**
 * Eseguito da Jest PRIMA di qualsiasi test.
 * Imposta subito un DB di test isolato, mai wallt_db.
 */
const path = require('path');
const fs = require('fs');

const envTestPath = path.resolve(__dirname, '../.env.test');
if (fs.existsSync(envTestPath)) {
  require('dotenv').config({ path: envTestPath });
}

require('dotenv').config();

process.env.NODE_ENV = 'test';
process.env.DB_NAME_TEST = process.env.DB_NAME_TEST || 'wallt_test';
process.env.DB_NAME = process.env.DB_NAME_TEST;
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret_lungo_abbastanza_per_i_test_12345';
process.env.GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || 'test-google-client-id';
process.env.GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || 'test-google-client-secret';
