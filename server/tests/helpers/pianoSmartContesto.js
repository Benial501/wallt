/**
 * Costruttore di FinancialContext finti per i test puri di Piano Smart.
 *
 * NON è una reimplementazione di `getFinancialContext`: è una fixture che
 * riproduce la *forma* della sua risposta, così le suite del motore possono
 * girare senza database. Le suite API usano il contesto reale.
 *
 * Il default è un utente "sano e ben documentato": storico completo, reddito
 * stabile, cash flow positivo, nessun debito, fondo sicurezza sotto target.
 * Ogni scenario parte da qui e cambia solo ciò che gli serve, così la
 * differenza fra due scenari resta leggibile.
 */

const fondiOggetto = (base, sopra) => {
  if (sopra === null || sopra === undefined) return sopra === null ? null : base;
  if (Array.isArray(sopra)) return sopra;
  if (typeof sopra !== 'object') return sopra;
  const esito = { ...base };
  Object.entries(sopra).forEach(([chiave, valore]) => {
    const precedente = base ? base[chiave] : undefined;
    esito[chiave] = (precedente && typeof precedente === 'object' && !Array.isArray(precedente))
      ? fondiOggetto(precedente, valore)
      : valore;
  });
  return esito;
};

const obiettivoFinto = (over = {}) => ({
  id: 1,
  nome: 'Vacanza',
  tipo_obiettivo: 'generico',
  priorita: 'media',
  importo_target: 2000,
  importo_attuale: 500,
  importo_restante: 1500,
  scadenza: null,
  mesi_rimanenti: null,
  contributo_mensile_richiesto: null,
  stato: 'senza_scadenza',
  ...over,
});

const contestoBase = () => ({
  period: {
    timezone: 'Europe/Rome',
    referenceDate: '2026-09-24',
    from: '2025-10-01',
    to: '2026-09-24',
    historyMonths: 12,
    requested: { from: '2025-10', to: '2026-09' },
    observed: { from: '2025-10', to: '2026-09' },
    averageMonths: { from: '2025-10', to: '2026-08', count: 11 },
  },
  dataQuality: {
    historyMonthsAvailable: 12,
    completeMonths: 11,
    incompleteMonths: 1,
    firstObservedMonthPartial: false,
    missingIncomeData: false,
    missingExpenseData: false,
    missingClassificationData: false,
    hasSufficientHistory: true,
    registrationCompleteness: 'non_verificabile',
  },
  income: {
    currentMonth: 2000,
    monthlyAverage: 2000,
    averageMonths: 11,
    recurring: 20000,
    recurringMonthlyAverage: 2000,
    oneOff: 0,
    unclassified: 0,
    stability: 'stabile',
    stabilityMonths: 11,
    stabilityPeriod: { da: '2025-10', a: '2026-08', quantita: 11 },
    history: [],
  },
  expenses: {
    currentMonth: 600,
    monthlyAverage: 1500,
    averageMonths: 11,
    totalCompleteMonths: 16500,
    totalObserved: 17100,
    byNecessity: {
      period: { from: '2025-10', to: '2026-08', count: 11 },
      essential: { total: 8800, monthlyAverage: 800 },
      semiEssential: { total: 3300, monthlyAverage: 300 },
      discretionary: { total: 4400, monthlyAverage: 400 },
      unclassified: { total: 0, monthlyAverage: 0 },
      total: 16500,
    },
    history: [
      { mese: '2026-06', totale: 1500, parziale: false },
      { mese: '2026-07', totale: 1500, parziale: false },
      { mese: '2026-08', totale: 1500, parziale: false },
      { mese: '2026-09', totale: 600, parziale: true },
    ],
  },
  cashFlow: {
    monthlyAverageIncome: 2000,
    monthlyAverageExpenses: 1500,
    monthlySavings: 500,
    savingsRate: 0.25,
    averageMonths: 11,
  },
  liquidity: {
    total: 3000,
    ordinary: 3000,
    specialAccounts: 0,
    allocated: 500,
    commitments: 0,
    free: 2500,
    allocatable: 2500,
  },
  emergencyFund: {
    essentialMonthlyExpenses: 800,
    current: 800,
    target: 2400,
    targetMonths: 3,
    coverageMonths: 1,
    missingAmount: 1600,
    status: 'disponibile',
    classificazione_incompleta: false,
    period: { from: '2026-06', to: '2026-08', months: 3 },
    requestedPeriod: { da: '2026-06', a: '2026-09', mesi: 3 },
    usedMonths: 3,
    limitedHistory: false,
  },
  goals: [obiettivoFinto()],
  debts: {
    items: [],
    totalOutstanding: 0,
    totalMonthlyPayments: 0,
    monthlyPayments: {
      total: 0,
      includedInLiquidityCommitments: false,
      reconciliation: { status: 'nessun_debito', linkedToRecurring: 0, unlinked: 0, note: '' },
    },
    debtPressure: null,
  },
  investments: {
    totalValue: 0,
    liquidValue: 0,
    nonLiquidValue: 0,
    unknownLiquidityValue: 0,
    items: [],
  },
  recurring: {
    active: 0, paused: 0, ended: 0, commitments: 0,
  },
  netWorth: { assets: 3000, liabilities: 0, total: 3000 },
});

/** Contesto di un utente appena registrato: nessun movimento, nessun conto,
 * tutte le medie assenti. È lo stato che `getFinancialContext` produce davvero
 * per un nuovo utente, non un oggetto vuoto. */
const contestoNuovoUtente = () => contestoFinto({
  period: {
    observed: null,
    averageMonths: { from: null, to: null, count: 0 },
  },
  dataQuality: {
    historyMonthsAvailable: 0,
    completeMonths: 0,
    incompleteMonths: 0,
    missingIncomeData: true,
    missingExpenseData: true,
    hasSufficientHistory: false,
  },
  income: {
    currentMonth: 0,
    monthlyAverage: null,
    recurringMonthlyAverage: null,
    recurring: 0,
    stability: 'insufficiente',
    stabilityMonths: 0,
    history: [],
  },
  expenses: {
    currentMonth: 0,
    monthlyAverage: null,
    totalCompleteMonths: 0,
    totalObserved: 0,
    byNecessity: {
      essential: { total: 0, monthlyAverage: null },
      semiEssential: { total: 0, monthlyAverage: null },
      discretionary: { total: 0, monthlyAverage: null },
      unclassified: { total: 0, monthlyAverage: null },
      total: 0,
    },
    history: [],
  },
  cashFlow: {
    monthlyAverageIncome: null,
    monthlyAverageExpenses: null,
    monthlySavings: null,
    savingsRate: null,
    averageMonths: 0,
  },
  liquidity: {
    total: 0, ordinary: 0, specialAccounts: 0, allocated: 0, commitments: 0, free: 0, allocatable: 0,
  },
  emergencyFund: {
    essentialMonthlyExpenses: null,
    current: null,
    target: null,
    targetMonths: null,
    coverageMonths: null,
    missingAmount: null,
    status: 'assente',
    period: null,
  },
  goals: [],
  netWorth: { assets: 0, liabilities: 0, total: 0 },
});

const contestoFinto = (overrides = {}) => fondiOggetto(contestoBase(), overrides);

module.exports = { contestoFinto, contestoNuovoUtente, obiettivoFinto };
