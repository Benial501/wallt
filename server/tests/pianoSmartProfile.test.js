/**
 * SmartFinancialProfile: mappatura pura FinancialContext → otto fasce.
 *
 * Il punto di queste asserzioni non è il valore di una soglia, è il confine
 * fra "so che è medio" e "non lo so": una fascia `null` non deve mai diventare
 * un valore centrale inventato.
 *
 * Nessun database: suite pura.
 */
const { buildProfile } = require('../services/pianoSmart/profile.service');
const { contestoFinto, contestoNuovoUtente, obiettivoFinto } = require('./helpers/pianoSmartContesto');

describe('incomeStability', () => {
  test('stabile diventa HIGH', () => {
    expect(buildProfile(contestoFinto()).incomeStability).toBe('HIGH');
  });

  test('variabile diventa LOW', () => {
    const p = buildProfile(contestoFinto({ income: { stability: 'variabile' } }));
    expect(p.incomeStability).toBe('LOW');
  });

  test('storico insufficiente non è stabilità: MEDIUM e dichiarato ignoto', () => {
    const p = buildProfile(contestoFinto({ income: { stability: 'insufficiente' } }));
    expect(p.incomeStability).toBe('MEDIUM');
    expect(p.ignoti).toContain('incomeStability');
  });

  test('nessuna entrata registrata non è stabilità', () => {
    const p = buildProfile(contestoFinto({ income: { stability: 'nessuna_entrata' } }));
    expect(p.incomeStability).toBe('MEDIUM');
    expect(p.ignoti).toContain('incomeStability');
  });
});

describe('expensePressure', () => {
  test('spese essenziali basse rispetto al reddito ricorrente', () => {
    // 800 / 2000 = 0.4 → LOW
    expect(buildProfile(contestoFinto()).expensePressure).toBe('LOW');
  });

  test('oltre il 70% del reddito ricorrente è HIGH', () => {
    const p = buildProfile(contestoFinto({
      expenses: { byNecessity: { essential: { monthlyAverage: 1500 } } },
    }));
    expect(p.expensePressure).toBe('HIGH');
  });

  test('fra 50% e 70% è MEDIUM', () => {
    const p = buildProfile(contestoFinto({
      expenses: { byNecessity: { essential: { monthlyAverage: 1200 } } },
    }));
    expect(p.expensePressure).toBe('MEDIUM');
  });

  test('senza spese essenziali note la fascia è null, non MEDIUM', () => {
    const p = buildProfile(contestoFinto({
      expenses: { byNecessity: { essential: { monthlyAverage: null } } },
    }));
    expect(p.expensePressure).toBeNull();
  });

  test('senza reddito ricorrente noto la fascia è null', () => {
    const p = buildProfile(contestoFinto({ income: { recurringMonthlyAverage: null } }));
    expect(p.expensePressure).toBeNull();
  });

  test('reddito ricorrente zero non produce una divisione per zero', () => {
    const p = buildProfile(contestoFinto({ income: { recurringMonthlyAverage: 0 } }));
    expect(p.expensePressure).toBeNull();
  });
});

describe('savingsCapacity', () => {
  test('risparmio negativo', () => {
    const p = buildProfile(contestoFinto({ cashFlow: { monthlySavings: -200, savingsRate: -0.1 } }));
    expect(p.savingsCapacity).toBe('NEGATIVE');
  });

  test('risparmio esattamente zero non è negativo', () => {
    const p = buildProfile(contestoFinto({ cashFlow: { monthlySavings: 0, savingsRate: 0 } }));
    expect(p.savingsCapacity).toBe('LOW');
  });

  test('tasso alto', () => {
    expect(buildProfile(contestoFinto()).savingsCapacity).toBe('HIGH');
  });

  test('tasso intermedio', () => {
    const p = buildProfile(contestoFinto({ cashFlow: { monthlySavings: 200, savingsRate: 0.1 } }));
    expect(p.savingsCapacity).toBe('MEDIUM');
  });

  test('senza cash flow noto la fascia è null', () => {
    const p = buildProfile(contestoFinto({ cashFlow: { monthlySavings: null, savingsRate: null } }));
    expect(p.savingsCapacity).toBeNull();
  });
});

