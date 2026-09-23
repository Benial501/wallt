const { request, createApp, registerUser, authHeader } = require('./setup');

describe('progresso obiettivi e isolamento', () => {
  it('espone formule e stati coerenti senza scadenza e dopo modifica target', async () => {
    const app = createApp({ enableRateLimit: false });
    const a = await registerUser(app);
    const b = await registerUser(app);
    const token = a.res.body.token;
    const created = await request(app).post('/api/obiettivi').set(authHeader(token)).send({
      nome: 'Risparmio', importo_target: 1000, importo_iniziale: 400,
    });
    expect(created.status).toBe(201);
    const id = created.body.obiettivo.id;
    const projection = await request(app).get(`/api/obiettivi/${id}/proiezione`).set(authHeader(token));
    expect(projection.body.stato).toBe('senza_scadenza');
    expect(projection.body.importo_restante).toBe(600);
    expect(projection.body.contributo_mensile_richiesto).toBeNull();
    const other = await request(app).get(`/api/obiettivi/${id}/proiezione`).set(authHeader(b.res.body.token));
    expect(other.status).toBe(404);
    const changed = await request(app).put(`/api/obiettivi/${id}`).set(authHeader(token)).send({ importo_target: 300 });
    expect(changed.status).toBe(200);
    const list = await request(app).get('/api/obiettivi').set(authHeader(token));
    expect(list.body.completati[0].proiezione.stato).toBe('completato');
  });
});

describe('priorità obiettivi', () => {
  let app;
  let token;

  beforeEach(async () => {
    app = createApp({ enableRateLimit: false });
    const { res } = await registerUser(app);
    token = res.body.token;
  });

  it('senza priorità in creazione, resta null (non un valore inventato)', async () => {
    const created = await request(app).post('/api/obiettivi').set(authHeader(token)).send({
      nome: 'Vacanza', importo_target: 500,
    });
    expect(created.body.obiettivo.priorita).toBeNull();

    const proiezione = await request(app).get(`/api/obiettivi/${created.body.obiettivo.id}/proiezione`).set(authHeader(token));
    expect(proiezione.body.priorita).toBeNull();
  });

  it('accetta alta/media/bassa in creazione e le persiste', async () => {
    const created = await request(app).post('/api/obiettivi').set(authHeader(token)).send({
      nome: 'Fondo emergenza', importo_target: 3000, priorita: 'alta',
    });
    expect(created.status).toBe(201);
    expect(created.body.obiettivo.priorita).toBe('alta');
  });

  it('rifiuta un valore non valido in creazione e in modifica', async () => {
    const created = await request(app).post('/api/obiettivi').set(authHeader(token)).send({
      nome: 'Auto', importo_target: 10000, priorita: 'urgentissima',
    });
    expect(created.status).toBe(400);

    const valido = await request(app).post('/api/obiettivi').set(authHeader(token)).send({
      nome: 'Auto', importo_target: 10000, priorita: 'bassa',
    });
    const cambiato = await request(app)
      .put(`/api/obiettivi/${valido.body.obiettivo.id}`)
      .set(authHeader(token))
      .send({ priorita: 'urgentissima' });
    expect(cambiato.status).toBe(400);
  });

  it('PUT senza priorità nel body preserva quella esistente', async () => {
    const created = await request(app).post('/api/obiettivi').set(authHeader(token)).send({
      nome: 'Studio', importo_target: 2000, priorita: 'media',
    });
    const rinominato = await request(app)
      .put(`/api/obiettivi/${created.body.obiettivo.id}`)
      .set(authHeader(token))
      .send({ nome: 'Studio rinominato' });
    expect(rinominato.body.obiettivo.priorita).toBe('media');
  });

  it('un obiettivo legacy senza priorità (colonna null) espone priorita: null nella proiezione', async () => {
    const { Obiettivo } = require('../models');
    const created = await request(app).post('/api/obiettivi').set(authHeader(token)).send({
      nome: 'Legacy', importo_target: 100,
    });
    await Obiettivo.update({ priorita: null }, { where: { id: created.body.obiettivo.id } });

    const proiezione = await request(app).get(`/api/obiettivi/${created.body.obiettivo.id}/proiezione`).set(authHeader(token));
    expect(proiezione.body.priorita).toBeNull();
  });
});
