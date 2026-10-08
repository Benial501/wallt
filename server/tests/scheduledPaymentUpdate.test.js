const {
  request, registerUser, authHeader, Conto, Movimento, createApp,
} = require('./setup');
const { ScheduledPayment, ScheduledPaymentContribution, PaymentPlan } = require('../models');
const { oggiLocale, sommaGiorni } = require('../utils/dateRome');

/**
 * Riprogrammare una scadenza è l'operazione più ordinaria che esista: la
 * bolletta arriva prima, l'affitto si sposta, l'importo cambia. Finché non
 * esisteva, l'unica strada era annullare e ricreare — e con l'annullamento si
 * perdevano gli accantonamenti già messi da parte per quella spesa.
 */
describe('modifica di una scadenza programmata', () => {
  let app;
  let userId;
  let token;
  let conto;
  let altroConto;
  let payment;
  const fraGiorni = (giorni) => sommaGiorni(oggiLocale(), giorni);

  beforeEach(async () => {
    app = createApp({ enableRateLimit: false });
    const { res } = await registerUser(app);
    userId = res.body.user.id;
    token = res.body.token;
    conto = await Conto.create({
      user_id: userId, nome: 'Conto principale', tipo: 'banca', saldo: 500, attivo: true,
    });
    altroConto = await Conto.create({
      user_id: userId, nome: 'Secondo conto', tipo: 'banca', saldo: 300, attivo: true,
    });
    payment = await ScheduledPayment.create({
      user_id: userId, conto_id: conto.id, tipo: 'uscita', importo: '180.00',
      categoria: 'casa', descrizione: 'Bolletta', data_scadenza: fraGiorni(28), stato: 'in_attesa',
    });
  });

  it('sposta la data e ricalcola la quota di accantonamento sul tempo che resta', async () => {
    await ScheduledPaymentContribution.create({
      user_id: userId, pagamento_programmato_id: payment.id, importo: '40.00', data_contributo: oggiLocale(),
    });

    const response = await request(app)
      .patch(`/api/movimenti/programmate/${payment.id}`)
      .set(authHeader(token))
      .send({ due_date: fraGiorni(14) });

    expect(response.status).toBe(200);
    expect(response.body.payment.data_scadenza).toBe(fraGiorni(14));
    // 180 - 40 già accantonati = 140 su due settimane: 70 a settimana.
    expect(response.body.funding).toMatchObject({
      contributed: '40.00', remaining: '140.00', periodsRemaining: 2, weeklyQuota: '70.00',
    });

    await payment.reload();
    expect(payment.data_scadenza).toBe(fraGiorni(14));
    // Riprogrammare non muove denaro: nessun movimento, saldo invariato.
    expect(await Movimento.count({ where: { user_id: userId } })).toBe(0);
    await conto.reload();
    expect(Number(conto.saldo)).toBe(500);
  });

  it('aggiorna importo, categoria, conto e descrizione in una sola richiesta', async () => {
    const response = await request(app)
      .patch(`/api/movimenti/programmate/${payment.id}`)
      .set(authHeader(token))
      .send({
        amount: '95.50', category: 'benzina_trasporti', account_id: altroConto.id, description: 'Abbonamento',
      });

    expect(response.status).toBe(200);
    await payment.reload();
    expect(payment.importo).toBe('95.50');
    expect(payment.categoria).toBe('benzina_trasporti');
    expect(payment.conto_id).toBe(altroConto.id);
    expect(payment.descrizione).toBe('Abbonamento');
    expect(payment.data_scadenza).toBe(fraGiorni(28));
  });

  it('rifiuta un importo inferiore a quanto è già stato accantonato', async () => {
    await ScheduledPaymentContribution.create({
      user_id: userId, pagamento_programmato_id: payment.id, importo: '120.00', data_contributo: oggiLocale(),
    });

    const response = await request(app)
      .patch(`/api/movimenti/programmate/${payment.id}`)
      .set(authHeader(token))
      .send({ amount: '100.00' });

    expect(response.status).toBe(400);
    await payment.reload();
    expect(payment.importo).toBe('180.00');
  });

  it('rifiuta una data nel passato', async () => {
    const response = await request(app)
      .patch(`/api/movimenti/programmate/${payment.id}`)
      .set(authHeader(token))
      .send({ due_date: sommaGiorni(oggiLocale(), -1) });

    expect(response.status).toBe(400);
    await payment.reload();
    expect(payment.data_scadenza).toBe(fraGiorni(28));
  });

  it('rifiuta una richiesta che non chiede nessuna modifica', async () => {
    const response = await request(app)
      .patch(`/api/movimenti/programmate/${payment.id}`)
      .set(authHeader(token))
      .send({});

    expect(response.status).toBe(400);
  });

  it('riporta in attesa un’entrata segnata in ritardo quando viene riprogrammata', async () => {
    const entrata = await ScheduledPayment.create({
      user_id: userId, conto_id: conto.id, tipo: 'entrata', importo: '1200.00',
      categoria: 'stipendio', data_scadenza: oggiLocale(), stato: 'in_ritardo',
    });

    const response = await request(app)
      .patch(`/api/movimenti/programmate/${entrata.id}`)
      .set(authHeader(token))
      .send({ due_date: fraGiorni(5) });

    expect(response.status).toBe(200);
    expect(response.body.payment.stato).toBe('in_attesa');
    // Un'entrata non ha accantonamenti: nessun piano da ricalcolare.
    expect(response.body.funding).toBeNull();
  });

  it('di una rata consente solo lo spostamento della data', async () => {
    const plan = await PaymentPlan.create({
      user_id: userId, conto_id: conto.id, categoria: 'acquisti_vari', descrizione: 'Telefono',
      importo_acquisto: '600.00', importo_iniziale: '0.00', numero_pagamenti: 3,
      tasso_annuo: '0.0000', totale_da_restituire: '600.00', interessi_stimati: '0.00', stato: 'attivo',
    });
    const rata = await ScheduledPayment.create({
      user_id: userId, piano_id: plan.id, conto_id: conto.id, tipo: 'uscita', importo: '200.00',
      categoria: 'acquisti_vari', descrizione: 'Telefono', data_scadenza: fraGiorni(10), stato: 'in_attesa',
    });

    const spostamento = await request(app)
      .patch(`/api/movimenti/programmate/${rata.id}`)
      .set(authHeader(token))
      .send({ due_date: fraGiorni(20) });
    expect(spostamento.status).toBe(200);
    await rata.reload();
    expect(rata.data_scadenza).toBe(fraGiorni(20));

    const importo = await request(app)
      .patch(`/api/movimenti/programmate/${rata.id}`)
      .set(authHeader(token))
      .send({ amount: '150.00' });
    expect(importo.status).toBe(409);
    await rata.reload();
    expect(rata.importo).toBe('200.00');
  });

  it('non modifica una scadenza già pagata o annullata', async () => {
    await payment.update({ stato: 'pagato', pagato_il: oggiLocale() });
    const pagata = await request(app)
      .patch(`/api/movimenti/programmate/${payment.id}`)
      .set(authHeader(token))
      .send({ due_date: fraGiorni(40) });
    expect(pagata.status).toBe(409);

    await payment.update({ stato: 'annullato', pagato_il: null });
    const annullata = await request(app)
      .patch(`/api/movimenti/programmate/${payment.id}`)
      .set(authHeader(token))
      .send({ due_date: fraGiorni(40) });
    expect(annullata.status).toBe(409);
  });

  it('rifiuta un conto che non appartiene all’utente', async () => {
    const { res: altroUtente } = await registerUser(app);
    const contoAltrui = await Conto.create({
      user_id: altroUtente.body.user.id, nome: 'Conto altrui', tipo: 'banca', saldo: 100, attivo: true,
    });

    const response = await request(app)
      .patch(`/api/movimenti/programmate/${payment.id}`)
      .set(authHeader(token))
      .send({ account_id: contoAltrui.id });

    expect(response.status).toBe(404);
    await payment.reload();
    expect(payment.conto_id).toBe(conto.id);
  });

  it('isola la modifica per utente', async () => {
    const { res: altroUtente } = await registerUser(app);
    const response = await request(app)
      .patch(`/api/movimenti/programmate/${payment.id}`)
      .set(authHeader(altroUtente.body.token))
      .send({ due_date: fraGiorni(40) });

    expect(response.status).toBe(404);
    await payment.reload();
    expect(payment.data_scadenza).toBe(fraGiorni(28));
  });

  it('richiede l’autenticazione', async () => {
    const response = await request(app)
      .patch(`/api/movimenti/programmate/${payment.id}`)
      .send({ due_date: fraGiorni(40) });

    expect(response.status).toBe(401);
  });
});
