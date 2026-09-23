// Aggregazioni centralizzate sulle spese (Regola 5): totale, media mensile,
// storico, distribuzione per necessità, finestre standard 30/90/180gg e Nmesi.
const {
  request, createApp, registerUser, authHeader, Conto, Movimento,
} = require('./setup');
const { aggregaSpeseGiorni, aggregaSpeseMesi } = require('../services/spese.service');

describe('aggregaSpeseGiorni', () => {
  let app;
  let token;
  let userId;
  let contoId;

  beforeEach(async () => {
    app = createApp({ enableRateLimit: false });
    const { res } = await registerUser(app);
    token = res.body.token;
    userId = res.body.user.id;
    const contoRes = await request(app).post('/api/conti').set(authHeader(token)).send({ nome: 'C', tipo: 'banca', saldo_iniziale: 10000 });
    contoId = contoRes.body.conto.id;
  });

  it('rifiuta una finestra non standard', async () => {
    await expect(aggregaSpeseGiorni(userId, 45, '2026-09-23')).rejects.toMatchObject({ statusCode: 400 });
  });

  it('zero osservato: nessun movimento -> totale 0, non un errore', async () => {
    const res = await aggregaSpeseGiorni(userId, 30, '2026-09-23');
    expect(res.totale).toBe(0);
    expect(res.byNecessity.totale).toBe(0);
  });

  it('somma solo le uscite nella finestra, esclude i trasferimenti', async () => {
    await request(app).post('/api/movimenti').set(authHeader(token)).send({
      conto_id: contoId, tipo: 'uscita', importo: 100, categoria: 'affitto', data: '2026-09-10',
    });
    await request(app).post('/api/movimenti').set(authHeader(token)).send({
      conto_id: contoId, tipo: 'uscita', importo: 50, categoria: 'svago', data: '2026-08-01', // fuori dalla finestra 30gg
    });
    const contoDestRes = await request(app).post('/api/conti').set(authHeader(token)).send({ nome: 'C2', tipo: 'banca', saldo_iniziale: 0 });
    await request(app).post('/api/conti/trasferimento').set(authHeader(token)).send({
      conto_origine_id: contoId, conto_destinazione_id: contoDestRes.body.conto.id, importo: 500, data: '2026-09-15',
    });

    const res = await aggregaSpeseGiorni(userId, 30, '2026-09-23');
    expect(res.totale).toBe(100);
    expect(res.da).toBe('2026-08-25');
    expect(res.a).toBe('2026-09-23');
  });

  it('la distribuzione per necessità riconcilia sempre col totale', async () => {
    await request(app).post('/api/movimenti').set(authHeader(token)).send({
      conto_id: contoId, tipo: 'uscita', importo: 100, categoria: 'affitto', data: '2026-09-10', // essenziale
    });
    await request(app).post('/api/movimenti').set(authHeader(token)).send({
      conto_id: contoId, tipo: 'uscita', importo: 40, categoria: 'svago', data: '2026-09-12', // discrezionale
    });

    const res = await aggregaSpeseGiorni(userId, 30, '2026-09-23');
    const { essenziale, semi_essenziale, discrezionale, non_classificata } = res.byNecessity;
    expect(essenziale + semi_essenziale + discrezionale + non_classificata).toBe(res.totale);
    expect(essenziale).toBe(100);
    expect(discrezionale).toBe(40);
  });
});

describe('aggregaSpeseMesi', () => {
  let app;
  let token;
  let userId;
  let contoId;

  beforeEach(async () => {
    app = createApp({ enableRateLimit: false });
    const { res } = await registerUser(app);
    token = res.body.token;
    userId = res.body.user.id;
    const contoRes = await request(app).post('/api/conti').set(authHeader(token)).send({ nome: 'C', tipo: 'banca', saldo_iniziale: 10000 });
    contoId = contoRes.body.conto.id;
  });

  const riferimento = new Date('2026-09-23T10:00:00Z'); // mercoledì, CEST

  it('lo storico ha un punto per mese, dal più vecchio al più recente', async () => {
    const res = await aggregaSpeseMesi(userId, 3, riferimento);
    expect(res.storico).toHaveLength(3);
    expect(res.storico.map((m) => m.periodo)).toEqual(['2026-07', '2026-08', '2026-09']);
  });

  it('solo il mese corrente è marcato parziale', async () => {
    const res = await aggregaSpeseMesi(userId, 3, riferimento);
    expect(res.storico.map((m) => m.parziale)).toEqual([false, false, true]);
  });

  it('media_mensile usa solo i mesi completi, esclude quello corrente parziale', async () => {
    await request(app).post('/api/movimenti').set(authHeader(token)).send({
      conto_id: contoId, tipo: 'uscita', importo: 200, categoria: 'affitto', data: '2026-07-05',
    });
    await request(app).post('/api/movimenti').set(authHeader(token)).send({
      conto_id: contoId, tipo: 'uscita', importo: 400, categoria: 'affitto', data: '2026-08-05',
    });
    // Spesa consistente nel mese corrente (parziale): non deve alzare la media.
    await request(app).post('/api/movimenti').set(authHeader(token)).send({
      conto_id: contoId, tipo: 'uscita', importo: 3000, categoria: 'affitto', data: '2026-09-20',
    });

    const res = await aggregaSpeseMesi(userId, 3, riferimento);
    expect(res.mesi_completi).toBe(2);
    expect(res.media_mensile).toBe(300); // (200 + 400) / 2, mai calcolata sul mese corrente
    expect(res.totale).toBe(200 + 400 + 3000); // il totale invece include tutto
  });

  it('storico insufficiente: nessun mese completo -> media_mensile null, non 0', async () => {
    const res = await aggregaSpeseMesi(userId, 1, riferimento); // solo il mese corrente
    expect(res.mesi_completi).toBe(0);
    expect(res.media_mensile).toBeNull();
  });

  it('la distribuzione per necessità sull\'intera finestra riconcilia col totale', async () => {
    await request(app).post('/api/movimenti').set(authHeader(token)).send({
      conto_id: contoId, tipo: 'uscita', importo: 150, categoria: 'affitto', data: '2026-08-05',
    });
    await request(app).post('/api/movimenti').set(authHeader(token)).send({
      conto_id: contoId, tipo: 'uscita', importo: 60, categoria: 'svago', data: '2026-09-10',
    });

    const res = await aggregaSpeseMesi(userId, 3, riferimento);
    const b = res.byNecessity;
    expect(b.essenziale + b.semi_essenziale + b.discrezionale + b.non_classificata).toBe(res.totale);
  });
});
