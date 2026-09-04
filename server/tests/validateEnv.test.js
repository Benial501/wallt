const { collectProductionConfigErrors } = require('../config/validateEnv');

describe('collectProductionConfigErrors (validazione config produzione)', () => {
  const ENV_KEYS = [
    'JWT_SECRET', 'DATABASE_URL', 'DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME', 'CORS_ORIGINS', 'CRON_SECRET',
    'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_CALLBACK_URL', 'API_URL',
  ];
  let originalEnv;

  const clearDbParams = () => {
    for (const key of ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME']) delete process.env[key];
  };

  const validCompleteEnv = () => {
    process.env.JWT_SECRET = 'a'.repeat(40);
    process.env.DATABASE_URL = 'postgresql://wallt:secret@db.example.com:6543/postgres';
    process.env.CORS_ORIGINS = 'https://app.wallt.example';
    process.env.CRON_SECRET = 'c'.repeat(40);
    process.env.GOOGLE_CLIENT_ID = 'client-id';
    process.env.GOOGLE_CLIENT_SECRET = 'client-secret';
    process.env.GOOGLE_CALLBACK_URL = 'https://api.wallt.example/api/auth/google/callback';
    delete process.env.API_URL;
  };

  beforeEach(() => {
    originalEnv = {};
    for (const key of ENV_KEYS) originalEnv[key] = process.env[key];
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (originalEnv[key] === undefined) delete process.env[key];
      else process.env[key] = originalEnv[key];
    }
  });

  it('nessun errore quando tutte le variabili richieste sono impostate correttamente', () => {
    validCompleteEnv();
    expect(collectProductionConfigErrors()).toEqual([]);
  });

  it('segnala ogni variabile obbligatoria mancante', () => {
    validCompleteEnv();
    // Senza questo, le DB_* ereditate da .env/.env.test soddisfarebbero la
    // modalita alternativa e il test non sarebbe piu ermetico.
    clearDbParams();
    delete process.env.DATABASE_URL;
    delete process.env.CORS_ORIGINS;

    const errors = collectProductionConfigErrors();
    expect(errors.some((e) => e.includes('DATABASE_URL'))).toBe(true);
    expect(errors.some((e) => e.includes('CORS_ORIGINS'))).toBe(true);
  });

  it('accetta le variabili DB_* complete come alternativa a DATABASE_URL', () => {
    validCompleteEnv();
    delete process.env.DATABASE_URL;
    process.env.DB_HOST = '127.0.0.1';
    process.env.DB_USER = 'wallt_user';
    process.env.DB_PASSWORD = 'super-secret';
    process.env.DB_NAME = 'wallt_prod';

    expect(collectProductionConfigErrors()).toEqual([]);
  });

  it('non richiede le DB_* quando DATABASE_URL è impostata', () => {
    validCompleteEnv();
    clearDbParams();

    expect(collectProductionConfigErrors()).toEqual([]);
  });

  it('segnala la mancanza di qualunque configurazione database', () => {
    validCompleteEnv();
    delete process.env.DATABASE_URL;
    clearDbParams();

    const errors = collectProductionConfigErrors();
    expect(errors.some((e) => e.includes('DATABASE_URL') && e.includes('DB_HOST'))).toBe(true);
  });

  it('segnala le DB_* incomplete elencando solo quelle mancanti', () => {
    validCompleteEnv();
    delete process.env.DATABASE_URL;
    clearDbParams();
    process.env.DB_HOST = '127.0.0.1';
    process.env.DB_USER = 'wallt_user';

    const errors = collectProductionConfigErrors();
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('DB_PASSWORD');
    expect(errors[0]).toContain('DB_NAME');
    expect(errors[0]).not.toContain('DB_HOST,');
  });

  it('rifiuta una DATABASE_URL non PostgreSQL senza stamparne il valore', () => {
    validCompleteEnv();
    process.env.DATABASE_URL = 'mysql://wallt:super-secret@db.example.com:3306/wallt';

    const errors = collectProductionConfigErrors();
    expect(errors.some((e) => e.includes('DATABASE_URL'))).toBe(true);
    expect(errors.join(' ')).not.toContain('super-secret');
  });

  it('rifiuta una DATABASE_URL senza nome database', () => {
    validCompleteEnv();
    process.env.DATABASE_URL = 'postgresql://wallt:secret@db.example.com:6543';

    const errors = collectProductionConfigErrors();
    expect(errors.some((e) => e.includes('database name'))).toBe(true);
  });

  it('segnala un JWT_SECRET troppo corto', () => {
    validCompleteEnv();
    process.env.JWT_SECRET = 'troppo-corto';

    const errors = collectProductionConfigErrors();
    expect(errors.some((e) => e.includes('JWT_SECRET') && e.includes('short'))).toBe(true);
  });

  it('segnala un CRON_SECRET troppo corto', () => {
    validCompleteEnv();
    process.env.CRON_SECRET = 'troppo-corto';

    const errors = collectProductionConfigErrors();
    expect(errors.some((e) => e.includes('CRON_SECRET') && e.includes('short'))).toBe(true);
  });

  it('segnala GOOGLE_CLIENT_ID impostato senza GOOGLE_CLIENT_SECRET (o viceversa)', () => {
    validCompleteEnv();
    delete process.env.GOOGLE_CLIENT_SECRET;

    const errors = collectProductionConfigErrors();
    expect(errors.some((e) => e.includes('GOOGLE_CLIENT_ID') && e.includes('GOOGLE_CLIENT_SECRET'))).toBe(true);
  });

  it('non richiede variabili Google se Google OAuth non è configurato', () => {
    validCompleteEnv();
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
    delete process.env.GOOGLE_CALLBACK_URL;

    expect(collectProductionConfigErrors()).toEqual([]);
  });

  it('segnala Google configurato senza GOOGLE_CALLBACK_URL né API_URL', () => {
    validCompleteEnv();
    delete process.env.GOOGLE_CALLBACK_URL;
    delete process.env.API_URL;

    const errors = collectProductionConfigErrors();
    expect(errors.some((e) => e.includes('GOOGLE_CALLBACK_URL'))).toBe(true);
  });

  it('accetta API_URL come alternativa a GOOGLE_CALLBACK_URL', () => {
    validCompleteEnv();
    delete process.env.GOOGLE_CALLBACK_URL;
    process.env.API_URL = 'https://api.wallt.example';

    expect(collectProductionConfigErrors()).toEqual([]);
  });
});
