const {
  request, registerUser, authHeader, Conto, Movimento, createApp,
} = require('./setup');
const { ScheduledPayment } = require('../models');

describe('accantonamenti delle spese programmate', () => {
  let app;
  let userId;
  let token;
  let conto;
  let payment;

  beforeEach(async () => {
    app = createApp({ enableRateLimit: false });
    const { res } = await registerUser(app);
    userId = res.body.user.id;
    token = res.body.token;
    conto = await Conto.create({
      user_id: userId, nome: 'Conto accantonamenti', tipo: 'banca', saldo: 500, attivo: true,
    });
    payment = await ScheduledPayment.create({
      user_id: userId, conto_id: conto.id, tipo: 'uscita', importo: '180.00',
      categoria: 'casa', descrizione: 'Spesa futura', data_scadenza: '2026-11-28', stato: 'in_attesa',
    });
  });

  it('registra e legge contributi virtuali senza creare movimenti o modificare il conto', async () => {
    const prima = await Movimento.count({ where: { user_id: userId } });
    const response = await request(app)
      .post(`/api/movimenti/programmate/${payment.id}/accantonamenti`)
      .set(authHeader(token))
      .send({ amount: '30.00', date: '2026-10-01' });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      paymentId: payment.id,
      contributed: '30.00',
      remaining: '150.00',
      writesAccountBalance: false,
      writesMovement: false,
    });
    expect(await Movimento.count({ where: { user_id: userId } })).toBe(prima);
    await conto.reload();
    expect(Number(conto.saldo)).toBe(500);

    const listing = await request(app)
      .get(`/api/movimenti/programmate/${payment.id}/accantonamenti`)
      .set(authHeader(token));
    expect(listing.status).toBe(200);
    expect(listing.body.contributions).toHaveLength(1);
    expect(listing.body.contributed).toBe('30.00');
  });

  it('rifiuta contributi che superano il residuo della spesa', async () => {
    const response = await request(app)
      .post(`/api/movimenti/programmate/${payment.id}/accantonamenti`)
      .set(authHeader(token))
      .send({ amount: '180.01', date: '2026-10-01' });

    expect(response.status).toBe(400);
    expect(await Movimento.count({ where: { user_id: userId } })).toBe(0);
  });

  it('mostra subito la spesa futura nel Piano Smart senza inserirla tra i movimenti', async () => {
    const response = await request(app)
      .get('/api/piano-smart/v2/current-situation')
      .set(authHeader(token));

    expect(response.status).toBe(200);
    expect(response.body.upcomingExpensePlans).toEqual(expect.arrayContaining([
      expect.objectContaining({
        paymentId: payment.id,
        amount: '180.00',
        remaining: '180.00',
        dueDate: '2026-11-28',
        contributions: [],
      }),
    ]));
    expect(await Movimento.count({ where: { user_id: userId } })).toBe(0);
  });

  it('isola letture e scritture per utente', async () => {
    const { res: altroUtente } = await registerUser(app);
    const read = await request(app)
      .get(`/api/movimenti/programmate/${payment.id}/accantonamenti`)
      .set(authHeader(altroUtente.body.token));
    const write = await request(app)
      .post(`/api/movimenti/programmate/${payment.id}/accantonamenti`)
      .set(authHeader(altroUtente.body.token))
      .send({ amount: '10.00', date: '2026-10-01' });

    expect(read.status).toBe(404);
    expect(write.status).toBe(404);
    expect(await Movimento.count({ where: { user_id: userId } })).toBe(0);
  });

  it('rifiuta importi malformati e scadenze che non sono più in attesa', async () => {
    const invalidAmount = await request(app)
      .post(`/api/movimenti/programmate/${payment.id}/accantonamenti`)
      .set(authHeader(token))
      .send({ amount: '10.001', date: '2026-10-01' });
    expect(invalidAmount.status).toBe(400);

    await payment.update({ stato: 'pagato' });
    const closedPayment = await request(app)
      .post(`/api/movimenti/programmate/${payment.id}/accantonamenti`)
      .set(authHeader(token))
      .send({ amount: '10.00', date: '2026-10-01' });
    expect(closedPayment.status).toBe(409);
  });

  it('serializza versamenti concorrenti e la conferma registra la spesa una sola volta', async () => {
    const contribuisci = () => request(app)
      .post(`/api/movimenti/programmate/${payment.id}/accantonamenti`)
      .set(authHeader(token))
      .send({ amount: '100.00', date: '2026-10-01' });
    const concurrent = await Promise.all([contribuisci(), contribuisci()]);
    expect(concurrent.map((response) => response.status).sort()).toEqual([201, 400]);
    const contributionSummary = await request(app)
      .get(`/api/movimenti/programmate/${payment.id}/accantonamenti`)
      .set(authHeader(token));
    expect(contributionSummary.body.contributed).toBe('100.00');
    expect(await Movimento.count({ where: { user_id: userId } })).toBe(0);

    const confirmed = await request(app)
      .post(`/api/movimenti/programmate/${payment.id}/conferma`)
      .set(authHeader(token));
    expect(confirmed.status).toBe(200);
    expect(await Movimento.count({ where: { user_id: userId } })).toBe(1);
    await conto.reload();
    expect(Number(conto.saldo)).toBe(320);
    const secondConfirmation = await request(app)
      .post(`/api/movimenti/programmate/${payment.id}/conferma`)
      .set(authHeader(token));
    expect(secondConfirmation.status).toBe(409);
    expect(await Movimento.count({ where: { user_id: userId } })).toBe(1);
  });
});