describe('emergencyCoverage', () => {
  test('sotto un mese è CRITICAL', () => {
    const p = buildProfile(contestoFinto({ emergencyFund: { coverageMonths: 0.5 } }));
    expect(p.emergencyCoverage).toBe('CRITICAL');
  });

  test('zero mesi è CRITICAL', () => {
    const p = buildProfile(contestoFinto({ emergencyFund: { coverageMonths: 0 } }));
    expect(p.emergencyCoverage).toBe('CRITICAL');
  });

  test('un mese su tre di target è LOW', () => {
    expect(buildProfile(contestoFinto()).emergencyCoverage).toBe('LOW');
  });

  test('target raggiunto è ADEQUATE', () => {
    const p = buildProfile(contestoFinto({
      emergencyFund: { coverageMonths: 3, current: 2400, missingAmount: 0 },
    }));
    expect(p.emergencyCoverage).toBe('ADEQUATE');
  });

  test('target largamente superato è STRONG', () => {
    const p = buildProfile(contestoFinto({
      emergencyFund: { coverageMonths: 6, current: 4800, missingAmount: 0 },
    }));
    expect(p.emergencyCoverage).toBe('STRONG');
  });

  test('nessun fondo definito: fascia null, nessun target inventato', () => {
    const p = buildProfile(contestoNuovoUtente());
    expect(p.emergencyCoverage).toBeNull();
  });

  test('fondo definito ma copertura non calcolabile resta null', () => {
    const p = buildProfile(contestoFinto({
      emergencyFund: { status: 'non_calcolabile', coverageMonths: null },
    }));
    expect(p.emergencyCoverage).toBeNull();
  });
});

describe('goalPressure', () => {
  test('nessun obiettivo è NONE', () => {
    expect(buildProfile(contestoFinto({ goals: [] })).goalPressure).toBe('NONE');
  });

  test('solo obiettivi completati è NONE', () => {
    const p = buildProfile(contestoFinto({
      goals: [obiettivoFinto({ stato: 'completato', importo_restante: 0 })],
    }));
    expect(p.goalPressure).toBe('NONE');
  });

  test('obiettivo senza scadenza è LOW', () => {
    expect(buildProfile(contestoFinto()).goalPressure).toBe('LOW');
  });

  test('scadenza entro sei mesi è MEDIUM', () => {
    const p = buildProfile(contestoFinto({
      goals: [obiettivoFinto({ stato: 'in_corso', mesi_rimanenti: 5, scadenza: '2027-02-01' })],
    }));
    expect(p.goalPressure).toBe('MEDIUM');
  });

  test('scadenza entro tre mesi è HIGH', () => {
    const p = buildProfile(contestoFinto({
      goals: [obiettivoFinto({ stato: 'in_corso', mesi_rimanenti: 2, scadenza: '2026-11-01' })],
    }));
    expect(p.goalPressure).toBe('HIGH');
  });

  test('obiettivo scaduto è HIGH', () => {
    const p = buildProfile(contestoFinto({
      goals: [obiettivoFinto({ stato: 'scaduto', mesi_rimanenti: 0, scadenza: '2026-08-01' })],
    }));
    expect(p.goalPressure).toBe('HIGH');
  });
});

describe('debtPressure', () => {
  test('nessun debito è NONE, non ignoto', () => {
    const p = buildProfile(contestoFinto());
    expect(p.debtPressure).toBe('NONE');
    expect(p.ignoti).not.toContain('debtPressure');
  });

  test('pressione bassa', () => {
    const p = buildProfile(contestoFinto({
      debts: { totalOutstanding: 5000, totalMonthlyPayments: 200, debtPressure: 0.1 },
    }));
    expect(p.debtPressure).toBe('LOW');
  });

  test('pressione alta', () => {
    const p = buildProfile(contestoFinto({
      debts: { totalOutstanding: 30000, totalMonthlyPayments: 900, debtPressure: 0.45 },
    }));
    expect(p.debtPressure).toBe('HIGH');
  });

  test('debiti presenti ma reddito affidabile ignoto: fascia null', () => {
    const p = buildProfile(contestoFinto({
      debts: { totalOutstanding: 10000, totalMonthlyPayments: 400, debtPressure: null },
    }));
    expect(p.debtPressure).toBeNull();
  });
});

