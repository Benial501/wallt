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
  let userId;
  let contoId;

  const creaMovimentoUscita = async (importo, categoria, data) => request(app)
    .post('/api/movimenti')
    .set(authHeader(token))
    .send({ conto_id: contoId, tipo: 'uscita', importo, categoria, data });

  beforeEach(async () => {
    app = createApp({ enableRateLimit: false });
    const { res } = await registerUser(app);
    token = res.body.token;
    userId = res.body.user.id;
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
    const data = `${meseScorso.toISOString().slice(0, 7)}-01`;
    await creaMovimentoUscita(100, 'svago', data); // discrezionale, non essenziale

    const id = await creaFondo(1000);
    const res = await request(app).get(`/api/obiettivi/${id}/copertura`).set(authHeader(token));
    expect(res.body.stato).toBe('non_calcolabile');
  });

  it('disponibile con mesi_copertura=0 se il fondo è vuoto ma ci sono spese essenziali', async () => {
    const meseScorso = new Date();
    meseScorso.setMonth(meseScorso.getMonth() - 1);
    const data = `${meseScorso.toISOString().slice(0, 7)}-01`;
    await creaMovimentoUscita(300, 'affitto', data);

    const id = await creaFondo(0);
    const res = await request(app).get(`/api/obiettivi/${id}/copertura`).set(authHeader(token));
    expect(res.body.stato).toBe('disponibile');
    expect(res.body.mesi_copertura).toBe(0);
  });

  it('calcola correttamente la copertura con dati completi, anche se l\'obiettivo è completato', async () => {
    const meseScorso = new Date();
    meseScorso.setMonth(meseScorso.getMonth() - 1);
    const data = `${meseScorso.toISOString().slice(0, 7)}-01`;
    // 900€ nell'unico mese completo osservato: non viene diluito sui mesi
    // precedenti all'inizio dello storico.
    await creaMovimentoUscita(900, 'affitto', data);

    const id = await creaFondo(1500);
    // Completa l'obiettivo per verificare che non cambi il comportamento.
    await request(app).post(`/api/obiettivi/${id}/contributi`).set(authHeader(token)).send({ importo: 8500 });

    const res = await request(app).get(`/api/obiettivi/${id}/copertura`).set(authHeader(token));
    expect(res.body.stato).toBe('disponibile');
    expect(res.body.spese_essenziali_mensili).toBe(900);
    expect(res.body.mesi_copertura).toBe(round1(10000 / 900));

    function round1(v) { return Math.round(v * 10) / 10; }
  });

  it('segnala classificazione_incompleta quando una spesa ha una categoria orfana', async () => {
    const meseScorso = new Date();
    meseScorso.setMonth(meseScorso.getMonth() - 1);
    const data = `${meseScorso.toISOString().slice(0, 7)}-01`;
    await creaMovimentoUscita(900, 'affitto', data);
    // Simula una categoria personale poi cancellata per davvero (non solo
    // archiviata): l'API di creazione movimenti non lo permette, si inserisce
    // direttamente col modello, come farebbe un dato legacy nel DB.
    await Movimento.create({
      user_id: userId,
      conto_id: contoId, tipo: 'uscita', importo: 100, categoria: 'id_orfano_inesistente', data,
    });

    const id = await creaFondo(1000);
    const res = await request(app).get(`/api/obiettivi/${id}/copertura`).set(authHeader(token));

    expect(res.body.stato).toBe('disponibile');
    expect(res.body.classificazione_incompleta).toBe(true);
    // Le spese essenziali restano solo l'affitto: la quota orfana non vi entra.
    expect(res.body.spese_essenziali_mensili).toBe(900);
  });

  it('classificazione_incompleta è false con dati interamente classificati', async () => {
    const meseScorso = new Date();
    meseScorso.setMonth(meseScorso.getMonth() - 1);
    const data = meseScorso.toISOString().split('T')[0];
    await creaMovimentoUscita(900, 'affitto', data);

    const id = await creaFondo(1000);
    const res = await request(app).get(`/api/obiettivi/${id}/copertura`).set(authHeader(token));

    expect(res.body.classificazione_incompleta).toBe(false);
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

// Punto 2 dell'audit: il fondo di sicurezza può conservare la sua finestra di
// tre mesi completi, ma deve dichiararla e riusare le aggregazioni condivise
// invece di reimplementare la propria query sulle spese.
describe('calcolaMesiCopertura — periodo dichiarato e aggregazioni condivise', () => {
  const { Conto, Movimento } = require('./setup');
  const { calcolaMesiCopertura } = require('../services/fondoSicurezza.service');
  const riferimento = new Date('2026-09-23T10:00:00Z');

  let userId;
  let contoId;

  beforeEach(async () => {
    const app = createApp({ enableRateLimit: false });
    const { res } = await registerUser(app);
    userId = res.body.user.id;
    const conto = await Conto.create({
      user_id: userId, nome: 'C', tipo: 'banca', saldo: 100000, attivo: true,
    });
    contoId = conto.id;
  });

  const spesa = (importo, categoria, data) => Movimento.create({
    user_id: userId, conto_id: contoId, tipo: 'uscita', importo, categoria, data,
  });

  it('dichiara il proprio periodo: tre mesi civili completi, mese corrente escluso', async () => {
    await spesa(600, 'affitto', '2026-06-10');
    await spesa(600, 'affitto', '2026-07-10');
    await spesa(600, 'affitto', '2026-08-10');
    await spesa(9999, 'affitto', '2026-09-10'); // mese corrente: fuori

    const res = await calcolaMesiCopertura({
      userId, obiettivo: { importo_attuale: 1800 }, riferimento,
    });

    expect(res.periodo).toEqual({
      da: '2026-07', a: '2026-08', mesi: 2,
    });
    expect(res.spese_essenziali_mensili).toBe(600);
    expect(res.mesi_copertura).toBe(3);
  });

  it('il periodo dichiarato attraversa il cambio d\'anno', async () => {
    const res = await calcolaMesiCopertura({
      userId,
      obiettivo: { importo_attuale: 0 },
      riferimento: new Date('2026-02-10T10:00:00Z'),
    });
    expect(res.periodo).toEqual({ da: null, a: null, mesi: 0 });
  });

  it('nessuna spesa nel periodo: dati insufficienti, e il periodo resta dichiarato', async () => {
    const res = await calcolaMesiCopertura({
      userId, obiettivo: { importo_attuale: 500 }, riferimento,
    });
    expect(res.stato).toBe('dati_insufficienti');
    expect(res.periodo).toEqual({ da: null, a: null, mesi: 0 });
  });

  it('non diluisce un solo mese completo sui tre mesi richiesti', async () => {
    await spesa(900, 'affitto', '2026-08-01');
    const res = await calcolaMesiCopertura({
      userId, obiettivo: { importo_attuale: 2700 }, riferimento,
    });

    expect(res.spese_essenziali_mensili).toBe(900);
    expect(res.mesi_copertura).toBe(3);
    expect(res.periodo.mesi).toBe(1);
    expect(res.storico_limitato).toBe(true);
  });

  it('esclude il primo mese iniziato a metà mese dal denominatore', async () => {
    await spesa(500, 'affitto', '2026-07-15');
    await spesa(900, 'affitto', '2026-08-01');
    const res = await calcolaMesiCopertura({
      userId, obiettivo: { importo_attuale: 2700 }, riferimento,
    });

    expect(res.spese_essenziali_mensili).toBe(900);
    expect(res.periodo).toEqual({ da: '2026-08', a: '2026-08', mesi: 1 });
  });
});
