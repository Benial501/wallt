/**
 * Allocation Engine: la matrice di casi che il motore deve reggere.
 *
 * Le asserzioni sono su *relazioni* e *invarianti*, non su centesimi
 * hardcoded: un test che fissa "safety deve essere 31200" si rompe alla prima
 * taratura dei pesi anche quando il motore è corretto, e non dice niente su
 * ciò che conta davvero (che safety salga quando l'emergenza è critica).
 *
 * Nessun database: suite pura.
 */
const { generaPiano } = require('../services/pianoSmart/allocation.service');
const { contestoFinto, contestoNuovoUtente, obiettivoFinto } = require('./helpers/pianoSmartContesto');

const CATEGORIE = ['needs', 'safety', 'goals', 'future', 'freedom'];

const piano = (over = {}) => generaPiano({
  incomingCents: 80000,
  mandatoryCents: 0,
  sourceType: 'regalo',
  sourceRecurring: false,
  context: contestoFinto(),
  ...over,
});

const quote = (esito) => Object.fromEntries(
  esito.allocations.map((a) => [a.category, a.recommendedCents]),
);
const somma = (esito) => esito.allocations.reduce((s, a) => s + a.recommendedCents, 0);
const frazione = (esito, categoria) => quote(esito)[categoria] / esito.allocatableCents;

describe('capitale allocabile', () => {
  test('capitale = entrata meno spese obbligatorie', () => {
    const esito = piano({ incomingCents: 100000, mandatoryCents: 40000 });
    expect(esito.allocatableCents).toBe(60000);
    expect(somma(esito)).toBe(60000);
  });

  test('spese obbligatorie pari all entrata azzerano il capitale', () => {
    const esito = piano({ incomingCents: 50000, mandatoryCents: 50000 });
    expect(esito.allocatableCents).toBe(0);
    expect(esito.status).toBe('capitale_zero');
  });

  test('spese obbligatorie maggiori dell entrata non producono un negativo', () => {
    const esito = piano({ incomingCents: 50000, mandatoryCents: 90000 });
    expect(esito.allocatableCents).toBe(0);
    expect(esito.status).toBe('capitale_zero');
  });

  test('a capitale zero le cinque categorie esistono, valgono zero e senza percentuali', () => {
    const esito = piano({ incomingCents: 50000, mandatoryCents: 50000 });
    expect(esito.allocations.map((a) => a.category)).toEqual(CATEGORIE);
    esito.allocations.forEach((a) => {
      expect(a.recommendedCents).toBe(0);
      expect(a.recommendedPercentage).toBeNull();
    });
    expect(esito.reasonCodes).toContain('ZERO_ALLOCATABLE_CAPITAL');
  });

  test('gli investimenti esistenti non aumentano il capitale allocabile', () => {
    const conInvestimenti = piano({
      context: contestoFinto({
        investments: {
          totalValue: 50000, liquidValue: 50000, nonLiquidValue: 0, unknownLiquidityValue: 0,
        },
      }),
    });
    expect(conInvestimenti.allocatableCents).toBe(80000);
  });

  test('il saldo dei conti non aumenta il capitale allocabile', () => {
    const esito = piano({ context: contestoFinto({ liquidity: { total: 999999, allocatable: 999999 } }) });
    expect(esito.allocatableCents).toBe(80000);
  });
});

describe('importi diversi', () => {
  test.each([
    ['regalo da 800', 80000, 'regalo', false],
    ['stipendio da 1000', 100000, 'stipendio', true],
    ['bonus da 500', 50000, 'bonus', false],
    ['somma minima da 1', 100, 'altro', false],
    ['somma grande da 10000', 1000000, 'vendita', false],
    ['un solo centesimo', 1, 'altro', false],
  ])('%s: la somma resta esatta e nessuna quota è negativa', (_nome, cents, sourceType, ricorrente) => {
    const esito = piano({ incomingCents: cents, sourceType, sourceRecurring: ricorrente });
    expect(somma(esito)).toBe(cents);
    esito.allocations.forEach((a) => expect(a.recommendedCents).toBeGreaterThanOrEqual(0));
  });

  test('un solo centesimo va tutto a una categoria, non frazionato', () => {
    const esito = piano({ incomingCents: 1 });
    const conQualcosa = esito.allocations.filter((a) => a.recommendedCents > 0);
    expect(conQualcosa).toHaveLength(1);
  });
});

