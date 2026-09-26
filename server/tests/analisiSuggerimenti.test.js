// Il difetto che questo test previene: dentro il forEach sugli obiettivi non
// completati, il calcolo dei mesi rimanenti leggeva una variabile `now` che non
// e' mai stata definita. Un ReferenceError dentro il try di getSuggerimenti
// fa cadere l'intera risposta nel catch: 500, e con essa si perdono anche i
// suggerimenti su budget, categorie e patrimonio, che erano gia' stati
// calcolati. Bastava un obiettivo con `deadline` valorizzata per innescarlo, e
// nessun test dell'endpoint ne creava uno.
const {
  request, createApp, registerUser, authHeader, Conto, Movimento,
} = require('./setup');
const { Obiettivo } = require('../models');

const oggi = () => new Date().toISOString().split('T')[0];
const fraGiorni = (n) => new Date(Date.now() + n * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

describe('GET /api/analisi/suggerimenti con obiettivi a scadenza', () => {
  let app;
  let token;
  let userId;

  beforeEach(async () => {
    app = createApp({ enableRateLimit: false });
    const { res } = await registerUser(app);
    token = res.body.token;
    userId = res.body.user.id;
  });

  it('REGRESSIONE: risponde 200 quando esiste un obiettivo non completato con deadline', async () => {
    await Obiettivo.create({
      user_id: userId,
      nome: 'Vacanza',
      importo_target: 12000,
      importo_attuale: 0,
      deadline: fraGiorni(90),
      completato: false,
    });

    const res = await request(app).get('/api/analisi/suggerimenti').set(authHeader(token));

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.suggerimenti)).toBe(true);
  });

  it('segnala l obiettivo a rischio con la rata mensile necessaria', async () => {
    await Obiettivo.create({
      user_id: userId,
      nome: 'Vacanza',
      importo_target: 12000,
      importo_attuale: 0,
      deadline: fraGiorni(90),
      completato: false,
    });

    const res = await request(app).get('/api/analisi/suggerimenti').set(authHeader(token));
    const rischio = res.body.suggerimenti.find((s) => s.tipo === 'obiettivo_rischio');

    expect(res.status).toBe(200);
    expect(rischio).toBeDefined();
    expect(rischio.messaggio).toContain('Vacanza');
    // 90 giorni -> 3 mesi da 30 giorni: 12000 / 3 = 4000 euro al mese.
    expect(rischio.dettaglio).toContain('3 mesi');
    expect(rischio.azione).toContain('4000');
  });

  it('un obiettivo con deadline non fa perdere gli altri suggerimenti', async () => {
    const conto = await Conto.create({
      user_id: userId, nome: 'Conto', tipo: 'banca', saldo: 1050, attivo: true,
    });
    await Movimento.create({
      user_id: userId, conto_id: conto.id, tipo: 'entrata', importo: 50,
      categoria: 'entrata_extra', descrizione: 'test', data: oggi(), ricorrente: false,
    });
    await Obiettivo.create({
      user_id: userId,
      nome: 'Vacanza',
      importo_target: 12000,
      importo_attuale: 0,
      deadline: fraGiorni(90),
      completato: false,
    });

    const res = await request(app).get('/api/analisi/suggerimenti').set(authHeader(token));

    expect(res.status).toBe(200);
    expect(res.body.suggerimenti.find((s) => s.messaggio?.includes('Patrimonio in crescita'))).toBeDefined();
    expect(res.body.suggerimenti.find((s) => s.tipo === 'obiettivo_rischio')).toBeDefined();
  });
});
