// getFinancialContext: l'unico punto che compone patrimonio, liquidità,
// spese, entrate, debiti, obiettivi, investimenti e ricorrenti in una
// lettura coerente. Non ricalcola nulla: verifica soprattutto che la
// composizione sia corretta e che i casi di dati assenti/insufficienti
// restino espliciti, mai zero o inventati.
const {
  request, createApp, registerUser, authHeader, Conto, Movimento,
} = require('./setup');
const { Obiettivo, Investimento, Debito } = require('../models');
const { getFinancialContext } = require('../services/financialContext.service');

const riferimento = new Date('2026-09-23T10:00:00Z');

describe('getFinancialContext — utente nuovo, senza alcun dato', () => {
  let app;
  let userId;

  beforeEach(async () => {
    app = createApp({ enableRateLimit: false });
    const { res } = await registerUser(app);
    userId = res.body.user.id;
  });

  it('non lancia mai e restituisce stati espliciti di dati assenti, non zero silenzioso', async () => {
    const ctx = await getFinancialContext(userId, { referenceDate: riferimento });

    expect(ctx.netWorth.total).toBe(0);
    expect(ctx.liquidity.total).toBe(0);
    expect(ctx.goals).toEqual([]);
    expect(ctx.debts.totalOutstanding).toBe(0);
    expect(ctx.debts.debtPressure).toBeNull(); // reddito sconosciuto: mai 0 o Infinity
    expect(ctx.investments.items).toEqual([]);
    expect(ctx.recurring).toEqual({
      active: 0, paused: 0, ended: 0, commitments: 0,
    });
    expect(ctx.emergencyFund.status).toBe('assente');
    expect(ctx.dataQuality.hasSufficientHistory).toBe(false);
    expect(ctx.cashFlow.monthlySavings).toBeNull(); // entrate e spese sconosciute, non 0-0=0
  });
});

describe('getFinancialContext — isolamento cross-user', () => {
  it('il contesto di un utente non include mai dati di un altro', async () => {
    const app = createApp({ enableRateLimit: false });
    const a = await registerUser(app);
    const b = await registerUser(app);

    await Conto.create({
      user_id: b.res.body.user.id, nome: 'Conto B', tipo: 'banca', saldo: 50000, attivo: true,
    });
    await Debito.create({
      user_id: b.res.body.user.id, nome: 'Debito B', saldo_residuo: 20000, attivo: true,
    });

    const ctx = await getFinancialContext(a.res.body.user.id, { referenceDate: riferimento });
    expect(ctx.netWorth.assets).toBe(0);
    expect(ctx.debts.totalOutstanding).toBe(0);
  });
});