describe('fondo di sicurezza', () => {
  test('copertura zero: safety sale e future/freedom scendono', () => {
    const critico = piano({ context: contestoFinto({ emergencyFund: { coverageMonths: 0, current: 0, missingAmount: 2400 } }) });
    const normale = piano({ context: contestoFinto({ emergencyFund: { coverageMonths: 2, current: 1600, missingAmount: 800 } }) });
    expect(frazione(critico, 'safety')).toBeGreaterThan(frazione(normale, 'safety'));
    expect(frazione(critico, 'future')).toBeLessThan(frazione(normale, 'future'));
    expect(frazione(critico, 'freedom')).toBeLessThan(frazione(normale, 'freedom'));
    expect(critico.reasonCodes).toContain('LOW_EMERGENCY_BUFFER');
  });

  test('mezzo mese di copertura è critico', () => {
    const esito = piano({ context: contestoFinto({ emergencyFund: { coverageMonths: 0.5, current: 400, missingAmount: 2000 } }) });
    expect(esito.profile.emergencyCoverage).toBe('CRITICAL');
    expect(esito.reasonCodes).toContain('LOW_EMERGENCY_BUFFER');
  });

  test('target raggiunto: safety azzerata dal cap e il resto redistribuito', () => {
    const esito = piano({
      context: contestoFinto({
        emergencyFund: {
          coverageMonths: 3, current: 2400, target: 2400, missingAmount: 0,
        },
      }),
    });
    expect(quote(esito).safety).toBe(0);
    expect(somma(esito)).toBe(esito.allocatableCents);
    expect(esito.reasonCodes).toContain('EMERGENCY_TARGET_REACHED');
    expect(esito.reasonCodes).toContain('SAFETY_CAP_REACHED');
  });

  test('target superato: safety resta a zero', () => {
    const esito = piano({
      context: contestoFinto({
        emergencyFund: {
          coverageMonths: 8, current: 6400, target: 2400, missingAmount: 0,
        },
      }),
    });
    expect(quote(esito).safety).toBe(0);
    expect(somma(esito)).toBe(esito.allocatableCents);
  });

  test('safety non supera mai il gap del fondo', () => {
    const esito = piano({
      incomingCents: 500000,
      context: contestoFinto({
        emergencyFund: {
          coverageMonths: 0.2, current: 200, target: 2400, missingAmount: 1000,
        },
      }),
    });
    expect(quote(esito).safety).toBeLessThanOrEqual(100000);
    expect(somma(esito)).toBe(esito.allocatableCents);
  });

  test('senza fondo definito safety non ha cap e lo dichiara', () => {
    const esito = piano({ context: contestoNuovoUtente() });
    expect(esito.reasonCodes).toContain('NO_EMERGENCY_FUND_DEFINED');
    expect(esito.caps.safety).toBeNull();
    expect(quote(esito).safety).toBeGreaterThan(0);
  });
});

describe('cash flow', () => {
  test('negativo: needs e safety salgono, future e freedom scendono molto', () => {
    const negativo = piano({ context: contestoFinto({ cashFlow: { monthlySavings: -300, savingsRate: -0.15 } }) });
    const positivo = piano();
    expect(frazione(negativo, 'needs')).toBeGreaterThan(frazione(positivo, 'needs'));
    expect(frazione(negativo, 'future')).toBeLessThan(frazione(positivo, 'future'));
    expect(frazione(negativo, 'freedom')).toBeLessThan(frazione(positivo, 'freedom'));
    expect(negativo.reasonCodes).toContain('NEGATIVE_CASH_FLOW');
  });

  test('cash flow a zero non è negativo ma non è nemmeno capacità alta', () => {
    const esito = piano({ context: contestoFinto({ cashFlow: { monthlySavings: 0, savingsRate: 0 } }) });
    expect(esito.profile.savingsCapacity).toBe('LOW');
    expect(esito.reasonCodes).toContain('LOW_SAVINGS_CAPACITY');
    expect(esito.reasonCodes).not.toContain('NEGATIVE_CASH_FLOW');
  });

  test('capacità di risparmio alta apre a future e goals', () => {
    const alta = piano();
    const media = piano({ context: contestoFinto({ cashFlow: { monthlySavings: 200, savingsRate: 0.1 } }) });
    expect(frazione(alta, 'future')).toBeGreaterThan(frazione(media, 'future'));
    expect(alta.reasonCodes).toContain('HIGH_SAVINGS_CAPACITY');
  });

  test('freedom non scende a zero nemmeno col cash flow negativo', () => {
    const esito = piano({
      context: contestoFinto({
        cashFlow: { monthlySavings: -500, savingsRate: -0.3 },
        emergencyFund: { coverageMonths: 0, current: 0, missingAmount: 2400 },
        debts: { totalOutstanding: 40000, totalMonthlyPayments: 1000, debtPressure: 0.5 },
        expenses: { byNecessity: { essential: { monthlyAverage: 1800 } } },
      }),
    });
    expect(quote(esito).freedom).toBeGreaterThan(0);
  });
});

