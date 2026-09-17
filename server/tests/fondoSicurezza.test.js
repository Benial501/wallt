// tipo_obiettivo distingue un obiettivo generico da un fondo di sicurezza,
// per cui e' calcolabile mesiCopertura = importoFondo / speseEssenzialiMensili.
const {
  request, createApp, registerUser, authHeader,
} = require('./setup');

describe('Obiettivo.tipo_obiettivo', () => {
  let app;
  let token;

  beforeEach(async () => {
    app = createApp({ enableRateLimit: false });
    const { res } = await registerUser(app);
    token = res.body.token;
  });

  it('default a generico se non specificato', async () => {
    const res = await request(app)
      .post('/api/obiettivi')
      .set(authHeader(token))
      .send({ nome: 'Vacanza', importo_target: 1000 });

    expect(res.body.obiettivo.tipo_obiettivo).toBe('generico');
  });

  it('accetta fondo_sicurezza esplicitamente', async () => {
    const res = await request(app)
      .post('/api/obiettivi')
      .set(authHeader(token))
      .send({ nome: 'Fondo emergenza', importo_target: 5000, tipo_obiettivo: 'fondo_sicurezza' });

    expect(res.body.obiettivo.tipo_obiettivo).toBe('fondo_sicurezza');
  });

  it('rifiuta un tipo_obiettivo non valido', async () => {
    const res = await request(app)
      .post('/api/obiettivi')
      .set(authHeader(token))
      .send({ nome: 'X', importo_target: 100, tipo_obiettivo: 'non_esiste' });

    expect(res.status).toBe(400);
  });

  it('può essere cambiato via update', async () => {
    const created = await request(app)
      .post('/api/obiettivi')
      .set(authHeader(token))
      .send({ nome: 'Vacanza', importo_target: 1000 });

    const res = await request(app)
      .put(`/api/obiettivi/${created.body.obiettivo.id}`)
      .set(authHeader(token))
      .send({ tipo_obiettivo: 'fondo_sicurezza' });

    expect(res.body.obiettivo.tipo_obiettivo).toBe('fondo_sicurezza');
  });
});