describe('getFinancialContext — utente con dati su più domini', () => {
  let app;
  let token;
  let userId;
  let contoId;

  beforeEach(async () => {
    app = createApp({ enableRateLimit: false });
    const { res } = await registerUser(app);
    token = res.body.token;
    userId = res.body.user.id;
    const contoRes = await request(app).post('/api/conti').set(authHeader(token)).send({ nome: 'C', tipo: 'banca', saldo_iniziale: 5000 });
    contoId = contoRes.body.conto.id;
  });

  it('compone patrimonio netto, liquidità, spese e debiti in modo coerente', async () => {
    await Debito.create({
      user_id: userId, nome: 'Prestito', saldo_residuo: 3000, rata_periodica: 200, frequenza: 'mensile', attivo: true,
    });
    await request(app).post('/api/movimenti').set(authHeader(token)).send({
      conto_id: contoId, tipo: 'uscita', importo: 400, categoria: 'affitto', data: '2026-08-05',
    });

    const ctx = await getFinancialContext(userId, { referenceDate: riferimento, historyMonths: 3 });

    // saldo iniziale 5000 - 400 spesa = 4600 sul conto.
    expect(ctx.liquidity.total).toBe(4600);
    expect(ctx.netWorth.assets).toBe(4600);
    expect(ctx.netWorth.liabilities).toBe(3000);
    expect(ctx.netWorth.total).toBe(1600);
    expect(ctx.debts.totalOutstanding).toBe(3000);
    expect(ctx.debts.totalMonthlyPayments).toBe(200);
    expect(ctx.expenses.monthlyAverage).toBe(400); // solo agosto è completo
  });

  it('nessun obiettivo: goals è un array vuoto, non un errore', async () => {
    const ctx = await getFinancialContext(userId, { referenceDate: riferimento });
    expect(ctx.goals).toEqual([]);
  });

  it('un obiettivo completato ha stato deterministico "completato"', async () => {
    await Obiettivo.create({
      user_id: userId, nome: 'Fatto', importo_target: 100, importo_attuale: 100, completato: true,
    });
    const ctx = await getFinancialContext(userId, { referenceDate: riferimento });
    expect(ctx.goals).toHaveLength(1);
    expect(ctx.goals[0].stato).toBe('completato');
  });

  it('la priorità di un obiettivo si propaga fino a goals[], null se non impostata', async () => {
    await Obiettivo.create({
      user_id: userId, nome: 'Con priorità', importo_target: 500, importo_attuale: 0, priorita: 'alta',
    });
    await Obiettivo.create({
      user_id: userId, nome: 'Senza priorità', importo_target: 500, importo_attuale: 0,
    });

    const ctx = await getFinancialContext(userId, { referenceDate: riferimento });
    const conPriorita = ctx.goals.find((g) => g.priorita === 'alta');
    const senzaPriorita = ctx.goals.find((g) => g.priorita === null);
    expect(conPriorita).toBeDefined();
    expect(senzaPriorita).toBeDefined();
  });

  it('fondo di sicurezza assente: stato esplicito "assente", non un errore né un fondo a zero', async () => {
    const ctx = await getFinancialContext(userId, { referenceDate: riferimento });
    expect(ctx.emergencyFund.status).toBe('assente');
    expect(ctx.emergencyFund.coverageMonths).toBeNull();
  });

  it('investimento non liquido: valore separato da liquidValue', async () => {
    await Investimento.create({
      user_id: userId, nome_piattaforma: 'Fondo pensione', tipo: 'fondi', saldo_attuale: 10000, liquidabilita: 'vincolato', attivo: true,
    });
    const ctx = await getFinancialContext(userId, { referenceDate: riferimento });
    expect(ctx.investments.totalValue).toBe(10000);
    expect(ctx.investments.nonLiquidValue).toBe(10000);
    expect(ctx.investments.liquidValue).toBe(0);
    // Il patrimonio (attività) include comunque l'investimento: patrimonio
    // ≠ liquidità allocabile, ma l'investimento resta un'attività.
    expect(ctx.netWorth.assets).toBe(5000 + 10000);
  });

  it('categorie non classificate: il segnale propaga fino a dataQuality', async () => {
    await Movimento.create({
      user_id: userId, conto_id: contoId, tipo: 'uscita', importo: 900, categoria: 'affitto', data: '2026-08-05',
    });
    await Movimento.create({
      user_id: userId, conto_id: contoId, tipo: 'uscita', importo: 300, categoria: 'id_orfano_inesistente', data: '2026-08-06',
    });

    const ctx = await getFinancialContext(userId, { referenceDate: riferimento, historyMonths: 2 });
    expect(ctx.expenses.byNecessity.unclassified.total).toBe(300);
    expect(ctx.dataQuality.missingClassificationData).toBe(true);
  });

  it('storico insufficiente (solo il mese corrente, parziale): hasSufficientHistory è false', async () => {
    const ctx = await getFinancialContext(userId, { referenceDate: riferimento, historyMonths: 1 });
    expect(ctx.dataQuality.completeMonths).toBe(0);
    expect(ctx.dataQuality.hasSufficientHistory).toBe(false);
    expect(ctx.expenses.monthlyAverage).toBeNull();
  });
});

describe('getFinancialContext — cash flow negativo', () => {
  it('le spese medie superano le entrate medie: risparmio mensile negativo', async () => {
    const app = createApp({ enableRateLimit: false });
    const { res } = await registerUser(app);
    const token = res.body.token;
    const userId = res.body.user.id;
    // Saldo zero: un saldo_iniziale positivo genera in automatico un
    // movimento "Saldo iniziale" (altro_entrata) datato oggi, che
    // inquinerebbe la media mensile del mese corrente qui sotto.
    const contoRes = await request(app).post('/api/conti').set(authHeader(token)).send({ nome: 'C', tipo: 'banca', saldo_iniziale: 0 });
    const contoId = contoRes.body.conto.id;

    // Tre mesi di storico reale (entrate.service richiede almeno 3 mesi per
    // considerare l'entrata "stabile" e non "insufficiente"): stipendio
    // regolare, ma ad agosto una spesa che supera l'entrata del mese.
    await request(app).post('/api/movimenti').set(authHeader(token)).send({
      conto_id: contoId, tipo: 'entrata', importo: 500, categoria: 'stipendio', data: '2026-07-01', periodicita_entrata: 'ricorrente',
    });
    await request(app).post('/api/movimenti').set(authHeader(token)).send({
      conto_id: contoId, tipo: 'entrata', importo: 500, categoria: 'stipendio', data: '2026-08-01', periodicita_entrata: 'ricorrente',
    });
    await request(app).post('/api/movimenti').set(authHeader(token)).send({
      conto_id: contoId, tipo: 'uscita', importo: 800, categoria: 'affitto', data: '2026-08-05',
    });

    const ctx = await getFinancialContext(userId, { referenceDate: riferimento, historyMonths: 3 });
    expect(ctx.cashFlow.monthlySavings).toBeLessThan(0);
    expect(ctx.cashFlow.savingsRate).toBeLessThan(0);
  });
});