describe('reddito', () => {
  test('reddito instabile è più prudente di quello stabile', () => {
    const instabile = piano({ context: contestoFinto({ income: { stability: 'variabile' } }) });
    const stabile = piano();
    expect(frazione(instabile, 'safety')).toBeGreaterThan(frazione(stabile, 'safety'));
    expect(frazione(instabile, 'future')).toBeLessThan(frazione(stabile, 'future'));
    expect(instabile.reasonCodes).toContain('UNSTABLE_INCOME');
    expect(stabile.reasonCodes).toContain('STABLE_INCOME');
  });

  test('senza storico di reddito non si dichiara stabilità', () => {
    const esito = piano({ context: contestoNuovoUtente() });
    expect(esito.reasonCodes).not.toContain('STABLE_INCOME');
    expect(esito.reasonCodes).toContain('INSUFFICIENT_HISTORY');
  });
});

describe('tipo di entrata', () => {
  test('una somma ricorrente pesa più su needs di una occasionale', () => {
    const stipendio = piano({ sourceType: 'stipendio', sourceRecurring: true });
    const regalo = piano({ sourceType: 'regalo', sourceRecurring: false });
    expect(frazione(stipendio, 'needs')).toBeGreaterThan(frazione(regalo, 'needs'));
    expect(stipendio.reasonCodes).toContain('RECURRING_INCOME');
    expect(regalo.reasonCodes).toContain('EXTRA_INCOME');
  });

  test('una somma occasionale favorisce sicurezza, obiettivi e futuro', () => {
    const regalo = piano({ sourceType: 'regalo', sourceRecurring: false });
    const stipendio = piano({ sourceType: 'stipendio', sourceRecurring: true });
    expect(frazione(regalo, 'safety')).toBeGreaterThan(frazione(stipendio, 'safety'));
    expect(frazione(regalo, 'future')).toBeGreaterThan(frazione(stipendio, 'future'));
  });

  test('una somma occasionale non azzera freedom', () => {
    expect(quote(piano({ sourceRecurring: false })).freedom).toBeGreaterThan(0);
  });
});

