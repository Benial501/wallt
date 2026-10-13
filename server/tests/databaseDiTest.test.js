const {
  configuraDatabaseDiTest,
  suffissoCheckout,
  NOME_BASE,
} = require('./databaseDiTest');

// Parametri di connessione come li scriverebbe un `.env` della macchina di
// sviluppo: host, porta e credenziali sì, nome del database no.
const ENV = { TEST_DATABASE_URL: 'postgresql://postgres:segreta@127.0.0.1:5432/wallt_test' };

describe('database di test derivato dal checkout', () => {
  it('dà un nome diverso a ogni checkout, mantenendo i parametri di connessione del .env', () => {
    const uno = configuraDatabaseDiTest({ espliciti: {}, env: ENV, radice: '/Users/x/wallt' });
    const altro = configuraDatabaseDiTest({
      espliciti: {}, env: ENV, radice: '/Users/x/wallt/.claude/worktrees/altro',
    });

    expect(uno.nome).toBe(`${NOME_BASE}_${suffissoCheckout('/Users/x/wallt')}`);
    expect(uno.nome).not.toBe(altro.nome);
    expect(new URL(uno.url).pathname.slice(1)).toBe(uno.nome);
    expect(new URL(uno.url).port).toBe('5432');
    expect(new URL(uno.url).username).toBe('postgres');
  });

  it('è stabile: lo stesso checkout ottiene sempre lo stesso database', () => {
    const primo = configuraDatabaseDiTest({ espliciti: {}, env: ENV, radice: '/Users/x/wallt' });
    const secondo = configuraDatabaseDiTest({ espliciti: {}, env: ENV, radice: '/Users/x/wallt' });

    expect(secondo).toEqual(primo);
  });

  it('il nome nel .env NON vince: è identico in ogni checkout e li rimetterebbe tutti insieme', () => {
    const { nome } = configuraDatabaseDiTest({ espliciti: {}, env: ENV, radice: '/Users/x/wallt' });

    expect(nome).not.toBe('wallt_test');
  });

  it('una variabile passata al processo vince sempre: è così che la CI resta su wallt_test', () => {
    const conUrl = configuraDatabaseDiTest({
      espliciti: { TEST_DATABASE_URL: 'postgresql://postgres:postgres@127.0.0.1:5432/wallt_test' },
      env: ENV,
      radice: '/Users/x/wallt',
    });
    expect(conUrl.nome).toBe('wallt_test');
    expect(conUrl.url).toBe('postgresql://postgres:postgres@127.0.0.1:5432/wallt_test');

    const conNome = configuraDatabaseDiTest({
      espliciti: { DB_NAME_TEST: 'wallt_test_mio' }, env: ENV, radice: '/Users/x/wallt',
    });
    expect(conNome.nome).toBe('wallt_test_mio');
    expect(new URL(conNome.url).pathname.slice(1)).toBe('wallt_test_mio');
  });

  it('senza TEST_DATABASE_URL nel .env costruisce l’URL dai parametri DB_*', () => {
    const { nome, url } = configuraDatabaseDiTest({
      espliciti: {},
      env: {
        DB_USER: 'utente', DB_PASSWORD: 'p@ss parola', DB_HOST: 'localhost', DB_PORT: '6543',
      },
      radice: '/Users/x/wallt',
    });

    const analizzato = new URL(url);
    expect(analizzato.hostname).toBe('localhost');
    expect(analizzato.port).toBe('6543');
    expect(decodeURIComponent(analizzato.password)).toBe('p@ss parola');
    expect(analizzato.pathname.slice(1)).toBe(nome);
  });

  it('il nome derivato resta un identificatore valido per PostgreSQL', () => {
    const { nome } = configuraDatabaseDiTest({
      espliciti: {}, env: ENV, radice: '/Users/x/wallt con spazi/è-strano',
    });

    expect(nome).toMatch(/^[a-z0-9_]+$/);
    expect(nome.length).toBeLessThanOrEqual(63);
  });
});
