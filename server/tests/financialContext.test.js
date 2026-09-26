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
      active: 0, paused: 0, ended: 0, commitments: 0, cashFlowItems: [],
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
    // Data al giorno 1: dal momento che questo è il primo movimento
    // dell'utente, è l'unico indizio che le registrazioni coprano tutto il
    // mese. Con una data a metà mese agosto sarebbe un primo mese parziale e
    // `monthlyAverage` sarebbe null (vedi finestraMesi.service.js).
    await request(app).post('/api/movimenti').set(authHeader(token)).send({
      conto_id: contoId, tipo: 'uscita', importo: 400, categoria: 'affitto', data: '2026-08-01',
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
    expect(ctx.emergencyFund.period).toBeNull();
  });

  it('il fondo di sicurezza dichiara la propria finestra, distinta da quella delle medie', async () => {
    await Obiettivo.create({
      user_id: userId, nome: 'Fondo', tipo_obiettivo: 'fondo_sicurezza', importo_target: 5000, importo_attuale: 1000,
    });
    const ctx = await getFinancialContext(userId, { referenceDate: riferimento, historyMonths: 12 });
    // Tre mesi civili completi, sempre e comunque: è la regola del fondo, non
    // la finestra delle medie generali.
    expect(ctx.emergencyFund.period).toEqual({ from: null, to: null, months: 0 });
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
    // Primo movimento al giorno 1: agosto è un mese completo, quindi entra
    // nella distribuzione per necessità dei mesi completi.
    await Movimento.create({
      user_id: userId, conto_id: contoId, tipo: 'uscita', importo: 900, categoria: 'affitto', data: '2026-08-01',
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
    // Conto creato direttamente: con saldo_iniziale > 0 l'API genera un
    // movimento "Saldo iniziale" datato oggi (che sposterebbe il primo
    // movimento dell'utente al mese corrente), mentre con saldo_iniziale 0 le
    // uscite verrebbero rifiutate per saldo insufficiente.
    const conto = await Conto.create({
      user_id: userId, nome: 'C', tipo: 'banca', saldo: 100000, attivo: true,
    });
    const contoId = conto.id;

    // Tre mesi di storico reale (entrate.service richiede almeno 3 mesi per
    // considerare l'entrata "stabile" e non "insufficiente"): stipendio
    // regolare, ma ad agosto una spesa che supera l'entrata del mese.
    await request(app).post('/api/movimenti').set(authHeader(token)).send({
      conto_id: contoId, tipo: 'entrata', importo: 500, categoria: 'stipendio', data: '2026-07-01', periodicita_entrata: 'ricorrente',
    });
    await request(app).post('/api/movimenti').set(authHeader(token)).send({
      conto_id: contoId, tipo: 'entrata', importo: 500, categoria: 'stipendio', data: '2026-08-01', periodicita_entrata: 'ricorrente',
    });
    // Le spese superano le entrate negli STESSI mesi completi (luglio e
    // agosto): prima di questa correzione il test risultava negativo solo
    // perché la media delle entrate includeva il mese corrente parziale
    // mentre quella delle spese no — una differenza di finestra, non un
    // cash flow davvero negativo.
    await request(app).post('/api/movimenti').set(authHeader(token)).send({
      conto_id: contoId, tipo: 'uscita', importo: 700, categoria: 'affitto', data: '2026-07-05',
    });
    await request(app).post('/api/movimenti').set(authHeader(token)).send({
      conto_id: contoId, tipo: 'uscita', importo: 800, categoria: 'affitto', data: '2026-08-05',
    });

    const ctx = await getFinancialContext(userId, { referenceDate: riferimento, historyMonths: 3 });
    expect(ctx.period.averageMonths).toEqual({ from: '2026-07', to: '2026-08', count: 2 });
    expect(ctx.cashFlow.monthlyAverageIncome).toBe(500);
    expect(ctx.cashFlow.monthlyAverageExpenses).toBe(750);
    expect(ctx.cashFlow.monthlySavings).toBe(-250);
    expect(ctx.cashFlow.averageMonths).toBe(2);
    expect(ctx.cashFlow.savingsRate).toBeLessThan(0);
  });
});