describe('obiettivi', () => {
  test('nessun obiettivo: goals a zero e redistribuzione, somma invariata', () => {
    const esito = piano({ context: contestoFinto({ goals: [] }) });
    expect(quote(esito).goals).toBe(0);
    expect(somma(esito)).toBe(esito.allocatableCents);
    expect(esito.reasonCodes).toContain('NO_ACTIVE_GOALS');
  });

  test('obiettivi completati non ricevono fondi', () => {
    const esito = piano({
      context: contestoFinto({
        goals: [obiettivoFinto({ stato: 'completato', importo_restante: 0, importo_attuale: 2000 })],
      }),
    });
    expect(quote(esito).goals).toBe(0);
    expect(esito.reasonCodes).toContain('NO_ACTIVE_GOALS');
  });

  test('goals non supera mai il restante complessivo degli obiettivi', () => {
    const esito = piano({
      incomingCents: 100000,
      context: contestoFinto({
        goals: [obiettivoFinto({ importo_target: 100, importo_attuale: 20, importo_restante: 80 })],
      }),
    });
    expect(quote(esito).goals).toBeLessThanOrEqual(8000);
    expect(somma(esito)).toBe(esito.allocatableCents);
    expect(esito.reasonCodes).toContain('GOALS_CAP_REACHED');
  });

  test('un obiettivo urgente riceve più di uno senza scadenza', () => {
    const urgente = piano({
      context: contestoFinto({
        goals: [obiettivoFinto({ stato: 'in_corso', mesi_rimanenti: 2, scadenza: '2026-11-30', contributo_mensile_richiesto: 750 })],
      }),
    });
    const tranquillo = piano();
    expect(frazione(urgente, 'goals')).toBeGreaterThan(frazione(tranquillo, 'goals'));
    expect(urgente.reasonCodes).toContain('GOAL_DEADLINE_APPROACHING');
  });

  test('obiettivo scaduto alza la pressione', () => {
    const esito = piano({
      context: contestoFinto({
        goals: [obiettivoFinto({ stato: 'scaduto', mesi_rimanenti: 0, scadenza: '2026-07-01' })],
      }),
    });
    expect(esito.profile.goalPressure).toBe('HIGH');
  });

  test('più obiettivi: breakdown coerente, somma pari alla quota goals', () => {
    const esito = piano({
      incomingCents: 200000,
      context: contestoFinto({
        goals: [
          obiettivoFinto({
            id: 1, nome: 'Auto', priorita: 'alta', importo_restante: 5000, stato: 'in_corso', mesi_rimanenti: 4, scadenza: '2027-01-31',
          }),
          obiettivoFinto({
            id: 2, nome: 'Viaggio', priorita: 'bassa', importo_restante: 1200, stato: 'senza_scadenza',
          }),
          obiettivoFinto({
            id: 3, nome: 'Fatto', stato: 'completato', importo_restante: 0,
          }),
        ],
      }),
    });
    const goalsAlloc = esito.allocations.find((a) => a.category === 'goals');
    const dettaglio = goalsAlloc.metadata.goals;
    expect(dettaglio.map((g) => g.id).sort()).toEqual([1, 2]);
    expect(dettaglio.reduce((s, g) => s + g.amountCents, 0)).toBe(goalsAlloc.recommendedCents);
    dettaglio.forEach((g) => expect(g.amountCents).toBeLessThanOrEqual(g.remainingCents));
  });

  test('la priorità alta pesa più della bassa a pari condizioni', () => {
    const esito = piano({
      incomingCents: 100000,
      context: contestoFinto({
        goals: [
          obiettivoFinto({ id: 1, nome: 'Alta', priorita: 'alta', importo_restante: 3000 }),
          obiettivoFinto({ id: 2, nome: 'Bassa', priorita: 'bassa', importo_restante: 3000 }),
        ],
      }),
    });
    const dettaglio = esito.allocations.find((a) => a.category === 'goals').metadata.goals;
    const alta = dettaglio.find((g) => g.id === 1);
    const bassa = dettaglio.find((g) => g.id === 2);
    expect(alta.amountCents).toBeGreaterThan(bassa.amountCents);
  });

  test('il fondo riceve solo dalla sua categoria: fra gli obiettivi non c\'è', () => {
    // Il fondo non può comparire fra gli obiettivi: da settembre 2026 è un
    // conto (services/fondoEmergenza.service.js), non un obiettivo. Prima lo
    // era, e andava escluso a mano da `goals`, altrimenti riceveva denaro da
    // due categorie — `safety` più la quota obiettivi — e il totale diretto al
    // fondo poteva superare quello che gli mancava davvero. L'invariante resta
    // e qui si verifica che valga: solo gli obiettivi veri entrano in `goals`.
    const esito = piano({
      incomingCents: 1000000,
      context: contestoFinto({
        emergencyFund: {
          coverageMonths: 1, current: 900, target: 3300, targetMonths: 4, missingAmount: 2400,
        },
        goals: [
          obiettivoFinto({ id: 2, nome: 'Viaggio', importo_restante: 1500 }),
        ],
      }),
    });
    const dettaglio = esito.allocations.find((a) => a.category === 'goals').metadata.goals;
    expect(dettaglio.map((g) => g.id)).toEqual([2]);
    expect(quote(esito).safety).toBeLessThanOrEqual(240000);
  });

  test('senza obiettivi eleggibili la quota obiettivi è zero', () => {
    const esito = piano({
      context: contestoFinto({
        goals: [obiettivoFinto({ stato: 'completato', importo_restante: 0 })],
      }),
    });
    expect(quote(esito).goals).toBe(0);
    expect(esito.reasonCodes).toContain('NO_ACTIVE_GOALS');
    expect(somma(esito)).toBe(esito.allocatableCents);
  });

  test('il totale diretto al fondo non supera mai il suo gap', () => {
    const esito = piano({
      incomingCents: 1000000,
      context: contestoFinto({
        emergencyFund: {
          coverageMonths: 1, current: 900, target: 3300, targetMonths: 4, missingAmount: 2400,
        },
        goals: [
          obiettivoFinto({ id: 2, nome: 'Viaggio', importo_restante: 1500 }),
        ],
      }),
    });
    const safety = quote(esito).safety;
    const dettaglio = esito.allocations.find((a) => a.category === 'goals').metadata.goals;
    const alFondoDaiGoals = dettaglio
      .filter((g) => g.nome === 'Fondo')
      .reduce((s, g) => s + g.amountCents, 0);
    expect(safety + alFondoDaiGoals).toBeLessThanOrEqual(240000);
  });

  test('obiettivo con dati mancanti non è eleggibile', () => {
    const esito = piano({
      context: contestoFinto({
        goals: [obiettivoFinto({ stato: 'dati_mancanti', importo_restante: null })],
      }),
    });
    expect(quote(esito).goals).toBe(0);
  });

  test('un obiettivo dietro al programma viene segnalato', () => {
    const esito = piano({
      context: contestoFinto({
        goals: [obiettivoFinto({ stato: 'in_corso', mesi_rimanenti: 2, scadenza: '2026-11-30', contributo_mensile_richiesto: 900 })],
      }),
    });
    expect(esito.reasonCodes).toContain('GOAL_BEHIND_SCHEDULE');
  });

  test('un obiettivo largamente in anticipo viene segnalato', () => {
    const esito = piano({
      context: contestoFinto({
        goals: [obiettivoFinto({ stato: 'in_corso', mesi_rimanenti: 10, scadenza: '2027-07-31', contributo_mensile_richiesto: 50 })],
      }),
    });
    expect(esito.reasonCodes).toContain('GOAL_AHEAD_OF_SCHEDULE');
  });
});

