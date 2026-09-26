// Verifica che gli aggregati "quanto ho speso/incassato" (stato budget,
// bilancio del mese, distribuzione per categoria delle Analisi) non contino
// una ricorrenza come se fosse già una spesa avvenuta: creare una regola
// ricorrente non deve muovere questi numeri, solo la sua occorrenza generata
// dal cron deve farlo, e una volta sola (vedi muoveSaldo,
// ricorrenti.service.js, e CLAUDE.md Regola 20).
//
// Prima di questa correzione ogni aggregato sommava indistintamente tutte le
// righe entrata/uscita del periodo: una regola creata nel mese contava come
// spesa avvenuta, e quando il cron generava la sua occorrenza nello stesso
// mese la stessa uscita veniva contata due volte, mentre il saldo del conto
// la contava una volta sola (o zero, prima del cron).
const {
  request, registerUser, authHeader, Conto, createApp,
} = require('./setup');
const { processaRicorrenti } = require('../services/ricorrenti.service');
const { BudgetMensile, BudgetCategoria } = require('../models');

const conOggi = async (anno, meseZeroBased, giorno, fn) => {
  jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'setInterval', 'setTimeout', 'clearImmediate', 'clearInterval', 'clearTimeout'] })
    .setSystemTime(new Date(anno, meseZeroBased, giorno));
  try { return await fn(); } finally { jest.useRealTimers(); }
};

describe('Gli aggregati di denaro ignorano una regola ricorrente finché il cron non genera l\'occorrenza', () => {
  let app;
  let token;
  let userId;
  let conto;

  beforeEach(async () => {
    app = createApp({ enableRateLimit: false });
    const { res } = await registerUser(app);
    token = res.body.token;
    userId = res.body.user.id;
    conto = await Conto.create({
      user_id: userId, nome: 'Conto', tipo: 'banca', saldo: 1000, attivo: true,
    });
  });

  const creaMensile = () => request(app).post('/api/movimenti').set(authHeader(token))
    .send({
      conto_id: conto.id,
      tipo: 'uscita',
      importo: 50,
      categoria: 'bollette',
      descrizione: 'Abbonamento',
      data: '2026-03-05',
      ricorrente: true,
      ricorrente_frequenza: 'mensile',
      ricorrente_giorno: 5,
    });

  it('lo stato del budget non conta la regola come speso, e dopo il cron la conta una volta sola', async () => {
    const budget = await BudgetMensile.create({ user_id: userId, mese: 3, anno: 2026, importo_totale: 500 });
    await BudgetCategoria.create({ budget_id: budget.id, categoria: 'bollette', importo: 200 });

    await conOggi(2026, 2, 5, async () => {
      const creato = await creaMensile();
      expect(creato.status).toBe(201);

      const primaDelCron = await request(app)
        .get('/api/budget/2026/3/stato')
        .set(authHeader(token));
      expect(primaDelCron.body.stato.find((s) => s.categoria === 'bollette').speso).toBe(0);

      // Il cron può girare più volte (Vercel Cron, GitHub Actions, server
      // locale): l'idempotenza del cron non deve tradursi in un doppio
      // conteggio qui.
      await processaRicorrenti(new Date('2026-03-05T12:00:00Z'));
      await processaRicorrenti(new Date('2026-03-05T12:00:00Z'));

      const dopoIlCron = await request(app)
        .get('/api/budget/2026/3/stato')
        .set(authHeader(token));
      expect(dopoIlCron.body.stato.find((s) => s.categoria === 'bollette').speso).toBe(50);
    });
  });

  it('il bilancio del mese non conta la regola come uscita, e dopo il cron la conta una volta sola', async () => {
    await conOggi(2026, 2, 5, async () => {
      const creato = await creaMensile();
      expect(creato.status).toBe(201);

      const primaDelCron = await request(app)
        .get('/api/movimenti/bilancio?mese=3&anno=2026')
        .set(authHeader(token));
      expect(primaDelCron.body.uscite).toBe(0);

      await processaRicorrenti(new Date('2026-03-05T12:00:00Z'));

      const dopoIlCron = await request(app)
        .get('/api/movimenti/bilancio?mese=3&anno=2026')
        .set(authHeader(token));
      expect(dopoIlCron.body.uscite).toBe(50);
    });
  });

  it('la distribuzione per categoria delle Analisi non conta la regola, e dopo il cron la conta una volta sola', async () => {
    await conOggi(2026, 2, 5, async () => {
      const creato = await creaMensile();
      expect(creato.status).toBe(201);

      const primaDelCron = await request(app)
        .get('/api/analisi/distribuzione-spese?da=2026-03-01&a=2026-03-31')
        .set(authHeader(token));
      expect(primaDelCron.body.totale).toBe(0);

      await processaRicorrenti(new Date('2026-03-05T12:00:00Z'));

      const dopoIlCron = await request(app)
        .get('/api/analisi/distribuzione-spese?da=2026-03-01&a=2026-03-31')
        .set(authHeader(token));
      expect(dopoIlCron.body.totale).toBe(50);
    });
  });
});
