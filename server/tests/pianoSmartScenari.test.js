/**
 * I tre scenari obbligatori di Piano Smart V1, verificati per ORDINAMENTO e
 * non per valore.
 *
 * Nessuna cifra è hardcoded, per una ragione precisa: un test che fissa
 * "safety deve valere 296.04" si rompe alla prima taratura dei pesi anche
 * quando il motore è perfettamente corretto, e nel frattempo non dimostra
 * nulla di ciò che conta. Quello che conta è che B sia più prudente di A e che
 * C sia più espansivo: sono proprietà del motore, non della taratura.
 *
 * Nessun database: suite pura.
 */
const { generaPiano } = require('../services/pianoSmart/allocation.service');
const { contestoFinto, obiettivoFinto } = require('./helpers/pianoSmartContesto');

const frazioni = (esito) => Object.fromEntries(
  esito.allocations.map((a) => [a.category, a.recommendedCents / esito.allocatableCents]),
);
const somma = (esito) => esito.allocations.reduce((s, a) => s + a.recommendedCents, 0);

/**
 * Scenario A — 800 € di regalo, una tantum, reddito stabile, fondo di
 * sicurezza sotto il target, obiettivi attivi, cash flow positivo, nessun
 * debito critico.
 */
const scenarioA = () => generaPiano({
  incomingCents: 80000,
  mandatoryCents: 0,
  sourceType: 'regalo',
  sourceRecurring: false,
  context: contestoFinto({
    income: { stability: 'stabile' },
    cashFlow: { monthlySavings: 500, savingsRate: 0.25 },
    emergencyFund: {
      coverageMonths: 1.5, current: 1200, target: 2400, targetMonths: 3, missingAmount: 1200,
    },
    goals: [obiettivoFinto({
      id: 1, nome: 'Vacanza', priorita: 'media', importo_restante: 1500,
    })],
    debts: { totalOutstanding: 0, totalMonthlyPayments: 0, debtPressure: null },
  }),
});

/**
 * Scenario B — 1000 € di stipendio con 400 € di spese obbligatorie
 * (allocabile 600), cash flow debole, fondo di sicurezza critico, pressione
 * debitoria significativa.
 */
const scenarioB = () => generaPiano({
  incomingCents: 100000,
  mandatoryCents: 40000,
  sourceType: 'stipendio',
  sourceRecurring: true,
  context: contestoFinto({
    cashFlow: { monthlySavings: 30, savingsRate: 0.015 },
    emergencyFund: {
      coverageMonths: 0.3, current: 250, target: 2400, targetMonths: 3, missingAmount: 2150,
    },
    goals: [obiettivoFinto({ id: 1, nome: 'Vacanza', priorita: 'media', importo_restante: 1500 })],
    debts: { totalOutstanding: 45000, totalMonthlyPayments: 850, debtPressure: 0.425 },
  }),
});

/**
 * Scenario C — 1500 € di bonus, fondo di sicurezza al traguardo, nessun
 * debito, cash flow positivo, obiettivi normali, alta capacità di risparmio.
 */
const scenarioC = () => generaPiano({
  incomingCents: 150000,
  mandatoryCents: 0,
  sourceType: 'bonus',
  sourceRecurring: false,
  context: contestoFinto({
    cashFlow: { monthlySavings: 800, savingsRate: 0.4 },
    emergencyFund: {
      coverageMonths: 3.2, current: 2560, target: 2400, targetMonths: 3, missingAmount: 0,
    },
    goals: [obiettivoFinto({ id: 1, nome: 'Vacanza', priorita: 'media', importo_restante: 1500 })],
    debts: { totalOutstanding: 0, totalMonthlyPayments: 0, debtPressure: null },
  }),
});

describe('Scenario A — 800 € di regalo', () => {
  test('il totale è esattamente la somma ricevuta', () => {
    const esito = scenarioA();
    expect(esito.allocatableCents).toBe(80000);
    expect(somma(esito)).toBe(80000);
  });

  test('la sicurezza è relativamente prioritaria', () => {
    const f = frazioni(scenarioA());
    expect(f.safety).toBeGreaterThan(f.needs);
    expect(f.safety).toBeGreaterThan(f.freedom);
  });

  test('obiettivi e futuro ricevono qualcosa', () => {
    const f = frazioni(scenarioA());
    expect(f.goals).toBeGreaterThan(0);
    expect(f.future).toBeGreaterThan(0);
  });

  test('la libertà è ragionevole, non azzerata e non dominante', () => {
    const f = frazioni(scenarioA());
    expect(f.freedom).toBeGreaterThan(0);
    expect(f.freedom).toBeLessThan(0.2);
  });

  test('i reason code sono coerenti con lo scenario', () => {
    const codici = scenarioA().reasonCodes;
    expect(codici).toContain('LOW_EMERGENCY_BUFFER');
    expect(codici).toContain('STABLE_INCOME');
    expect(codici).toContain('EXTRA_INCOME');
    expect(codici).not.toContain('NEGATIVE_CASH_FLOW');
    expect(codici).not.toContain('HIGH_DEBT_PRESSURE');
    expect(codici).not.toContain('NO_ACTIVE_GOALS');
  });
});

