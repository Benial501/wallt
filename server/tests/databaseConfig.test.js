const ORIGINAL_ENV = { ...process.env };

const loadDatabaseConfig = () => {
  jest.resetModules();
  return require('../config/database');
};

describe('configurazione database PostgreSQL', () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    delete process.env.DATABASE_URL;
    delete process.env.TEST_DATABASE_URL;
    delete process.env.DB_HOST;
    delete process.env.DB_PORT;
    delete process.env.DB_USER;
    delete process.env.DB_PASSWORD;
    delete process.env.DB_NAME;
    delete process.env.DB_NAME_TEST;
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it('usa DATABASE_URL e un pool piccolo in produzione serverless', () => {
    process.env.DATABASE_URL = 'postgresql://wallt:secret@db.example.com:6543/postgres';

    const { production } = loadDatabaseConfig();

    expect(production).toMatchObject({
      dialect: 'postgres',
      url: process.env.DATABASE_URL,
      use_env_variable: 'DATABASE_URL',
      pool: {
        max: 2,
        min: 0,
        idle: 0,
        acquire: 10000,
        evict: 1000,
      },
    });
    expect(production.dialectOptions.ssl).toMatchObject({
      require: true,
      rejectUnauthorized: false,
    });
  });

  it('preferisce TEST_DATABASE_URL per i test', () => {
    process.env.DATABASE_URL = 'postgresql://prod:secret@db.example.com:6543/postgres';
    process.env.TEST_DATABASE_URL = 'postgresql://test:secret@127.0.0.1:5432/wallt_test';

    const { test } = loadDatabaseConfig();

    expect(test.dialect).toBe('postgres');
    expect(test.url).toBe(process.env.TEST_DATABASE_URL);
    expect(test.use_env_variable).toBe('TEST_DATABASE_URL');
    expect(test.dialectOptions).toBeUndefined();
  });

  it('mantiene variabili DB_* e valori locali comodi solo in sviluppo', () => {
    process.env.DB_HOST = 'localhost';
    process.env.DB_PORT = '5433';
    process.env.DB_USER = 'wallt_dev';
    process.env.DB_PASSWORD = 'dev-secret';
    process.env.DB_NAME = 'wallt_local';

    const { development } = loadDatabaseConfig();

    expect(development).toMatchObject({
      dialect: 'postgres',
      host: 'localhost',
      port: 5433,
      username: 'wallt_dev',
      password: 'dev-secret',
      database: 'wallt_local',
    });
  });
});