// Punto 3 dell'audit: debts.items normalizzati e nessuna doppia sottrazione
// delle rate. `totalMonthlyPayments` è una metrica (rata mensile
// equivalente), NON la prova che un pagamento sia ancora dovuto: non va
// sommata agli impegni della liquidità.
describe('getFinancialContext — debiti normalizzati e impegni non duplicati', () => {
  let app;
  let token;
  let userId;
  let contoId;

  beforeEach(async () => {
    app = createApp({ enableRateLimit: false });
    const { res } = await registerUser(app);
    token = res.body.token;
    userId = res.body.user.id;
    const contoRes = await request(app).post('/api/conti').set(authHeader(token)).send({ nome: 'C', tipo: 'banca', saldo_iniziale: 1000 });
    contoId = contoRes.body.conto.id;
  });

  it('items è una lista di oggetti semplici, con importi numerici e senza metadati interni', async () => {
    await Debito.create({
      user_id: userId,
      nome: 'Prestito auto',
      tipo: 'prestito',
      saldo_residuo: 3000.5,
      rata_periodica: 200.25,
      frequenza: 'mensile',
      tasso_interesse: 4.5,
      prossima_scadenza: '2026-10-05',
      attivo: true,
    });

    const ctx = await getFinancialContext(userId, { referenceDate: riferimento });
    expect(ctx.debts.items).toHaveLength(1);
    const debito = ctx.debts.items[0];

    expect(Object.getPrototypeOf(debito)).toBe(Object.prototype);
    expect(debito).not.toHaveProperty('user_id');
    expect(debito).not.toHaveProperty('dataValues');
    expect(debito.id).toEqual(expect.any(Number));
    expect(debito.name).toBe('Prestito auto');
    expect(debito.outstanding).toBe(3000.5);
    expect(debito.installment).toBe(200.25);
    expect(debito.monthlyEquivalent).toBe(200.25);
    expect(debito.frequency).toBe('mensile');
    expect(debito.interestRate).toBe(4.5);
    expect(debito.nextDueDate).toBe('2026-10-05');
  });

  it('un debito con rata settimanale espone la rata reale e il suo equivalente mensile, distinti', async () => {
    await Debito.create({
      user_id: userId, nome: 'Rateale', saldo_residuo: 500, rata_periodica: 10, frequenza: 'settimanale', attivo: true,
    });
    const ctx = await getFinancialContext(userId, { referenceDate: riferimento });
    expect(ctx.debts.items[0].installment).toBe(10);
    expect(ctx.debts.items[0].monthlyEquivalent).toBe(43.33); // 10 * 52/12
  });

  it('la rata mensile equivalente non viene sottratta dalla liquidità: nessuna doppia sottrazione', async () => {
    const prima = await getFinancialContext(userId, { referenceDate: riferimento });
    await Debito.create({
      user_id: userId, nome: 'Mutuo', saldo_residuo: 90000, rata_periodica: 650, frequenza: 'mensile', attivo: true,
    });
    const dopo = await getFinancialContext(userId, { referenceDate: riferimento });

    expect(dopo.debts.totalMonthlyPayments).toBe(650);
    // L'unico effetto di un debito sul contesto è sulle passività, non sulla
    // liquidità: un debito registrato non è un addebito già accertato.
    expect(dopo.liquidity.commitments).toBe(prima.liquidity.commitments);
    expect(dopo.liquidity.free).toBe(prima.liquidity.free);
    expect(dopo.netWorth.liabilities).toBe(90000);
  });

  it('una rata e una ricorrente dello stesso importo restano non riconciliate, senza essere sommate', async () => {
    await Debito.create({
      user_id: userId, nome: 'Mutuo', saldo_residuo: 90000, rata_periodica: 650, frequenza: 'mensile', attivo: true,
    });
    await Movimento.create({
      user_id: userId, conto_id: contoId, tipo: 'uscita', importo: 650, categoria: 'affitto',
      descrizione: 'Mutuo', data: '2026-01-05', ricorrente: true, stato_ricorrenza: 'attiva',
      ricorrente_frequenza: 'mensile', ricorrente_giorno: 5,
    });

    const ctx = await getFinancialContext(userId, { referenceDate: riferimento });
    // La ricorrente è un impegno accertato: il cron la addebiterà.
    expect(ctx.liquidity.commitments).toBe(650);
    // La rata del debito resta una metrica separata: 650, non 1300.
    expect(ctx.debts.totalMonthlyPayments).toBe(650);
    expect(ctx.debts.monthlyPayments.includedInLiquidityCommitments).toBe(false);
    // Nessun collegamento esplicito debito↔ricorrenza esiste nello schema:
    // importo e descrizione uguali NON sono una prova di collegamento.
    expect(ctx.debts.monthlyPayments.reconciliation.status).toBe('non_disponibile');
    expect(ctx.debts.monthlyPayments.reconciliation.linkedToRecurring).toBe(0);
    expect(ctx.debts.monthlyPayments.reconciliation.unlinked).toBe(1);
  });

  it('senza debiti la riconciliazione non ha nulla da riconciliare, e lo dichiara', async () => {
    const ctx = await getFinancialContext(userId, { referenceDate: riferimento });
    expect(ctx.debts.totalMonthlyPayments).toBe(0);
    expect(ctx.debts.monthlyPayments.reconciliation.status).toBe('nessun_debito');
    expect(ctx.debts.monthlyPayments.reconciliation.unlinked).toBe(0);
  });
});

