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
