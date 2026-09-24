const { request, createApp, registerUser, authHeader } = require('./setup');

const app = createApp({ enableRateLimit: false });

describe('Piano Smart V2 API', () => {
  test('preview richiede autenticazione', async () => {
    const response = await request(app).post('/api/piano-smart/v2/preview').send({
      amount: '1000.00', mandatoryExpenses: '0.00', recurring: false,
    });
    expect(response.status).toBe(401);
  });

  test('le rotte GET V2 non vengono catturate dal router V1', async () => {
    const { res: registration } = await registerUser(app);
    const response = await request(app)
      .get('/api/piano-smart/v2/not-a-plan/scenarios')
      .set(authHeader(registration.body.token));

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Dati non validi');
  });

  test('rifiuta un identificativo azione non numerico senza errore database', async () => {
    const { res: registration } = await registerUser(app);
    const response = await request(app)
      .patch('/api/piano-smart/v2/1/actions/not-an-action')
      .set(authHeader(registration.body.token))
      .send({ status: 'completata' });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Dati non validi');
  });
});