// Punto 2 dell'audit: medie confrontabili e storico senza zeri inventati.
describe('getFinancialContext — finestra richiesta, osservata e mesi delle medie', () => {
  let app;
  let token;
  let userId;
  let conto;
  let contoId;

  beforeEach(async () => {
    app = createApp({ enableRateLimit: false });
    const { res } = await registerUser(app);
    token = res.body.token;
    userId = res.body.user.id;
    // Conto creato direttamente: passando dall'API con saldo_iniziale > 0 si
    // genererebbe un movimento "Saldo iniziale" datato oggi, che sposterebbe
    // il primo movimento dell'utente al mese corrente e annullerebbe il caso
    // in prova. Con saldo_iniziale 0 le uscite verrebbero invece rifiutate
    // per saldo insufficiente.
    conto = await Conto.create({
      user_id: userId, nome: 'C', tipo: 'banca', saldo: 100000, attivo: true,
    });
    contoId = conto.id;
  });

  const movimento = (payload) => request(app).post('/api/movimenti').set(authHeader(token)).send({
    conto_id: contoId, ...payload,
  });

  it('utente nuovo: finestra richiesta presente, osservata assente, zero mesi per le medie', async () => {
    const ctx = await getFinancialContext(userId, { referenceDate: riferimento, historyMonths: 12 });
    expect(ctx.period.requested).toEqual({ from: '2025-10', to: '2026-09' });
    expect(ctx.period.observed).toBeNull();
    expect(ctx.period.averageMonths).toEqual({ from: null, to: null, count: 0 });
    expect(ctx.expenses.history).toEqual([]);
    expect(ctx.income.history).toEqual([]);
    expect(ctx.expenses.monthlyAverage).toBeNull();
    expect(ctx.income.monthlyAverage).toBeNull();
    expect(ctx.cashFlow.monthlySavings).toBeNull();
  });

  it('lo storico non contiene mesi precedenti al primo movimento dell\'utente', async () => {
    await movimento({
      tipo: 'uscita', importo: 100, categoria: 'affitto', data: '2026-08-01',
    });
    const ctx = await getFinancialContext(userId, { referenceDate: riferimento, historyMonths: 12 });
    expect(ctx.expenses.history.map((m) => m.periodo)).toEqual(['2026-08', '2026-09']);
    expect(ctx.income.history.map((m) => m.mese)).toEqual(['2026-08', '2026-09']);
    expect(ctx.period.requested.from).toBe('2025-10');
    expect(ctx.period.observed).toEqual({ from: '2026-08', to: '2026-09' });
  });

  it('primo mese parziale: non entra nelle medie solo perché contiene un movimento', async () => {
    await movimento({
      tipo: 'uscita', importo: 500, categoria: 'affitto', data: '2026-08-14',
    });
    const ctx = await getFinancialContext(userId, { referenceDate: riferimento, historyMonths: 12 });
    expect(ctx.period.observed).toEqual({ from: '2026-08', to: '2026-09' });
    expect(ctx.dataQuality.firstObservedMonthPartial).toBe(true);
    expect(ctx.dataQuality.completeMonths).toBe(0);
    expect(ctx.expenses.monthlyAverage).toBeNull();
    expect(ctx.income.monthlyAverage).toBeNull();
  });

  it('mese corrente parziale: esposto a parte, fuori dalle medie di entrate e spese', async () => {
    await movimento({
      tipo: 'entrata', importo: 1000, categoria: 'stipendio', data: '2026-07-01', periodicita_entrata: 'ricorrente',
    });
    await movimento({
      tipo: 'entrata', importo: 1000, categoria: 'stipendio', data: '2026-08-01', periodicita_entrata: 'ricorrente',
    });
    await movimento({
      tipo: 'uscita', importo: 400, categoria: 'affitto', data: '2026-07-03',
    });
    await movimento({
      tipo: 'uscita', importo: 400, categoria: 'affitto', data: '2026-08-03',
    });
    // Mese corrente, ancora in corso: importi anomali che non devono spostare
    // nessuna media.
    await movimento({
      tipo: 'entrata', importo: 9000, categoria: 'stipendio', data: '2026-09-02', periodicita_entrata: 'occasionale',
    });
    await movimento({
      tipo: 'uscita', importo: 7000, categoria: 'affitto', data: '2026-09-02',
    });

    const ctx = await getFinancialContext(userId, { referenceDate: riferimento, historyMonths: 12 });

    expect(ctx.period.averageMonths).toEqual({ from: '2026-07', to: '2026-08', count: 2 });
    expect(ctx.income.currentMonth).toBe(9000);
    expect(ctx.expenses.currentMonth).toBe(7000);
    expect(ctx.income.monthlyAverage).toBe(1000);
    expect(ctx.expenses.monthlyAverage).toBe(400);
    expect(ctx.cashFlow.monthlySavings).toBe(600);
    expect(ctx.cashFlow.averageMonths).toBe(2);
  });

  it('entrate e spese usano esattamente gli stessi mesi per le medie', async () => {
    await movimento({
      tipo: 'entrata', importo: 900, categoria: 'stipendio', data: '2026-07-01', periodicita_entrata: 'ricorrente',
    });
    await movimento({
      tipo: 'uscita', importo: 300, categoria: 'affitto', data: '2026-08-10',
    });
    const ctx = await getFinancialContext(userId, { referenceDate: riferimento, historyMonths: 12 });
    // Agosto non ha entrate: è uno zero OSSERVATO, entra nella media.
    expect(ctx.period.averageMonths.count).toBe(2);
    expect(ctx.income.monthlyAverage).toBe(450); // (900 + 0) / 2
    expect(ctx.expenses.monthlyAverage).toBe(150); // (0 + 300) / 2
    expect(ctx.cashFlow.monthlySavings).toBe(300);
  });

  it('cambio anno: la finestra attraversa dicembre senza perdere mesi', async () => {
    await movimento({
      tipo: 'uscita', importo: 100, categoria: 'affitto', data: '2025-12-01',
    });
    await movimento({
      tipo: 'uscita', importo: 300, categoria: 'affitto', data: '2026-01-15',
    });
    const ctx = await getFinancialContext(userId, {
      referenceDate: new Date('2026-02-10T10:00:00Z'), historyMonths: 6,
    });
    expect(ctx.period.requested).toEqual({ from: '2025-09', to: '2026-02' });
    expect(ctx.period.observed).toEqual({ from: '2025-12', to: '2026-02' });
    expect(ctx.period.averageMonths).toEqual({ from: '2025-12', to: '2026-01', count: 2 });
    expect(ctx.expenses.monthlyAverage).toBe(200); // (100 + 300) / 2
  });

  it('le medie per livello di necessità esistono e riconciliano col totale dei mesi completi', async () => {
    await movimento({
      tipo: 'uscita', importo: 600, categoria: 'affitto', data: '2026-07-01', // essenziale
    });
    await movimento({
      tipo: 'uscita', importo: 100, categoria: 'svago', data: '2026-07-10', // discrezionale
    });
    await movimento({
      tipo: 'uscita', importo: 600, categoria: 'affitto', data: '2026-08-01',
    });
    await Movimento.create({
      user_id: userId, conto_id: contoId, tipo: 'uscita', importo: 50,
      categoria: 'id_orfano_inesistente', data: '2026-08-02',
    });
    await movimento({
      tipo: 'uscita', importo: 5000, categoria: 'affitto', data: '2026-09-02', // mese corrente
    });

    const ctx = await getFinancialContext(userId, { referenceDate: riferimento, historyMonths: 12 });
    const n = ctx.period.averageMonths.count;
    expect(n).toBe(2);

    const b = ctx.expenses.byNecessity;
    expect(b.essential.total).toBe(1200);
    expect(b.essential.monthlyAverage).toBe(600);
    expect(b.discretionary.total).toBe(100);
    expect(b.discretionary.monthlyAverage).toBe(50);
    expect(b.unclassified.total).toBe(50);
    expect(b.unclassified.monthlyAverage).toBe(25);
    expect(b.semiEssential.total).toBe(0);
    expect(b.semiEssential.monthlyAverage).toBe(0);

    // Riconciliazione: le quattro classi sommano al totale dei mesi completi,
    // e le quattro medie sommano alla media complessiva.
    const totale = b.essential.total + b.semiEssential.total
      + b.discretionary.total + b.unclassified.total;
    expect(totale).toBe(ctx.expenses.totalCompleteMonths);
    const medie = b.essential.monthlyAverage + b.semiEssential.monthlyAverage
      + b.discretionary.monthlyAverage + b.unclassified.monthlyAverage;
    expect(Math.abs(medie - ctx.expenses.monthlyAverage)).toBeLessThanOrEqual(0.02);
    expect(ctx.expenses.byNecessity.period).toEqual({ from: '2026-07', to: '2026-08', count: 2 });
  });

  it('storico breve: un solo mese completo basta per una media, dichiarata come tale', async () => {
    await movimento({
      tipo: 'uscita', importo: 250, categoria: 'affitto', data: '2026-08-01',
    });
    const ctx = await getFinancialContext(userId, { referenceDate: riferimento, historyMonths: 12 });
    expect(ctx.period.averageMonths).toEqual({ from: '2026-08', to: '2026-08', count: 1 });
    expect(ctx.expenses.monthlyAverage).toBe(250);
    expect(ctx.dataQuality.completeMonths).toBe(1);
    // La completezza delle REGISTRAZIONI non è osservabile: WALLT non ha
    // collegamento bancario. Il limite è dichiarato, non nascosto.
    expect(ctx.dataQuality.registrationCompleteness).toBe('non_verificabile');
  });

  it('zero osservato e dato insufficiente restano distinti', async () => {
    await movimento({
      tipo: 'uscita', importo: 120, categoria: 'affitto', data: '2026-07-01',
    });
    const ctx = await getFinancialContext(userId, { referenceDate: riferimento, historyMonths: 12 });
    // Agosto senza spese: zero osservato, un dato valido che entra nella media.
    expect(ctx.expenses.history.find((m) => m.periodo === '2026-08').totale).toBe(0);
    expect(ctx.expenses.monthlyAverage).toBe(60); // (120 + 0) / 2
    // Le entrate non esistono affatto: media nulla, non zero.
    expect(ctx.income.monthlyAverage).toBe(0); // zero osservato in due mesi completi
    expect(ctx.dataQuality.missingIncomeData).toBe(true);
  });
});
