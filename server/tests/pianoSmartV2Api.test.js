const { request, createApp, registerUser, authHeader, Conto } = require('./setup');

const app = createApp({ enableRateLimit: false });

describe('Piano Smart V2 API', () => {
  test('preview richiede autenticazione', async () => {
    const response = await request(app).post('/api/piano-smart/v2/preview').send({
      amount: '1000.00', mandatoryExpenses: '0.00', recurring: false,
    });
    expect(response.status).toBe(401);
  });

  test('simulare una spesa richiede autenticazione', async () => {
    const response = await request(app).post('/api/piano-smart/v2/simulate-purchase').send({ amount: '50.00' });
    expect(response.status).toBe(401);
  });

  test('genera e salva un piano V2', async () => {
    const { res: registration } = await registerUser(app);
    const response = await request(app)
      .post('/api/piano-smart/v2')
      .set(authHeader(registration.body.token))
      .send({ amount: '1000.00', mandatoryExpenses: '0.00', recurring: false, sourceType: 'regalo' });

    expect(response.status).toBe(201);
    expect(response.body.id).toBeTruthy();
    expect(response.body.engineVersion).toBe('smart-v2');

    const saved = await request(app)
      .get(`/api/piano-smart/v2/${response.body.id}`)
      .set(authHeader(registration.body.token));
    expect(saved.status).toBe(200);
    expect(saved.body.selectedScenario).toBe('bilanciato');
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

  // Secondo difetto Critico trovato dalla verifica end-to-end nel browser:
  // `simulatePurchase` costruiva il contesto con `getFinancialContext`
  // nudo, senza l'arricchimento dell'orizzonte che `currentSituation`
  // applicava da sé (`financialContext.recurring.horizon`). In modalità a
  // data `impegniFinoACents` arrivava sempre `null`, la situazione
  // risultava `non_stimabile`, e l'endpoint rispondeva SEMPRE 400 — un
  // importo valido veniva rifiutato con un messaggio che ne accusava la
  // validità. Questa prova chiama la rotta reale (non il service): è
  // l'unico modo di vedere ciò che manca nel caricamento del contesto, lo
  // stesso motivo per cui il primo difetto era invisibile ai test del
  // service.
  test('simulare una spesa in modalità a data risponde 200, non 400, e il limite non sale dopo l\'acquisto', async () => {
    const { res: registration } = await registerUser(app);
    const token = registration.body.token;
    const userId = registration.body.user.id;

    const profileUpdate = await request(app)
      .put('/api/profilo')
      .set(authHeader(token))
      .send({ orizzonte_tipo: 'data', orizzonte_data: '2027-04-30' });
    expect(profileUpdate.status).toBe(200);

    // Un conto con saldo, altrimenti il caso sarebbe vero ma banale
    // (limite 0 prima, 0 dopo): qui il budget prima dell'acquisto deve
    // essere positivo per dire qualcosa sul "dopo".
    await Conto.create({ user_id: userId, nome: 'Conto corrente', tipo: 'banca', saldo: 5000, attivo: true });

    const response = await request(app)
      .post('/api/piano-smart/v2/simulate-purchase')
      .set(authHeader(token))
      .send({ amount: '250.00' });

    expect(response.status).toBe(200);
    expect(Number(response.body.dailyLimitBefore)).toBeGreaterThan(0);
    expect(Number(response.body.dailyLimitAfter)).toBeLessThanOrEqual(Number(response.body.dailyLimitBefore));
  });
});
