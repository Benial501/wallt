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

describe('FondoSicurezzaService.calcolaMesiCopertura', () => {
  const { Conto, Movimento } = require('./setup');
  let app;
  let token;
  let contoId;

  const creaMovimentoUscita = async (importo, categoria, data) => request(app)
    .post('/api/movimenti')
    .set(authHeader(token))
    .send({ conto_id: contoId, tipo: 'uscita', importo, categoria, data });

  beforeEach(async () => {
    app = createApp({ enableRateLimit: false });
    const { res } = await registerUser(app);
    token = res.body.token;
    const contoRes = await request(app).post('/api/conti').set(authHeader(token)).send({ nome: 'C', tipo: 'banca', saldo_iniziale: 10000 });
    contoId = contoRes.body.conto.id;
  });

  const creaFondo = async (importoAttuale = 0) => {
    const res = await request(app)
      .post('/api/obiettivi')
      .set(authHeader(token))
      .send({
        nome: 'Fondo', importo_target: 10000, tipo_obiettivo: 'fondo_sicurezza', importo_iniziale: importoAttuale,
      });
    return res.body.obiettivo.id;
  };

  it('dati_insufficienti se non c\'è nessuno storico di spese', async () => {
    const id = await creaFondo(1000);
    const res = await request(app).get(`/api/obiettivi/${id}/copertura`).set(authHeader(token));
    expect(res.body.stato).toBe('dati_insufficienti');
    expect(res.body.mesi_copertura).toBeNull();
  });

  it('non_calcolabile se c\'è storico ma zero spese essenziali', async () => {
    const meseScorso = new Date();
    meseScorso.setMonth(meseScorso.getMonth() - 1);
    const data = meseScorso.toISOString().split('T')[0];
    await creaMovimentoUscita(100, 'svago', data); // discrezionale, non essenziale

    const id = await creaFondo(1000);
    const res = await request(app).get(`/api/obiettivi/${id}/copertura`).set(authHeader(token));
    expect(res.body.stato).toBe('non_calcolabile');
  });

  it('disponibile con mesi_copertura=0 se il fondo è vuoto ma ci sono spese essenziali', async () => {
    const meseScorso = new Date();
    meseScorso.setMonth(meseScorso.getMonth() - 1);
    const data = meseScorso.toISOString().split('T')[0];
    await creaMovimentoUscita(300, 'affitto', data);

    const id = await creaFondo(0);
    const res = await request(app).get(`/api/obiettivi/${id}/copertura`).set(authHeader(token));
    expect(res.body.stato).toBe('disponibile');
    expect(res.body.mesi_copertura).toBe(0);
  });

  it('calcola correttamente la copertura con dati completi, anche se l\'obiettivo è completato', async () => {
    const meseScorso = new Date();
    meseScorso.setMonth(meseScorso.getMonth() - 1);
    const data = meseScorso.toISOString().split('T')[0];
    // 900€ di essenziali nell'ultimo mese -> media 3 mesi = 300€/mese (0 negli altri 2 mesi contati).
    await creaMovimentoUscita(900, 'affitto', data);

    const id = await creaFondo(1500);
    // Completa l'obiettivo per verificare che non cambi il comportamento.
    await request(app).post(`/api/obiettivi/${id}/contributi`).set(authHeader(token)).send({ importo: 8500 });

    const res = await request(app).get(`/api/obiettivi/${id}/copertura`).set(authHeader(token));
    expect(res.body.stato).toBe('disponibile');
    expect(res.body.spese_essenziali_mensili).toBe(300);
    expect(res.body.mesi_copertura).toBe(round1(10000 / 300));

    function round1(v) { return Math.round(v * 10) / 10; }
  });

  it('400 se l\'obiettivo non è un fondo di sicurezza', async () => {
    const created = await request(app).post('/api/obiettivi').set(authHeader(token)).send({ nome: 'Vacanza', importo_target: 1000 });
    const res = await request(app).get(`/api/obiettivi/${created.body.obiettivo.id}/copertura`).set(authHeader(token));
    expect(res.status).toBe(400);
  });

  it('404 se l\'obiettivo non esiste o è di un altro utente', async () => {
    const res = await request(app).get('/api/obiettivi/999999/copertura').set(authHeader(token));
    expect(res.status).toBe(404);
  });

  it('404 se l\'obiettivo esiste ma è di un altro utente', async () => {
    const { res: registerRes } = await registerUser(app);
    const altroToken = registerRes.body.token;
    const altroFondoRes = await request(app)
      .post('/api/obiettivi')
      .set(authHeader(altroToken))
      .send({ nome: 'Fondo altrui', importo_target: 5000, tipo_obiettivo: 'fondo_sicurezza' });
    const altroId = altroFondoRes.body.obiettivo.id;

    const res = await request(app).get(`/api/obiettivi/${altroId}/copertura`).set(authHeader(token));
    expect(res.status).toBe(404);
  });
});