describe('debiti', () => {
  test('pressione alta rende il piano più prudente', () => {
    const indebitato = piano({
      context: contestoFinto({
        debts: { totalOutstanding: 40000, totalMonthlyPayments: 900, debtPressure: 0.45 },
      }),
    });
    const libero = piano();
    expect(frazione(indebitato, 'needs')).toBeGreaterThan(frazione(libero, 'needs'));
    expect(frazione(indebitato, 'safety')).toBeGreaterThan(frazione(libero, 'safety'));
    expect(frazione(indebitato, 'future')).toBeLessThan(frazione(libero, 'future'));
    expect(frazione(indebitato, 'freedom')).toBeLessThan(frazione(libero, 'freedom'));
    expect(indebitato.reasonCodes).toContain('HIGH_DEBT_PRESSURE');
  });

  test('pressione bassa non cambia nulla rispetto a nessun debito', () => {
    const basso = piano({
      context: contestoFinto({
        debts: { totalOutstanding: 3000, totalMonthlyPayments: 150, debtPressure: 0.075 },
      }),
    });
    expect(quote(basso)).toEqual(quote(piano()));
  });

  test('non propone mai di usare tutto per il debito: nessuna categoria prende tutto', () => {
    const esito = piano({
      context: contestoFinto({
        debts: { totalOutstanding: 90000, totalMonthlyPayments: 1800, debtPressure: 0.9 },
      }),
    });
    esito.allocations.forEach((a) => {
      expect(a.recommendedCents).toBeLessThan(esito.allocatableCents);
    });
  });

  test('debito con reddito ignoto non applica il modificatore', () => {
    const esito = piano({
      context: contestoFinto({
        debts: { totalOutstanding: 20000, totalMonthlyPayments: 500, debtPressure: null },
      }),
    });
    expect(esito.profile.debtPressure).toBeNull();
    expect(esito.reasonCodes).not.toContain('HIGH_DEBT_PRESSURE');
  });
});

