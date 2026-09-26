// mesiCopertura = importoFondo / speseEssenzialiMensili: il calcolo puro, che
// non sa dove i soldi del fondo siano tenuti. Da settembre 2026 sono il saldo
// di un Conto tipo 'emergenza' (tests/fondoEmergenza.test.js); qui si verifica
// solo la matematica e la finestra di osservazione.
const {
  request, createApp, registerUser, authHeader,
} = require('./setup');

describe('Obiettivo.tipo_obiettivo', () => {
  // Il fondo di emergenza NON è più un obiettivo: è un Conto tipo 'emergenza'
  // (tests/fondoEmergenza.test.js). Qui resta solo il presidio che impedisce
  // al vecchio modello di rientrare da una porta laterale.
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

  it('non accetta più fondo_sicurezza: il fondo è un conto, non un obiettivo', async () => {
    const res = await request(app)
      .post('/api/obiettivi')
      .set(authHeader(token))
      .send({ nome: 'Fondo emergenza', importo_target: 5000, tipo_obiettivo: 'fondo_sicurezza' });

    expect(res.status).toBe(400);
  });

  it('non accetta fondo_sicurezza nemmeno via update', async () => {
    const created = await request(app)
      .post('/api/obiettivi')
      .set(authHeader(token))
      .send({ nome: 'Vacanza', importo_target: 1000 });

    const res = await request(app)
      .put(`/api/obiettivi/${created.body.obiettivo.id}`)
      .set(authHeader(token))
      .send({ tipo_obiettivo: 'fondo_sicurezza' });

    expect(res.status).toBe(400);
  });

  it('rifiuta un tipo_obiettivo non valido', async () => {
    const res = await request(app)
      .post('/api/obiettivi')
      .set(authHeader(token))
      .send({ nome: 'X', importo_target: 100, tipo_obiettivo: 'non_esiste' });

    expect(res.status).toBe(400);
  });

  it('l\'endpoint /copertura sugli obiettivi non esiste più', async () => {
    const created = await request(app)
      .post('/api/obiettivi')
      .set(authHeader(token))
      .send({ nome: 'Vacanza', importo_target: 1000 });

    const res = await request(app)
      .get(`/api/obiettivi/${created.body.obiettivo.id}/copertura`)
      .set(authHeader(token));

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
      userId, importoFondo: 1800, riferimento,
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
      importoFondo: 0,
      riferimento: new Date('2026-02-10T10:00:00Z'),
    });
    expect(res.periodo).toEqual({ da: null, a: null, mesi: 0 });
  });

  it('nessuna spesa nel periodo: dati insufficienti, e il periodo resta dichiarato', async () => {
    const res = await calcolaMesiCopertura({
      userId, importoFondo: 500, riferimento,
    });
    expect(res.stato).toBe('dati_insufficienti');
    expect(res.periodo).toEqual({ da: null, a: null, mesi: 0 });
  });

  it('non diluisce un solo mese completo sui tre mesi richiesti', async () => {
    await spesa(900, 'affitto', '2026-08-01');
    const res = await calcolaMesiCopertura({
      userId, importoFondo: 2700, riferimento,
    });

    expect(res.spese_essenziali_mensili).toBe(900);
    expect(res.mesi_copertura).toBe(3);
    expect(res.periodo.mesi).toBe(1);
    expect(res.storico_limitato).toBe(true);
  });

  it('segnala classificazione_incompleta quando una spesa ha una categoria orfana', async () => {
    await spesa(900, 'affitto', '2026-08-01');
    // Una categoria personale cancellata per davvero (non archiviata): l'API
    // dei movimenti non lo permette, si inserisce col modello come farebbe un
    // dato legacy nel database.
    await spesa(100, 'id_orfano_inesistente', '2026-08-02');

    const res = await calcolaMesiCopertura({ userId, importoFondo: 1000, riferimento });

    expect(res.stato).toBe('disponibile');
    expect(res.classificazione_incompleta).toBe(true);
    // Le spese essenziali restano solo l'affitto: la quota orfana non vi entra.
    expect(res.spese_essenziali_mensili).toBe(900);
  });

  it('classificazione_incompleta è false con dati interamente classificati', async () => {
    await spesa(900, 'affitto', '2026-08-01');
    const res = await calcolaMesiCopertura({ userId, importoFondo: 1000, riferimento });
    expect(res.classificazione_incompleta).toBe(false);
  });

  it('esclude il primo mese iniziato a metà mese dal denominatore', async () => {
    await spesa(500, 'affitto', '2026-07-15');
    await spesa(900, 'affitto', '2026-08-01');
    const res = await calcolaMesiCopertura({
      userId, importoFondo: 2700, riferimento,
    });

    expect(res.spese_essenziali_mensili).toBe(900);
    expect(res.periodo).toEqual({ da: '2026-08', a: '2026-08', mesi: 1 });
  });
});
