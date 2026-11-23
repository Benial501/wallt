// API del budget a tre voci: piano (GET/PUT /api/budget/piano) e stato del
// mese (GET /api/budget/stato). Il piano sta sul profilo e il server decide
// le percentuali dei modelli pronti, qualunque cosa invii il client.
const {
  request, createApp, registerUser, authHeader, Conto, Movimento,
} = require('./setup');
const { ProfiloUtente } = require('../models');
const { oggiLocale } = require('../utils/dateRome');

describe('API del budget', () => {
  let app;
  let token;
  let userId;

  const get = (percorso) => request(app).get(percorso).set(authHeader(token));
  const put = (corpo) => request(app).put('/api/budget/piano').set(authHeader(token)).send(corpo);
  const conEntrata = (entrata = 2000) => ProfiloUtente.update({ entrata_mensile: entrata }, { where: { user_id: userId } });

  beforeEach(async () => {
    app = createApp({ enableRateLimit: false });
    const { res } = await registerUser(app);
    token = res.body.token;
    userId = res.body.user.id;
  });

  it('GET piano senza piano restituisce consigliato e quattro modelli', async () => {
    await conEntrata();
    const res = await get('/api/budget/piano');

    expect(res.status).toBe(200);
    expect(res.body.piano).toBeNull();
    expect(res.body.entrata).toBe(2000);
    expect(res.body.consigliato).toMatchObject({ modello: 'equilibrato', percentuali: { bisogni: 50, desideri: 30, futuro: 20 } });
    expect(res.body.modelli.map((m) => m.id)).toEqual(['equilibrato', 'spese_fisse_alte', 'risparmio_deciso', 'personalizzato']);
    expect(res.body.modelli[0].importi).toEqual({ bisogni: 1000, desideri: 600, futuro: 400 });
    expect(res.body.modelli[3]).toEqual({ id: 'personalizzato', percentuali: null, importi: null });
  });

  it('GET piano senza entrata non calcola importi', async () => {
    const res = await get('/api/budget/piano');
    expect(res.body.entrata).toBeNull();
    expect(res.body.modelli[0].importi).toBeNull();
  });

  it('PUT equilibrato salva le percentuali del server', async () => {
    await conEntrata();
    const res = await put({ modello: 'equilibrato', percentuali: { bisogni: 10, desideri: 10, futuro: 80 } });

    expect(res.status).toBe(200);
    expect(res.body.piano).toEqual({ modello: 'equilibrato', percentuali: { bisogni: 50, desideri: 30, futuro: 20 } });
    const profilo = await ProfiloUtente.findOne({ where: { user_id: userId } });
    expect(profilo.budget_pct_futuro).toBe(20);
  });

  it('PUT personalizzato valido salva le percentuali inviate', async () => {
    await conEntrata();
    const res = await put({ modello: 'personalizzato', percentuali: { bisogni: 60, desideri: 25, futuro: 15 } });
    expect(res.status).toBe(200);
    expect(res.body.piano.percentuali).toEqual({ bisogni: 60, desideri: 25, futuro: 15 });
  });

  it('PUT personalizzato 60/30/20 → 400', async () => {
    await conEntrata();
    const res = await put({ modello: 'personalizzato', percentuali: { bisogni: 60, desideri: 30, futuro: 20 } });
    expect(res.status).toBe(400);
  });

  it('PUT personalizzato senza percentuali → 400', async () => {
    await conEntrata();
    expect((await put({ modello: 'personalizzato' })).status).toBe(400);
  });

  it('PUT modello sconosciuto → 400', async () => {
    await conEntrata();
    expect((await put({ modello: 'aggressivo' })).status).toBe(400);
  });

  it('PUT senza entrata → 422 entrata_mancante', async () => {
    const res = await put({ modello: 'equilibrato' });
    expect(res.status).toBe(422);
    expect(res.body.codice).toBe('entrata_mancante');
    const profilo = await ProfiloUtente.findOne({ where: { user_id: userId } });
    expect(profilo.budget_modello).toBeNull();
  });

  it('GET stato senza piano → 404', async () => {
    expect((await get('/api/budget/stato')).status).toBe(404);
  });

  it('GET stato con un piano restituisce le tre voci e il consiglio', async () => {
    await conEntrata();
    await put({ modello: 'equilibrato' });
    const conto = await Conto.create({ user_id: userId, nome: 'Banca', tipo: 'banca', saldo: 1000, attivo: true });
    await Movimento.create({
      user_id: userId, conto_id: conto.id, tipo: 'uscita', importo: 120, categoria: 'supermercato', descrizione: 'Spesa', data: oggiLocale(), ricorrente: false,
    });

    const res = await get('/api/budget/stato');
    expect(res.status).toBe(200);
    expect(res.body.voci.bisogni.usato).toBe(120);
    expect(res.body.consiglio.codice).toBe('futuro_indietro');
  });

  it('cambiare modello a metà mese aggiorna subito gli obiettivi', async () => {
    await conEntrata();
    await put({ modello: 'equilibrato' });
    expect((await get('/api/budget/stato')).body.voci.bisogni.obiettivo).toBe(1000);

    await put({ modello: 'spese_fisse_alte' });
    expect((await get('/api/budget/stato')).body.voci.bisogni.obiettivo).toBe(1400);
  });

  it('senza autenticazione le rotte rispondono 401', async () => {
    expect((await request(app).get('/api/budget/piano')).status).toBe(401);
    expect((await request(app).put('/api/budget/piano').send({ modello: 'equilibrato' })).status).toBe(401);
    expect((await request(app).get('/api/budget/stato')).status).toBe(401);
  });

  it('le rotte vecchie non esistono più', async () => {
    const vecchiaCreazione = await request(app).post('/api/budget').set(authHeader(token))
      .send({ mese: 11, anno: 2026, importo_totale: 1000, categorie: [{ categoria: 'svago', importo: 100 }] });
    expect(vecchiaCreazione.status).toBe(404);
    expect((await get('/api/profilo/budget-suggerito')).status).toBe(404);
  });
});