describe('investimenti e conti speciali', () => {
  test('investimenti illiquidi vengono dichiarati esclusi', () => {
    const esito = piano({
      context: contestoFinto({
        investments: {
          totalValue: 10000, liquidValue: 2000, nonLiquidValue: 8000, unknownLiquidityValue: 0,
        },
      }),
    });
    expect(esito.reasonCodes).toContain('ILLIQUID_INVESTMENTS_EXCLUDED');
  });

  test('liquidabilità sconosciuta è trattata come esclusa', () => {
    const esito = piano({
      context: contestoFinto({
        investments: {
          totalValue: 5000, liquidValue: 0, nonLiquidValue: 0, unknownLiquidityValue: 5000,
        },
      }),
    });
    expect(esito.reasonCodes).toContain('ILLIQUID_INVESTMENTS_EXCLUDED');
  });

  test('investimenti tutti liquidi non generano l avviso', () => {
    const esito = piano({
      context: contestoFinto({
        investments: {
          totalValue: 5000, liquidValue: 5000, nonLiquidValue: 0, unknownLiquidityValue: 0,
        },
      }),
    });
    expect(esito.reasonCodes).not.toContain('ILLIQUID_INVESTMENTS_EXCLUDED');
  });

  test('un conto scommesse non diventa liquidità disponibile', () => {
    const esito = piano({
      context: contestoFinto({
        liquidity: {
          total: 3500, ordinary: 3000, specialAccounts: 500, allocatable: 2500,
        },
      }),
    });
    expect(esito.reasonCodes).toContain('SPECIAL_ACCOUNT_LIQUIDITY_EXCLUDED');
    expect(esito.allocatableCents).toBe(80000);
  });

  test('senza conti speciali nessun avviso', () => {
    expect(piano().reasonCodes).not.toContain('SPECIAL_ACCOUNT_LIQUIDITY_EXCLUDED');
  });
});

describe('qualità dei dati', () => {
  test('un nuovo utente riceve comunque un piano completo', () => {
    const esito = piano({ context: contestoNuovoUtente() });
    expect(esito.allocations).toHaveLength(5);
    expect(somma(esito)).toBe(80000);
    expect(esito.profile.dataConfidence).toBe('INSUFFICIENT');
    expect(esito.reasonCodes).toContain('INSUFFICIENT_HISTORY');
  });

  test('meno dati, più prudenza su safety', () => {
    const scarso = piano({ context: contestoNuovoUtente() });
    const pieno = piano();
    expect(frazione(scarso, 'safety')).toBeGreaterThan(frazione(pieno, 'safety'));
  });

  test('storico limitato produce un avviso', () => {
    const esito = piano({
      context: contestoFinto({
        dataQuality: { completeMonths: 1, hasSufficientHistory: false },
      }),
    });
    expect(esito.warnings.length).toBeGreaterThan(0);
    expect(esito.reasonCodes).toContain('INSUFFICIENT_HISTORY');
  });

  test('le risposte manuali vengono dichiarate', () => {
    const esito = piano({
      context: contestoNuovoUtente(),
      manualAnswers: { essential_monthly_expenses: 700, monthly_income_average: 1600 },
    });
    expect(esito.reasonCodes).toContain('MANUAL_CONTEXT_USED');
  });
});

describe('andamento delle spese', () => {
  test('un aumento marcato viene rilevato', () => {
    const esito = piano({
      context: contestoFinto({
        expenses: {
          history: [
            { mese: '2026-06', totale: 1000, parziale: false },
            { mese: '2026-07', totale: 1000, parziale: false },
            { mese: '2026-08', totale: 1600, parziale: false },
            { mese: '2026-09', totale: 400, parziale: true },
          ],
        },
      }),
    });
    expect(esito.reasonCodes).toContain('SPENDING_INCREASE');
  });

  test('una diminuzione marcata viene rilevata', () => {
    const esito = piano({
      context: contestoFinto({
        expenses: {
          history: [
            { mese: '2026-06', totale: 1500, parziale: false },
            { mese: '2026-07', totale: 1500, parziale: false },
            { mese: '2026-08', totale: 900, parziale: false },
            { mese: '2026-09', totale: 400, parziale: true },
          ],
        },
      }),
    });
    expect(esito.reasonCodes).toContain('SPENDING_DECREASE');
  });

  test('spese stabili non generano nessuno dei due codici', () => {
    const esito = piano();
    expect(esito.reasonCodes).not.toContain('SPENDING_INCREASE');
    expect(esito.reasonCodes).not.toContain('SPENDING_DECREASE');
  });

  test('con un solo mese completo non si dichiara una tendenza', () => {
    const esito = piano({
      context: contestoFinto({
        expenses: {
          history: [
            { mese: '2026-08', totale: 1500, parziale: false },
            { mese: '2026-09', totale: 400, parziale: true },
          ],
        },
      }),
    });
    expect(esito.reasonCodes).not.toContain('SPENDING_INCREASE');
    expect(esito.reasonCodes).not.toContain('SPENDING_DECREASE');
  });
});

