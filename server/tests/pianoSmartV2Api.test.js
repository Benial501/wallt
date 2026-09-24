const { request, createApp } = require('./setup');

const app = createApp({ enableRateLimit: false });

describe('Piano Smart V2 API', () => {
  test('preview richiede autenticazione', async () => {
    const response = await request(app).post('/api/piano-smart/v2/preview').send({
      amount: '1000.00', mandatoryExpenses: '0.00', recurring: false,
    });
    expect(response.status).toBe(401);
  });
});
