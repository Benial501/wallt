// config/database.js chiama dotenv.config(): senza questo mock il file .env
// reale ripopolerebbe le variabili che ogni test cancella, rendendo l'esito
// dipendente dalla macchina su cui gira la suite.
jest.mock('dotenv', () => ({ config: () => ({ parsed: {} }) }));

const ORIGINAL_ENV = { ...process.env };

const DB_KEYS = [
  'DATABASE_URL', 'TEST_DATABASE_URL', 'DATABASE_MIGRATION_URL',
  'DATABASE_SSL_CA', 'DATABASE_SSL_NO_VERIFY',
  'DB_HOST', 'DB_PORT', 'DB_USER', 'DB_PASSWORD', 'DB_NAME', 'DB_NAME_TEST',
];

const loadDatabaseConfig = () => {
  jest.resetModules();
  return require('../config/database');
};

describe('configurazione database PostgreSQL', () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    for (const key of DB_KEYS) delete process.env[key];
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
  });

  it('verifica il certificato TLS per default in produzione', () => {
    process.env.DATABASE_URL = 'postgresql://wallt:secret@db.example.com:6543/postgres';

    const { production } = loadDatabaseConfig();

    expect(production.dialectOptions.ssl).toEqual({
      require: true,
      rejectUnauthorized: true,
    });
  });

  it('usa il root certificate Supabase quando DATABASE_SSL_CA è impostata', () => {
    process.env.DATABASE_URL = 'postgresql://wallt:secret@db.example.com:6543/postgres';
    process.env.DATABASE_SSL_CA = '-----BEGIN CERTIFICATE-----\\nMIIB\\n-----END CERTIFICATE-----';

    const { production } = loadDatabaseConfig();

    expect(production.dialectOptions.ssl.rejectUnauthorized).toBe(true);
    expect(production.dialectOptions.ssl.ca).toBe(
      '-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----',
    );
  });

  it('disattiva la verifica TLS solo con un opt-in esplicito', () => {
    process.env.DATABASE_URL = 'postgresql://wallt:secret@db.example.com:6543/postgres';
    process.env.DATABASE_SSL_NO_VERIFY = 'true';

    const { production } = loadDatabaseConfig();

    expect(production.dialectOptions.ssl.rejectUnauthorized).toBe(false);
  });

  it('non inventa host o credenziali locali in produzione', () => {
    process.env.DB_HOST = '127.0.0.1';
    process.env.DB_USER = 'postgres';

    const { production } = loadDatabaseConfig();

    expect(production.url).toBeUndefined();
    expect(production.host).toBeUndefined();
    expect(production.username).toBeUndefined();
    expect(production.database).toBeUndefined();
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

  it('usa DATABASE_MIGRATION_URL soltanto con l’ambiente migration', () => {
    process.env.DATABASE_URL = 'postgresql://runtime:secret@db.example.com:6543/postgres';
    process.env.DATABASE_MIGRATION_URL = 'postgresql://migration:secret@db.example.com:5432/postgres';

    const { migration, production } = loadDatabaseConfig();

    expect(migration.url).toBe(process.env.DATABASE_MIGRATION_URL);
    expect(migration.use_env_variable).toBe('DATABASE_MIGRATION_URL');
    expect(production.url).toBe(process.env.DATABASE_URL);
  });

  it('spiega cosa manca se si lancia NODE_ENV=migration senza connection string', () => {
    process.env.NODE_ENV = 'migration';
    process.env.DATABASE_URL = 'postgresql://runtime:secret@db.example.com:6543/postgres';

    expect(() => loadDatabaseConfig()).toThrow(/DATABASE_MIGRATION_URL/);
  });

  it('in sviluppo usa i parametri DB_* quando DATABASE_URL non è impostata', () => {
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
    expect(development.url).toBeUndefined();
  });

  it('in sviluppo DATABASE_URL esclude i parametri DB_*, senza mischiarli', () => {
    process.env.DATABASE_URL = 'postgresql://wallt:secret@db.example.com:6543/postgres';
    process.env.DB_HOST = 'localhost';
    process.env.DB_PORT = '5433';
    process.env.DB_USER = 'wallt_dev';

    const { development } = loadDatabaseConfig();

    expect(development.url).toBe(process.env.DATABASE_URL);
    expect(development.host).toBeUndefined();
    expect(development.port).toBeUndefined();
    expect(development.username).toBeUndefined();
    expect(development.database).toBeUndefined();
  });
});
