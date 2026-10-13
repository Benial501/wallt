/**
 * Eseguito da Jest PRIMA di qualsiasi test.
 * Imposta subito un DB di test isolato, mai wallt_db.
 */
const path = require('path');
const fs = require('fs');
const { configuraDatabaseDiTest } = require('./databaseDiTest');

// Fotografia dell'ambiente PRIMA di dotenv: solo ciò che è stato passato
// esplicitamente a questo processo (CI, `DB_NAME_TEST=... npm test`) può
// scegliere il database. Un valore scritto in `.env` è identico in tutti i
// checkout e rimetterebbe ogni worktree sullo stesso database condiviso:
// vedi `tests/databaseDiTest.js` per il motivo.
const espliciti = {
  DB_NAME_TEST: process.env.DB_NAME_TEST,
  TEST_DATABASE_URL: process.env.TEST_DATABASE_URL,
};

const envTestPath = path.resolve(__dirname, '../.env.test');
if (fs.existsSync(envTestPath)) {
  require('dotenv').config({ path: envTestPath });
}

require('dotenv').config();

process.env.NODE_ENV = 'test';

const { nome, url } = configuraDatabaseDiTest({ espliciti, env: process.env });
process.env.DB_NAME_TEST = nome;
process.env.DB_NAME = nome;
process.env.TEST_DATABASE_URL = url;

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret_lungo_abbastanza_per_i_test_12345';
process.env.GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || 'test-google-client-id';
process.env.GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || 'test-google-client-secret';
