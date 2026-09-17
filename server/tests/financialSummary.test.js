// Patrimonio centralizzato: un solo calcolo, usato ovunque allo stesso modo.
// Il difetto che questo test previene: prima esistevano 4 copie della stessa
// formula, e una di queste (getSuggerimenti) dimenticava gli investimenti.
const {
  request, createApp, registerUser, authHeader, Conto, Movimento,
} = require('./setup');
const { Investimento, User, ProfiloUtente } = require('../models');
const { calcolaPatrimonio } = require('../services/financialSummary.service');

const oggi = () => new Date().toISOString().split('T')[0];

describe('FinancialSummaryService.calcolaPatrimonio', () => {
  let app;
  let token;
  let userId;

  beforeEach(async () => {
    app = createApp({ enableRateLimit: false });
    const { res } = await registerUser(app);
    token = res.body.token;
    userId = res.body.user.id;
    await User.update({ mostra_investimenti: true }, { where: { id: userId } });
    await ProfiloUtente.upsert({
      user_id: userId, onboarding_completato: true, fascia_eta: '25_34', ha_investimenti: 'si',
    });
  });

  it('somma conti attivi e investimenti attivi, esclude quelli inattivi', async () => {
    await Conto.create({
      user_id: userId, nome: 'Conto attivo', tipo: 'banca', saldo: 1000, attivo: true,
    });
    await Conto.create({
      user_id: userId, nome: 'Conto chiuso', tipo: 'banca', saldo: 500, attivo: false,
    });
    await Investimento.create({
      user_id: userId, nome_piattaforma: 'ETF', tipo: 'etf', saldo_attuale: 300, attivo: true,
    });
    await Investimento.create({
      user_id: userId, nome_piattaforma: 'Vecchio', tipo: 'etf', saldo_attuale: 999, attivo: false,
    });

    const result = await calcolaPatrimonio(userId);

    expect(result.patrimonio_conti).toBe(1000);
    expect(result.patrimonio_investimenti).toBe(300);
    expect(result.patrimonio_totale).toBe(1300);
  });

  it('GET /api/conti, GET /api/conti/patrimonio e GET /api/analisi/andamento-patrimonio concordano', async () => {
    await Conto.create({
      user_id: userId, nome: 'Conto', tipo: 'banca', saldo: 2000, attivo: true,
    });
    await Investimento.create({
      user_id: userId, nome_piattaforma: 'ETF', tipo: 'etf', saldo_attuale: 500, attivo: true,
    });

    const conti = await request(app).get('/api/conti').set(authHeader(token));
    const patrimonio = await request(app).get('/api/conti/patrimonio').set(authHeader(token));
    const andamento = await request(app).get('/api/analisi/andamento-patrimonio').set(authHeader(token));

    expect(conti.body.patrimonio_totale).toBe(2500);
    expect(patrimonio.body.totale).toBe(2500);
    expect(andamento.body.fine).toBe(2500);
  });

  it('REGRESSIONE: GET /api/analisi/suggerimenti calcola il patrimonio con conti+investimenti, non solo conti', async () => {
    const conto = await Conto.create({
      user_id: userId, nome: 'Conto', tipo: 'banca', saldo: 1000, attivo: true,
    });
    await Investimento.create({
      user_id: userId, nome_piattaforma: 'ETF', tipo: 'etf', saldo_attuale: 400, attivo: true,
    });
    // Un'entrata questo mese, cosi' il ramo "Patrimonio in crescita" si attiva
    // e riporta il patrimonio nel messaggio.
    await Movimento.create({
      user_id: userId, conto_id: conto.id, tipo: 'entrata', importo: 50,
      categoria: 'entrata_extra', descrizione: 'test', data: oggi(), ricorrente: false,
    });
    await conto.update({ saldo: 1050 });

    const res = await request(app).get('/api/analisi/suggerimenti').set(authHeader(token));
    const crescita = res.body.suggerimenti.find((s) => s.messaggio?.includes('Patrimonio in crescita'));

    expect(crescita).toBeDefined();
    expect(crescita.dettaglio).toContain('1450');
  });
});
