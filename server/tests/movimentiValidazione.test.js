// Un movimento rappresenta un'operazione già avvenuta: rifiuta date future
// rispetto a Europe/Rome (Regola 13). La programmazione delle ricorrenti è
// un concetto separato e non è toccata qui.
const {
  request, createApp, registerUser, authHeader,
} = require('./setup');

describe('Validazione data movimento — rifiuta il futuro', () => {
  let app;
  let token;
  let contoId;

  beforeEach(async () => {
    app = createApp({ enableRateLimit: false });
    const { res } = await registerUser(app);
    token = res.body.token;
    const contoRes = await request(app).post('/api/conti').set(authHeader(token)).send({ nome: 'C', tipo: 'banca', saldo_iniziale: 1000 });
    contoId = contoRes.body.conto.id;
  });

  const domaniIso = () => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + 2); // margine oltre il fuso, non solo +1 giorno
    return d.toISOString().slice(0, 10);
  };

  it('POST rifiuta una data nel futuro', async () => {
    const res = await request(app).post('/api/movimenti').set(authHeader(token)).send({
      conto_id: contoId, tipo: 'uscita', importo: 10, categoria: 'affitto', data: domaniIso(),
    });
    expect(res.status).toBe(400);
  });

  it('POST accetta la data di oggi', async () => {
    const oggi = new Date().toISOString().slice(0, 10);
    const res = await request(app).post('/api/movimenti').set(authHeader(token)).send({
      conto_id: contoId, tipo: 'uscita', importo: 10, categoria: 'affitto', data: oggi,
    });
    expect(res.status).toBe(201);
  });

  it('PUT rifiuta di spostare un movimento esistente nel futuro', async () => {
    const oggi = new Date().toISOString().slice(0, 10);
    const created = await request(app).post('/api/movimenti').set(authHeader(token)).send({
      conto_id: contoId, tipo: 'uscita', importo: 10, categoria: 'affitto', data: oggi,
    });
    const res = await request(app)
      .put(`/api/movimenti/${created.body.movimento.id}`)
      .set(authHeader(token))
      .send({ data: domaniIso() });
    expect(res.status).toBe(400);
  });
});
