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

// Punto 2 dell'audit: lo storico non contiene zeri inventati prima del primo
// movimento dell'utente, e le medie per livello di necessità usano lo stesso
// denominatore della media complessiva (i soli mesi civili completi).
describe('aggregaSpeseMesi — finestra osservata e medie per necessità', () => {
  let app;
  let token;
  let userId;
  let contoId;
  const riferimento = new Date('2026-09-23T10:00:00Z');

  beforeEach(async () => {
    app = createApp({ enableRateLimit: false });
    const { res } = await registerUser(app);
    token = res.body.token;
    userId = res.body.user.id;
    const contoRes = await request(app).post('/api/conti').set(authHeader(token)).send({ nome: 'C', tipo: 'banca', saldo_iniziale: 10000 });
    contoId = contoRes.body.conto.id;
  });

  const spesa = (importo, categoria, data) => request(app).post('/api/movimenti').set(authHeader(token)).send({
    conto_id: contoId, tipo: 'uscita', importo, categoria, data,
  });

  it('senza primoMovimento noto lo storico resta l\'intera finestra richiesta (comportamento storico)', async () => {
    const res = await aggregaSpeseMesi(userId, 4, riferimento);
    expect(res.storico.map((m) => m.periodo)).toEqual(['2026-06', '2026-07', '2026-08', '2026-09']);
  });

  it('con primoMovimento noto lo storico parte da lì: nessuno zero prima dello storico disponibile', async () => {
    await spesa(100, 'affitto', '2026-08-01');
    const res = await aggregaSpeseMesi(userId, 6, riferimento, { primoMovimento: '2026-08-01' });
    expect(res.storico.map((m) => m.periodo)).toEqual(['2026-08', '2026-09']);
    expect(res.finestra.richiesta).toEqual({ da: '2026-04', a: '2026-09' });
    expect(res.finestra.osservata).toEqual({ da: '2026-08', a: '2026-09' });
  });

  it('il primo mese non è completo se il primo movimento non cade il giorno 1', async () => {
    await spesa(100, 'affitto', '2026-08-15');
    const res = await aggregaSpeseMesi(userId, 6, riferimento, { primoMovimento: '2026-08-15' });
    expect(res.finestra.primoMeseParziale).toBe(true);
    expect(res.mesi_completi).toBe(0);
    expect(res.media_mensile).toBeNull(); // dato insufficiente, non zero
  });

  it('con il primo movimento al giorno 1 il primo mese entra nelle medie', async () => {
    await spesa(300, 'affitto', '2026-08-01');
    const res = await aggregaSpeseMesi(userId, 6, riferimento, { primoMovimento: '2026-08-01' });
    expect(res.mesi_completi).toBe(1);
    expect(res.media_mensile).toBe(300);
  });

  it('le quattro classi di necessità dei mesi completi riconciliano col totale dei mesi completi', async () => {
    await spesa(200, 'affitto', '2026-07-01'); // essenziale
    await spesa(50, 'svago', '2026-07-10'); // discrezionale
    await spesa(400, 'affitto', '2026-08-05');
    // Categoria inesistente: l'API la rifiuta (whitelist), quindi il caso
    // "non classificata" si costruisce scrivendo direttamente il movimento.
    await Movimento.create({
      user_id: userId, conto_id: contoId, tipo: 'uscita', importo: 30,
      categoria: 'id_orfano_inesistente', data: '2026-08-06',
    });
    await spesa(9999, 'affitto', '2026-09-20'); // mese corrente: fuori dalle medie

    const res = await aggregaSpeseMesi(userId, 6, riferimento, { primoMovimento: '2026-07-01' });
    expect(res.mesi_completi).toBe(2);
    expect(res.totale_mesi_completi).toBe(680);

    const b = res.byNecessityMesiCompleti;
    expect(b.essenziale + b.semi_essenziale + b.discrezionale + b.non_classificata)
      .toBe(res.totale_mesi_completi);
    expect(b.totale).toBe(res.totale_mesi_completi);
    expect(b.essenziale).toBe(600);
    expect(b.discrezionale).toBe(50);
    expect(b.non_classificata).toBe(30);
    // Lo stesso denominatore della media complessiva: 2 mesi completi.
    expect(res.media_mensile).toBe(340);
  });

  it('il mese corrente è esposto a parte, non mescolato con i mesi completi', async () => {
    await spesa(200, 'affitto', '2026-08-01');
    await spesa(777, 'svago', '2026-09-20');
    const res = await aggregaSpeseMesi(userId, 6, riferimento, { primoMovimento: '2026-08-01' });
    expect(res.mese_corrente).toEqual(expect.objectContaining({ periodo: '2026-09', totale: 777 }));
    expect(res.totale_mesi_completi).toBe(200);
  });

  it('senza nessun movimento la finestra osservata è assente e lo storico è vuoto, non una fila di zeri', async () => {
    const res = await aggregaSpeseMesi(userId, 12, riferimento, { primoMovimento: null });
    expect(res.storico).toEqual([]);
    expect(res.finestra.osservata).toBeNull();
    expect(res.mesi_completi).toBe(0);
    expect(res.media_mensile).toBeNull();
    expect(res.byNecessityMesiCompleti.totale).toBe(0);
  });
});
