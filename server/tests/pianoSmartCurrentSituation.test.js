const { buildCurrentSituation, simulatePurchase } = require('../services/pianoSmartV2/currentSituation.service');
const now = new Date('2026-09-25T12:00:00Z');
const context = (overrides = {}) => ({
  period: { referenceDate: '2026-09-25' },
  liquidity: { ordinary: 800, allocated: 200, allocatable: 500, commitments: 100 },
  expenses: { currentMonth: 300, variableCurrentMonth: 300, monthlyAverage: 400 },
  income: { currentMonth: 1200, monthlyAverage: 1200 },
  emergencyFund: { status: 'assente', missingAmount: null },
  dataQuality: { completeMonths: 3, firstMovementDate: '2026-06-01', registrationCompleteness: 'non_verificabile' },
  netWorth: { total: 2000, assets: 2500, liabilities: 500 },
  debts: { totalOutstanding: 500 }, goals: [],
  recurring: { items: [{ id: 1, occurrenceKey: '1:2026-09', dueDate: '2026-09-27', amount: 100, reserved: true }] },
  ...overrides,
});
const build = (overrides = {}, date = now) => buildCurrentSituation({ context: context(overrides), now: date });

describe('Piano Smart: situazione corrente', () => {
  test('riconcilia saldo ordinario, obiettivi e impegni senza bloccare il fondo ancora da costruire', () => {
    const result = build({ emergencyFund: { missingAmount: 2000 } });
    expect(result.current).toMatchObject({ liquidity: '800.00', protectedAmount: '300.00', allocatedToGoals: '200.00', commitments: '100.00', availableToSpend: '500.00', dailyLimit: '83.33', dailyMargin: '71.33', remainingDays: 6 });
  });
  test('non sottrae due volte gli impegni già protetti', () => {
    expect(build().upcoming).toMatchObject({ total: '100.00', afterTotal: '500.00' });
  });
  test('protegge anche le ulteriori occorrenze settimanali entro fine mese', () => {
    const result = build({ recurring: { items: [{ id: 1, dueDate: '2026-09-28', amount: 40, reserved: false }, { id: 2, dueDate: '2026-10-01', amount: 900, reserved: false }] } });
    expect(result.current.availableToSpend).toBe('460.00');
    expect(result.current.protectedAmount).toBe('340.00');
    expect(result.upcoming.total).toBe('40.00');
  });
  test('mantiene espliciti dati mancanti e previsione non stimabile', () => {
    const result = build({ expenses: { currentMonth: 0, variableCurrentMonth: 0 }, dataQuality: { completeMonths: 0, missingExpenseData: true, firstMovementDate: null } });
    expect(result.forecast.endOfMonthAvailable).toBeNull();
    expect(result.forecast.status).toBe('non_stimabile');
    expect(result.current.actualDailySpend).toBeNull();
    expect(result.insights.some((i) => i.key === 'forecast')).toBe(false);
    expect(build({ liquidity: {} }).current.availableToSpend).toBeNull();
  });
  test('espone le medie recenti per categoria nella situazione corrente', () => {
    const frequentAverages = {
      weekly: { from: '2026-09-14', to: '2026-09-20', periodCount: 1, items: [{ category: 'cibo_spesa', total: 42, average: 42 }] },
      monthly: { from: '2026-08-01', to: '2026-08-31', periodCount: 1, items: [{ category: 'cibo_spesa', total: 180, average: 180 }] },
    };
    const result = build({ expenses: { frequentAverages } });
    expect(result.frequentExpenses.weekly.items[0]).toMatchObject({ total: '42.00', average: '42.00' });
    expect(result.frequentExpenses.monthly.items[0]).toMatchObject({ total: '180.00', average: '180.00' });
  });
  test('zero osservato con storico è diverso da dato mancante', () => {
    const result = build({ expenses: { currentMonth: 0, variableCurrentMonth: 0 }, dataQuality: { completeMonths: 3, firstMovementDate: '2026-06-01', missingExpenseData: false } });
    expect(result.current.actualDailySpend).toBe('0.00');
    expect(result.forecast.endOfMonthAvailable).toBe('500.00');
  });
  test('misura il ritmo sui giorni osservati e non proietta le ricorrenti una seconda volta', () => {
    const result = build({ expenses: { currentMonth: 400, variableCurrentMonth: 100 }, dataQuality: { completeMonths: 0, firstMovementDate: '2026-09-21' } });
    expect(result.current.actualDailySpend).toBe('20.00');
    expect(result.forecast.endOfMonthAvailable).toBe('380.00');
    expect(result.forecast.observedDays).toBe(5);
  });
  test('usa il giorno civile di Roma al cambio mese', () => {
    const result = build({ period: {}, dataQuality: { completeMonths: 3, firstMovementDate: '2026-06-01' } }, new Date('2026-09-30T22:30:00Z'));
    expect(result.current.period).toBe('2026-10-01');
    expect(result.current.remainingDays).toBe(31);
  });
  test('espone deficit e previsione negativa senza nasconderli dietro zero', () => {
    const result = build({ liquidity: { ordinary: 100, allocated: 200, commitments: 100, allocatable: -200 } });
    expect(result.current.availableToSpend).toBe('0.00');
    expect(result.current.shortfall).toBe('200.00');
    expect(result.forecast.endOfMonthAvailable).toBe('-272.00');
  });
  test('conta come attivi solo gli obiettivi non completati, col vocabolario degli obiettivi', () => {
    const goals = [
      { id: 1, nome: 'Fondo', stato: 'completato' },
      { id: 2, nome: 'Viaggio', stato: 'in_corso' },
      { id: 3, nome: 'Auto', stato: 'scaduto' },
    ];
    const result = build({ goals });
    expect(result.financialDirection.activeGoals).toBe(2);
    expect(result.financialDirection.goals).toHaveLength(3);
  });
  test('senza obiettivi attivi non conta nulla e non suggerisce di controllarli', () => {
    const result = build({ goals: [{ id: 1, nome: 'Fondo', stato: 'completato' }] });
    expect(result.financialDirection.activeGoals).toBe(0);
    expect(result.suggestions.some((s) => s.key === 'review-goals')).toBe(false);
  });
  test('un conto in rosso non fa fallire la direzione finanziaria', () => {
    const result = build({ netWorth: { total: -10, assets: -10, liabilities: 0 } });
    expect(result.financialDirection.assets).toBe('-10.00');
  });
  test('serializza una previsione negativa e limita le azioni a tre', () => {
    const result = build({ expenses: { currentMonth: 2400, variableCurrentMonth: 2400, monthlyAverage: 1500 } });
    expect(result.forecast.endOfMonthAvailable).toBe('-76.00');
    expect(result.suggestions.length).toBeLessThanOrEqual(3);
    expect(result.suggestions.some((s) => s.key === 'review-spending')).toBe(true);
  });
  test('costruisce il margine progressivo senza sottrarre due volte le uscite protette', () => {
    const result = build({ recurring: { cashFlowItems: [
      { id: 1, occurrenceKey: '1:2026-09', description: 'Palestra', amount: 60, dueDate: '2026-09-26', direction: 'uscita', reserved: true },
      { id: 2, occurrenceKey: '2:2026-09', description: 'Stipendio', amount: 100, dueDate: '2026-09-27', direction: 'entrata', reserved: false },
      { id: 3, occurrenceKey: '3:2026-09', description: 'Assicurazione', amount: 40, dueDate: '2026-09-28', direction: 'uscita', reserved: false },
    ] } });
    expect(result.cashFlowTimeline.map((item) => item.marginAfter)).toEqual(['500.00', '600.00', '560.00']);
    expect(result.cashFlowTimeline.map((item) => item.direction)).toEqual(['uscita', 'entrata', 'uscita']);
  });
  test('non sottrae nel radar le ulteriori scadenze già tolte dallo spendibile iniziale', () => {
    const result = build({ recurring: {
      items: [{ id: 4, occurrenceKey: '4:2026-09', dueDate: '2026-09-28', amount: 40, reserved: false }],
      cashFlowItems: [
        { id: 4, occurrenceKey: '4:2026-09', description: 'Assicurazione', amount: 40, dueDate: '2026-09-28', direction: 'uscita', reserved: false },
        { id: 5, occurrenceKey: '5:2026-10', description: 'Manutenzione', amount: 30, dueDate: '2026-10-05', direction: 'uscita', reserved: false },
      ],
    } });
    expect(result.current.availableToSpend).toBe('460.00');
    expect(result.cashFlowTimeline.map((item) => item.marginAfter)).toEqual(['460.00', '430.00']);
  });
  test('il radar resta vuoto quando non ci sono eventi futuri', () => {
    expect(build({ recurring: {} }).cashFlowTimeline).toEqual([]);
  });
  test('stima il singolo obiettivo solo con almeno tre mesi e margine mensile positivo', () => {
    const result = build({
      income: { monthlyAverage: 520 }, expenses: { monthlyAverage: 400 },
      dataQuality: { completeMonths: 5 },
      goals: [{ id: 1, nome: 'Auto', importo_restante: 760, contributo_mensile_richiesto: 100, scadenza: null, stato: 'in_corso' }],
    });
    expect(result.financialDirection.goals[0]).toMatchObject({
      importo_restante: '760.00', contributo_mensile_richiesto: '100.00',
      estimatedMonthsAtCurrentMargin: 7, estimateBasis: 'margine_medio_mensile',
    });
  });
  test('non stima gli obiettivi con storico corto o senza margine positivo', () => {
    const short = build({
      income: { monthlyAverage: 520 }, expenses: { monthlyAverage: 400 }, dataQuality: { completeMonths: 2 },
      goals: [{ id: 1, importo_restante: 760, stato: 'in_corso' }],
    }).financialDirection.goals[0];
    const noMargin = build({
      income: { monthlyAverage: 400 }, expenses: { monthlyAverage: 400 }, dataQuality: { completeMonths: 5 },
      goals: [{ id: 2, importo_restante: 760, stato: 'in_corso' }],
    }).financialDirection.goals[0];
    expect(short.estimatedMonthsAtCurrentMargin).toBeNull();
    expect(short.estimateReason).toMatch(/tre mesi/i);
    expect(noMargin.estimatedMonthsAtCurrentMargin).toBeNull();
    expect(noMargin.estimateReason).toMatch(/positivo/i);
  });
  test('mantiene gli importi mancanti null e non stima obiettivi completati o scaduti', () => {
    const goals = build({
      income: { monthlyAverage: 520 }, expenses: { monthlyAverage: 400 }, dataQuality: { completeMonths: 5 },
      goals: [
        { id: 1, importo_restante: null, stato: 'in_corso' },
        { id: 2, importo_restante: 10, stato: 'completato' },
        { id: 3, importo_restante: 10, stato: 'scaduto' },
        { id: 4, importo_restante: -10, stato: 'in_corso' },
      ],
    }).financialDirection.goals;
    expect(goals[0].importo_restante).toBeNull();
    expect(goals.map((goal) => goal.estimatedMonthsAtCurrentMargin)).toEqual([null, null, null, null]);
    expect(goals[3].importo_restante).toBeNull();
  });
});

describe('Piano Smart: simulazione acquisto', () => {
  const situazione = {
    current: { availableToSpend: '1000.00', shortfall: '0.00', dailyLimit: '100.00', remainingDays: 10 },
    forecast: { endOfMonthAvailable: '700.00' },
  };

  test('calcola il confronto prima/dopo in centesimi e mantiene distinti i dati non stimabili', () => {
    expect(simulatePurchase(situazione, '125.50')).toMatchObject({
      amount: '125.50', availableBefore: '1000.00', availableAfter: '874.50',
      dailyLimitBefore: '100.00', dailyLimitAfter: '87.45',
      forecastBefore: '700.00', forecastAfter: '574.50', status: 'attenzione',
    });
    expect(simulatePurchase({ ...situazione, forecast: { endOfMonthAvailable: null } }, '25.00').forecastAfter).toBeNull();
  });

  test('rifiuta importi non positivi o con più di due decimali', () => {
    expect(simulatePurchase(situazione, '0')).toBeNull();
    expect(simulatePurchase(situazione, '1.005')).toBeNull();
  });
});
