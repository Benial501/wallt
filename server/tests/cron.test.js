const request = require('supertest');

jest.mock('../services/ricorrenti.service', () => ({
  processaRicorrenti: jest.fn().mockResolvedValue({ processed: 2, skipped: 1, failed: 0 }),
  avviaCronRicorrenti: jest.fn(),
}));

const { createApp } = require('../app');
const { processaRicorrenti } = require('../services/ricorrenti.service');

describe('endpoint Vercel Cron per le spese ricorrenti', () => {
  let originalSecret;
  let app;

  beforeEach(() => {
    originalSecret = process.env.CRON_SECRET;
    process.env.CRON_SECRET = 'cron-secret-di-test-lungo-e-casuale';
    processaRicorrenti.mockClear();
    app = createApp({ enableRateLimit: false });
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
