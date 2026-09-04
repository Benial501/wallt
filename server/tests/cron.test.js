const request = require('supertest');

// tests/setup.js richiede `../app` prima che questa suite venga valutata: il
// registry contiene gia il router cron legato al servizio reale, quindi un
// `jest.mock()` a livello di file non lo raggiungerebbe. Ricostruiamo app e
// servizio insieme dentro un registry isolato, cosi il mock e' davvero attivo.
let app;
let processaRicorrenti;

const loadAppConCronMockato = () => {
  jest.isolateModules(() => {
    jest.doMock('../services/ricorrenti.service', () => ({
      processaRicorrenti: jest.fn().mockResolvedValue({ processed: 2, skipped: 1, failed: 0 }),
      avviaCronRicorrenti: jest.fn(),
    }));
    ({ processaRicorrenti } = require('../services/ricorrenti.service'));
    const { createApp } = require('../app');
    app = createApp({ enableRateLimit: false });
  });
};

describe('endpoint Vercel Cron per le spese ricorrenti', () => {
  let originalSecret;

  beforeEach(() => {
    originalSecret = process.env.CRON_SECRET;
    process.env.CRON_SECRET = 'cron-secret-di-test-lungo-e-casuale';
    loadAppConCronMockato();
  });

  afterEach(() => {
    if (originalSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = originalSecret;
  });

  it('rifiuta richieste senza Bearer secret', async () => {
    await request(app).get('/api/cron/ricorrenti').expect(401);
    expect(processaRicorrenti).not.toHaveBeenCalled();
  });

  it('rifiuta un secret errato', async () => {
    await request(app)
      .get('/api/cron/ricorrenti')
      .set('Authorization', 'Bearer secret-errato')
      .expect(401);
    expect(processaRicorrenti).not.toHaveBeenCalled();
  });

  it('esegue il job con il secret corretto e restituisce solo il riepilogo', async () => {
    const response = await request(app)
      .get('/api/cron/ricorrenti')
      .set('Authorization', `Bearer ${process.env.CRON_SECRET}`)
      .expect(200);

    expect(response.body).toEqual({ processed: 2, skipped: 1, failed: 0 });
    expect(processaRicorrenti).toHaveBeenCalledTimes(1);
  });
});