describe('Scenario B — 1000 € di stipendio con 400 € di obbligatorie', () => {
  test('il capitale allocabile è la differenza, non l intera entrata', () => {
    const esito = scenarioB();
    expect(esito.allocatableCents).toBe(60000);
    expect(somma(esito)).toBe(60000);
  });

  test('è più prudente dello scenario A: necessità e sicurezza pesano di più', () => {
    const a = frazioni(scenarioA());
    const b = frazioni(scenarioB());
    expect(b.needs + b.safety).toBeGreaterThan(a.needs + a.safety);
    expect(b.needs).toBeGreaterThan(a.needs);
  });

  test('è più prudente dello scenario A: futuro e libertà pesano di meno', () => {
    const a = frazioni(scenarioA());
    const b = frazioni(scenarioB());
    expect(b.future + b.freedom).toBeLessThan(a.future + a.freedom);
    expect(b.future).toBeLessThan(a.future);
    expect(b.freedom).toBeLessThan(a.freedom);
  });

  test('la libertà è compressa ma non annullata', () => {
    expect(frazioni(scenarioB()).freedom).toBeGreaterThan(0);
  });

  test('i reason code dichiarano emergenza e debito', () => {
    const codici = scenarioB().reasonCodes;
    expect(codici).toContain('LOW_EMERGENCY_BUFFER');
    expect(codici).toContain('HIGH_DEBT_PRESSURE');
    expect(codici).toContain('RECURRING_INCOME');
  });

  test('non propone di destinare tutto a una sola categoria', () => {
    const esito = scenarioB();
    esito.allocations.forEach((a) => {
      expect(a.recommendedCents).toBeLessThan(esito.allocatableCents);
    });
  });
});

describe('Scenario C — 1500 € di bonus con fondo al traguardo', () => {
  test('il totale è esattamente la somma ricevuta', () => {
    const esito = scenarioC();
    expect(esito.allocatableCents).toBe(150000);
    expect(somma(esito)).toBe(150000);
  });

  test('dà più spazio che A a obiettivi, futuro e libertà', () => {
    const a = frazioni(scenarioA());
    const c = frazioni(scenarioC());
    expect(c.goals).toBeGreaterThan(a.goals);
    expect(c.future).toBeGreaterThan(a.future);
    expect(c.freedom).toBeGreaterThan(a.freedom);
  });

  test('dà meno spazio che A alla sicurezza', () => {
    const a = frazioni(scenarioA());
    const c = frazioni(scenarioC());
    expect(c.safety).toBeLessThan(a.safety);
  });

  test('il fondo al traguardo non riceve altro denaro', () => {
    const esito = scenarioC();
    const safety = esito.allocations.find((s) => s.category === 'safety');
    expect(safety.recommendedCents).toBe(0);
    expect(safety.metadata.capApplied).toBe(true);
  });

  test('i reason code dichiarano il traguardo raggiunto', () => {
    const codici = scenarioC().reasonCodes;
    expect(codici).toContain('EMERGENCY_TARGET_REACHED');
    expect(codici).toContain('HIGH_SAVINGS_CAPACITY');
    expect(codici).not.toContain('LOW_EMERGENCY_BUFFER');
    expect(codici).not.toContain('HIGH_DEBT_PRESSURE');
  });
});

describe('ordinamento complessivo fra i tre scenari', () => {
  test('la prudenza decresce da B ad A a C', () => {
    const prudenza = (esito) => {
      const f = frazioni(esito);
      return f.needs + f.safety;
    };
    expect(prudenza(scenarioB())).toBeGreaterThan(prudenza(scenarioA()));
    expect(prudenza(scenarioA())).toBeGreaterThan(prudenza(scenarioC()));
  });

  test('l apertura al futuro cresce da B ad A a C', () => {
    const apertura = (esito) => {
      const f = frazioni(esito);
      return f.future + f.freedom;
    };
    expect(apertura(scenarioB())).toBeLessThan(apertura(scenarioA()));
    expect(apertura(scenarioA())).toBeLessThan(apertura(scenarioC()));
  });

  test('i tre scenari restano riproducibili', () => {
    [scenarioA, scenarioB, scenarioC].forEach((scenario) => {
      const primo = scenario();
      const secondo = scenario();
      expect(secondo.allocations).toEqual(primo.allocations);
    });
  });
});
