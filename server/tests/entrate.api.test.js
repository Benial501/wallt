const { request, createApp, registerUser, authHeader, Conto, Movimento } = require('./setup');

describe('classificazione entrate e isolamento', () => {
  it('salva natura e periodicità distinte e riepiloga solo le entrate dell’utente', async () => {
    const app = createApp({ enableRateLimit: false });
    const a = await registerUser(app);
    const b = await registerUser(app);
    const contoA = await Conto.create({ user_id: a.res.body.user.id, nome: 'A', tipo: 'banca', saldo: 0, attivo: true });
    const contoB = await Conto.create({ user_id: b.res.body.user.id, nome: 'B', tipo: 'banca', saldo: 0, attivo: true });
    const input = { tipo: 'entrata', importo: 100, categoria: 'stipendio', data: '2026-01-10', natura_entrata: 'stipendio', periodicita_entrata: 'ricorrente' };
    const mine = await request(app).post('/api/movimenti').set(authHeader(a.res.body.token)).send({ ...input, conto_id: contoA.id });
    expect(mine.status).toBe(201);
    expect(mine.body.movimento.natura_entrata).toBe('stipendio');
    expect(mine.body.movimento.periodicita_entrata).toBe('ricorrente');
    const other = await request(app).post('/api/movimenti').set(authHeader(b.res.body.token)).send({ ...input, conto_id: contoB.id, importo: 900 });
    expect(other.status).toBe(201);
    const summary = await request(app).get('/api/movimenti/entrate/riepilogo?da=2026-01&a=2026-03').set(authHeader(a.res.body.token));
    expect(summary.status).toBe(200);
    expect(summary.body.totale).toBe(100);
    expect(summary.body.quote.ricorrente).toBe(100);
    const unknown = await Movimento.create({
      user_id: a.res.body.user.id, conto_id: contoA.id, tipo: 'entrata', importo: 25,
      categoria: 'entrata_extra', data: '2026-02-10', ricorrente: true,
    });
    expect(unknown.natura_entrata).toBe('sconosciuto');
    expect(unknown.periodicita_entrata).toBe('sconosciuta');
    const invalid = await request(app).post('/api/movimenti').set(authHeader(a.res.body.token)).send({
      ...input, conto_id: contoA.id, periodicita_entrata: 'sempre',
    });
    expect(invalid.status).toBe(400);
  });
});