describe('financialFlexibility', () => {
  test('liquidità allocabile pari a oltre tre mesi di essenziali è HIGH', () => {
    const p = buildProfile(contestoFinto({ liquidity: { allocatable: 3000 } }));
    expect(p.financialFlexibility).toBe('HIGH');
  });

  test('liquidità allocabile negativa è LOW', () => {
    const p = buildProfile(contestoFinto({ liquidity: { allocatable: -200 } }));
    expect(p.financialFlexibility).toBe('LOW');
  });

  test('senza spese essenziali note la fascia è null', () => {
    const p = buildProfile(contestoFinto({
      expenses: { byNecessity: { essential: { monthlyAverage: null } } },
    }));
    expect(p.financialFlexibility).toBeNull();
  });
});

describe('dataConfidence', () => {
  test('storico pieno e sufficiente è GOOD', () => {
    expect(buildProfile(contestoFinto()).dataConfidence).toBe('GOOD');
  });

  test('nuovo utente senza mesi completi è INSUFFICIENT', () => {
    expect(buildProfile(contestoNuovoUtente()).dataConfidence).toBe('INSUFFICIENT');
  });

  test('un solo mese completo è LIMITED', () => {
    const p = buildProfile(contestoFinto({
      dataQuality: { completeMonths: 1, hasSufficientHistory: false },
      income: { stability: 'insufficiente', stabilityMonths: 1 },
    }));
    expect(p.dataConfidence).toBe('LIMITED');
  });

  test('classificazione delle spese incompleta abbassa la confidenza', () => {
    const p = buildProfile(contestoFinto({
      dataQuality: { missingClassificationData: true },
    }));
    expect(p.dataConfidence).toBe('LIMITED');
  });

  test('le risposte manuali portano un nuovo utente a LIMITED, non a GOOD', () => {
    const p = buildProfile(contestoNuovoUtente(), {
      monthly_income_average: 1800,
      essential_monthly_expenses: 700,
    });
    expect(p.dataConfidence).toBe('LIMITED');
  });
});

describe('risposte manuali', () => {
  test('riempiono un driver assente senza toccare il contesto', () => {
    const contesto = contestoNuovoUtente();
    const p = buildProfile(contesto, {
      monthly_income_average: 2000,
      essential_monthly_expenses: 800,
    });
    expect(p.expensePressure).toBe('LOW');
    expect(p.manualUsed).toEqual(expect.arrayContaining(['essential_monthly_expenses']));
    // La fixture non deve essere stata mutata.
    expect(contesto.expenses.byNecessity.essential.monthlyAverage).toBeNull();
  });

  test('il dato osservato vince su quello dichiarato e lo segnala', () => {
    const p = buildProfile(contestoFinto(), { essential_monthly_expenses: 1500 });
    // Osservato 800 su 2000 = LOW; se avesse vinto il manuale sarebbe HIGH.
    expect(p.expensePressure).toBe('LOW');
    expect(p.manualIgnored).toContain('essential_monthly_expenses');
  });

  test('una risposta non numerica viene ignorata', () => {
    const p = buildProfile(contestoNuovoUtente(), { essential_monthly_expenses: 'abc' });
    expect(p.expensePressure).toBeNull();
    expect(p.manualUsed).not.toContain('essential_monthly_expenses');
  });
});

describe('determinismo', () => {
  test('stesso contesto, stesso profilo', () => {
    const contesto = contestoFinto();
    const primo = buildProfile(contesto);
    for (let i = 0; i < 10; i += 1) {
      expect(buildProfile(contesto)).toEqual(primo);
    }
  });
});
