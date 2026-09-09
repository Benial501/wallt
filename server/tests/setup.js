const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const { Client } = require('pg');

// Env test già configurato da tests/env.js (setupFiles Jest)
const envTestPath = path.resolve(__dirname, '../.env.test');
if (fs.existsSync(envTestPath)) {
  require('dotenv').config({ path: envTestPath });
}
require('dotenv').config();

process.env.NODE_ENV = 'test';
process.env.DB_NAME_TEST = process.env.DB_NAME_TEST || 'wallt_test';
process.env.DB_NAME = process.env.DB_NAME_TEST;
if (!process.env.TEST_DATABASE_URL) {
  const user = encodeURIComponent(process.env.DB_USER || 'postgres');
  const password = encodeURIComponent(process.env.DB_PASSWORD || '');
  const host = process.env.DB_HOST || '127.0.0.1';
  const port = Number(process.env.DB_PORT) || 5432;
  process.env.TEST_DATABASE_URL = `postgresql://${user}:${password}@${host}:${port}/${process.env.DB_NAME_TEST}`;
}
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret_lungo_abbastanza_per_i_test_12345';
process.env.GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || 'test-google-client-id';
process.env.GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || 'test-google-client-secret';

const request = require('supertest');
const bcrypt = require('bcrypt');
const { createApp } = require('../app');
const {
  sequelize,
  User,
  Conto,
  Movimento,
} = require('../models');

const TEST_DATABASE = process.env.DB_NAME_TEST || 'wallt_test';

if (!/^[a-zA-Z0-9_]+$/.test(TEST_DATABASE)) {
  throw new Error(`DB_NAME_TEST non valido: "${TEST_DATABASE}"`);
}

const configuredDatabase = decodeURIComponent(new URL(process.env.TEST_DATABASE_URL).pathname.slice(1));
if (configuredDatabase !== TEST_DATABASE) {
  throw new Error(
    `Sicurezza test: TEST_DATABASE_URL punta a "${configuredDatabase}", `
    + `ma DB_NAME_TEST è "${TEST_DATABASE}".`,
  );
}

const TABLES = [
  'categorie_default_nascoste',
  'categorie_personali',
  'notifiche',
  'push_subscriptions',
  'preferenze_notifiche',
  'auth_rate_limits',
  'password_reset_tokens',
  'regole_personali_merchant',
  'categorie_regole',
  'movimenti_investimento',
  'movimenti_scommesse',
  'obiettivo_contributi',
  'budget_categorie',
  'movimenti',
  'investimenti',
  'piattaforme_scommesse',
  'obiettivi',
  'budget_mensili',
  'conti',
  'profili_utente',
  'users',
];

let migrationsApplied = false;

const ensureTestDatabase = async () => {
  const adminUrl = new URL(process.env.TEST_DATABASE_URL);
  adminUrl.pathname = '/postgres';
  const connection = new Client({ connectionString: adminUrl.toString() });

  await connection.connect();
  try {
    const existing = await connection.query(
      'SELECT 1 FROM pg_database WHERE datname = $1',
      [TEST_DATABASE],
    );
    if (existing.rowCount === 0) {
      await connection.query(`CREATE DATABASE "${TEST_DATABASE}"`);
    }
  } finally {
    await connection.end();
  }
};

const runMigrations = () => {
  if (migrationsApplied) return;
  const cli = path.resolve(__dirname, '../node_modules/sequelize-cli/lib/sequelize');
  execFileSync(process.execPath, [cli, 'db:migrate'], {
    cwd: path.resolve(__dirname, '..'),
    env: {
      ...process.env,
      NODE_ENV: 'test',
      DB_NAME: TEST_DATABASE,
      DB_NAME_TEST: TEST_DATABASE,
    },
    stdio: 'pipe',
  });
  migrationsApplied = true;
};

const assertTestDatabase = () => {
  const activeDb = sequelize.config?.database || sequelize.getDatabaseName?.();
  if (activeDb !== TEST_DATABASE) {
    throw new Error(
      `Sicurezza test: rifiuto di pulire "${activeDb}". `
      + `I test Jest devono usare solo "${TEST_DATABASE}", mai wallt_db.`,
    );
  }
};

const cleanDatabase = async () => {
  assertTestDatabase();
  const tables = TABLES.map((table) => `"${table}"`).join(', ');
  await sequelize.query(`TRUNCATE TABLE ${tables} RESTART IDENTITY CASCADE`);
};

const uniqueEmail = (prefix = 'user') => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.local`;

const defaultRegisterPayload = (overrides = {}) => ({
  nome: 'Test User',
  email: uniqueEmail(),
  password: 'Password1!',
  privacy_accepted_at: new Date().toISOString(),
  terms_accepted_at: new Date().toISOString(),
  use_ai_categorization: false,
  ...overrides,
});

const registerUser = async (app, overrides = {}) => {
  const payload = defaultRegisterPayload(overrides);
  const res = await request(app)
    .post('/api/auth/register')
    .send(payload);

  return { res, payload };
};

const loginUser = async (app, email, password) => request(app)
  .post('/api/auth/login')
  .send({ email, password });

const authHeader = (token) => ({ Authorization: `Bearer ${token}` });

const getStepUpToken = async (app, token, password) => {
  const res = await request(app)
    .post('/api/auth/verify-password')
    .set(authHeader(token))
    .send({ password });

  return res.body.step_up_token;
};

const seedUserFinanceData = async (userId, label = 'A') => {
  const conto = await Conto.create({
    user_id: userId,
    nome: `Conto ${label}`,
    tipo: 'banca',
    saldo: 100,
    attivo: true,
  });

  const movimento = await Movimento.create({
    user_id: userId,
    conto_id: conto.id,
    tipo: 'uscita',
    importo: 25.5,
    categoria: 'cibo_spesa',
    descrizione: `Spesa segreta ${label}`,
    data: new Date().toISOString().split('T')[0],
    ricorrente: false,
  });

  return { conto, movimento };
};

const createGoogleUser = async () => {
  const email = uniqueEmail('google');
  const user = await User.create({
    nome: 'Google User',
    email,
    password: null,
    auth_provider: 'google',
    google_id: `google-${Date.now()}`,
    privacy_accepted_at: new Date(),
    terms_accepted_at: new Date(),
  });
  return user;
};

beforeAll(async () => {
  assertTestDatabase();
  await ensureTestDatabase();
  runMigrations();
  await sequelize.authenticate();
});

beforeEach(async () => {
  await cleanDatabase();
});

afterAll(async () => {
  await sequelize.close();
});

module.exports = {
  request,
  bcrypt,
  createApp,
  sequelize,
  User,
  Conto,
  Movimento,
  cleanDatabase,
  uniqueEmail,
  defaultRegisterPayload,
  registerUser,
  loginUser,
  authHeader,
  getStepUpToken,
  seedUserFinanceData,
  createGoogleUser,
  TEST_DATABASE,
};
