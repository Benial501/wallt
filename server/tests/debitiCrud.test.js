// Contratto minimo del CRUD debiti. Task 9 estende separatamente la matrice
// CRUD e l'isolamento cross-user; qui guidiamo le garanzie di sicurezza e
// correttezza richieste dall'endpoint stesso.
const {
  request, createApp, registerUser, authHeader, Conto,
} = require('./setup');
const { Debito } = require('../models');

describe('CRUD Debiti - contratto endpoint', () => {
  let app;
  let token;
  let userId;

  beforeEach(async () => {
    app = createApp({ enableRateLimit: false });
    const { res } = await registerUser(app);
    token = res.body.token;
    userId = res.body.user.id;
  });

  const createPayload = (overrides = {}) => ({
    nome: 'Prestito auto',
    saldo_residuo: '5000.00',
    ...overrides,
  });

  it('crea, elenca, aggiorna e disattiva un debito preservando le date calendario', async () => {
    const created = await request(app)
      .post('/api/debiti')
      .set(authHeader(token))
      .send(createPayload({ prossima_scadenza: '2028-02-29' }));

    expect(created.status).toBe(201);
    expect(created.body.debito).toMatchObject({
      nome: 'Prestito auto',
      tipo: 'altro',
      frequenza: 'mensile',
      prossima_scadenza: '2028-02-29',
      attivo: true,
    });

    const id = created.body.debito.id;
    const listed = await request(app).get('/api/debiti').set(authHeader(token));
    expect(listed.status).toBe(200);
    expect(listed.body.debiti.map((debito) => debito.id)).toContain(id);

    const updated = await request(app)
      .put(`/api/debiti/${id}`)
      .set(authHeader(token))
      .send({ saldo_residuo: '4500.25', data_fine: '2030-12-31' });
    expect(updated.status).toBe(200);
    expect(updated.body.debito.data_fine).toBe('2030-12-31');
    expect(Number(updated.body.debito.saldo_residuo)).toBe(4500.25);

    const deleted = await request(app)
      .delete(`/api/debiti/${id}`)
      .set(authHeader(token));
    expect(deleted.status).toBe(200);

    const persisted = await Debito.findByPk(id);
    expect(persisted).not.toBeNull();
    expect(persisted.attivo).toBe(false);

    const afterDelete = await request(app).get('/api/debiti').set(authHeader(token));
    expect(afterDelete.body.debiti).toHaveLength(0);
  });

  it.each([
    ['saldo residuo negativo', { saldo_residuo: '-0.01' }],
    ['saldo residuo oltre DECIMAL(12,2)', { saldo_residuo: '10000000000.00' }],
    ['rata negativa', { rata_periodica: '-1.00' }],
    ['rata oltre DECIMAL(12,2)', { rata_periodica: '10000000000.00' }],
    ['tasso negativo', { tasso_interesse: '-0.01' }],
    ['tasso oltre 100', { tasso_interesse: '100.01' }],
    ['TAEG negativo', { taeg: '-0.01' }],
    ['TAEG oltre 100', { taeg: '100.01' }],
  ])('rifiuta %s', async (_descrizione, invalidField) => {
    const res = await request(app)
      .post('/api/debiti')
      .set(authHeader(token))
      .send(createPayload(invalidField));

    expect(res.status).toBe(400);
  });

  it.each([
    ['nome', { nome: null }],
    ['saldo_residuo', { saldo_residuo: null }],
    ['tipo', { tipo: null }],
  ])('rifiuta null esplicito nel campo non nullable %s', async (_campo, invalidField) => {
    const res = await request(app)
      .post('/api/debiti')
      .set(authHeader(token))
      .send(createPayload(invalidField));

    expect(res.status).toBe(400);
  });

  it('accetta null nei soli campi nullable', async () => {
    const res = await request(app)
      .post('/api/debiti')
      .set(authHeader(token))
      .send(createPayload({
        rata_periodica: null,
        tasso_interesse: null,
        taeg: null,
        frequenza: null,
        prossima_scadenza: null,
        data_fine: null,
        conto_id: null,
      }));

    expect(res.status).toBe(201);
    expect(res.body.debito).toMatchObject({
      rata_periodica: null,
      tasso_interesse: null,
      taeg: null,
      frequenza: null,
      prossima_scadenza: null,
      data_fine: null,
      conto_id: null,
    });
  });

  it.each([
    ['nome', { nome: null }],
    ['tipo', { tipo: null }],
    ['saldo_residuo', { saldo_residuo: null }],
  ])('rifiuta null esplicito in update per il campo non nullable %s', async (_campo, invalidField) => {
    const created = await request(app)
      .post('/api/debiti')
      .set(authHeader(token))
      .send(createPayload());

    const res = await request(app)
      .put(`/api/debiti/${created.body.debito.id}`)
      .set(authHeader(token))
      .send(invalidField);

    expect(res.status).toBe(400);
  });

  it.each([
    ['timestamp ISO', '2026-10-01T23:30:00-11:00'],
    ['giorno inesistente', '2026-02-29'],
    ['formato non canonico', '2026-2-9'],
  ])('rifiuta una data DATEONLY espressa come %s', async (_descrizione, prossimaScadenza) => {
    const res = await request(app)
      .post('/api/debiti')
      .set(authHeader(token))
      .send(createPayload({ prossima_scadenza: prossimaScadenza }));

    expect(res.status).toBe(400);
  });

  it('verifica ownership e stato attivo del conto in create e update', async () => {
    const contoProprio = await Conto.create({
      user_id: userId, nome: 'Conto proprio', tipo: 'banca', saldo: 0, attivo: true,
    });
    const contoInattivo = await Conto.create({
      user_id: userId, nome: 'Conto inattivo', tipo: 'banca', saldo: 0, attivo: false,
    });
    const { res: altroUtente } = await registerUser(app);
    const contoAltrui = await Conto.create({
      user_id: altroUtente.body.user.id, nome: 'Conto altrui', tipo: 'banca', saldo: 0, attivo: true,
    });

    for (const contoId of [contoInattivo.id, contoAltrui.id]) {
      const rejectedCreate = await request(app)
        .post('/api/debiti')
        .set(authHeader(token))
        .send(createPayload({ conto_id: contoId }));
      expect(rejectedCreate.status).toBe(404);
    }

    const created = await request(app)
      .post('/api/debiti')
      .set(authHeader(token))
      .send(createPayload({ conto_id: contoProprio.id }));
    expect(created.status).toBe(201);

    const rejectedUpdate = await request(app)
      .put(`/api/debiti/${created.body.debito.id}`)
      .set(authHeader(token))
      .send({ conto_id: contoAltrui.id });
    expect(rejectedUpdate.status).toBe(404);

    const persisted = await Debito.findByPk(created.body.debito.id);
    expect(persisted.conto_id).toBe(contoProprio.id);
  });

  it('ignora user_id, attivo e id forniti dal client in create e update', async () => {
    const { res: altroUtente } = await registerUser(app);
    const altroUserId = altroUtente.body.user.id;

    const created = await request(app)
      .post('/api/debiti')
      .set(authHeader(token))
      .send(createPayload({ id: 999999, user_id: altroUserId, attivo: false }));

    expect(created.status).toBe(201);
    expect(created.body.debito.id).not.toBe(999999);
    expect(created.body.debito.user_id).toBe(userId);
    expect(created.body.debito.attivo).toBe(true);

    const updated = await request(app)
      .put(`/api/debiti/${created.body.debito.id}`)
      .set(authHeader(token))
      .send({ id: 888888, user_id: altroUserId, attivo: false, nome: 'Aggiornato' });

    expect(updated.status).toBe(200);
    const persisted = await Debito.findByPk(created.body.debito.id);
    expect(persisted.id).toBe(created.body.debito.id);
    expect(persisted.user_id).toBe(userId);
    expect(persisted.attivo).toBe(true);
    expect(persisted.nome).toBe('Aggiornato');
  });
});