describe('redistribuzione', () => {
  test('cap su goals e safety insieme: la somma resta esatta', () => {
    const esito = piano({
      incomingCents: 300000,
      context: contestoFinto({
        emergencyFund: {
          coverageMonths: 2.5, current: 2000, target: 2400, missingAmount: 400,
        },
        goals: [obiettivoFinto({ importo_restante: 150 })],
      }),
    });
    expect(somma(esito)).toBe(300000);
    expect(quote(esito).safety).toBeLessThanOrEqual(40000);
    expect(quote(esito).goals).toBeLessThanOrEqual(15000);
    expect(esito.reasonCodes).toContain('SAFETY_CAP_REACHED');
    expect(esito.reasonCodes).toContain('GOALS_CAP_REACHED');
  });

  test('entrambi i cap a zero: tutto va alle categorie senza cap', () => {
    const esito = piano({
      context: contestoFinto({
        emergencyFund: {
          coverageMonths: 4, current: 2400, target: 2400, missingAmount: 0,
        },
        goals: [],
      }),
    });
    const q = quote(esito);
    expect(q.safety).toBe(0);
    expect(q.goals).toBe(0);
    expect(q.needs + q.future + q.freedom).toBe(esito.allocatableCents);
  });

  test('la redistribuzione non lascia centesimi per strada', () => {
    for (let cents = 997; cents <= 1013; cents += 1) {
      const esito = piano({
        incomingCents: cents,
        context: contestoFinto({
          emergencyFund: { coverageMonths: 3, current: 2400, target: 2400, missingAmount: 0 },
          goals: [obiettivoFinto({ importo_restante: 1 })],
        }),
      });
      expect(somma(esito)).toBe(cents);
    }
  });
});

describe('determinismo', () => {
  test('stesso contesto e stesso input, stesso piano', () => {
    const contesto = contestoFinto();
    const primo = piano({ context: contesto });
    for (let i = 0; i < 15; i += 1) {
      const altro = piano({ context: contesto });
      expect(quote(altro)).toEqual(quote(primo));
      expect(altro.reasonCodes).toEqual(primo.reasonCodes);
    }
  });

  test('il contesto in ingresso non viene mutato', () => {
    const contesto = contestoFinto();
    const copia = JSON.parse(JSON.stringify(contesto));
    piano({ context: contesto });
    expect(contesto).toEqual(copia);
  });

  test('la versione del motore è dichiarata', () => {
    expect(piano().engineVersion).toBe('smart-v1');
  });
});

describe('percentuali', () => {
  test('sommano a 100 entro il decimo', () => {
    const esito = piano({ incomingCents: 123457 });
    const totale = esito.allocations.reduce((s, a) => s + a.recommendedPercentage, 0);
    expect(Math.abs(totale - 100)).toBeLessThanOrEqual(0.1);
  });

  test('le cinque categorie ci sono sempre e nell ordine fisso', () => {
    expect(piano().allocations.map((a) => a.category)).toEqual(CATEGORIE);
  });
});

describe('input non validi', () => {
  test('centesimi non interi vengono rifiutati', () => {
    expect(() => piano({ incomingCents: 800.5 })).toThrow();
  });

  test('centesimi negativi vengono rifiutati', () => {
    expect(() => piano({ incomingCents: -100 })).toThrow();
    expect(() => piano({ mandatoryCents: -1 })).toThrow();
  });

  test('NaN e Infinity vengono rifiutati', () => {
    expect(() => piano({ incomingCents: NaN })).toThrow();
    expect(() => piano({ incomingCents: Infinity })).toThrow();
  });

  test('entrata a zero viene rifiutata: non c è niente da pianificare', () => {
    expect(() => piano({ incomingCents: 0 })).toThrow();
  });

  test('un contesto assente viene rifiutato', () => {
    expect(() => piano({ context: null })).toThrow();
  });
});
