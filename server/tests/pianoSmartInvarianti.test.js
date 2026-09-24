/**
 * Invarianti del motore, verificati in modo esaustivo su molti contesti e
 * molti importi invece che su un caso scelto a mano.
 *
 * L'idea è quella dei property test, senza introdurre una libreria: si genera
 * un insieme deterministico di contesti (tutte le combinazioni di alcune
 * dimensioni) per ogni importo, e su ciascun piano si controllano le
 * proprietà che devono valere SEMPRE. Deterministico anche nella generazione:
 * nessun random, così un fallimento è riproducibile.
 *
 * Copre anche la validazione delle allocazioni finali scelte dall'utente e la
 * completezza delle spiegazioni.
 *
 * Nessun database: suite pura.
 */
const { generaPiano } = require('../services/pianoSmart/allocation.service');
const {
  verificaInvarianti, validaAllocazioniFinali, assertInvariantiMotore,
} = require('../services/pianoSmart/validation.service');
const { spiegaReasonCodes, codiciSenzaSpiegazione, MAX_SPIEGAZIONI } = require('../services/pianoSmart/explanation.service');
const { REASON_CODES } = require('../services/pianoSmart/reasonCodes');
const { contestoFinto, contestoNuovoUtente, obiettivoFinto } = require('./helpers/pianoSmartContesto');

const CATEGORIE = ['needs', 'safety', 'goals', 'future', 'freedom'];

// --- Generazione deterministica dei casi -----------------------------------

const EMERGENZE = [
  { nome: 'assente', over: { emergencyFund: { status: 'assente', coverageMonths: null, missingAmount: null, target: null, targetMonths: null } } },
  { nome: 'critica', over: { emergencyFund: { coverageMonths: 0, current: 0, missingAmount: 2400 } } },
  { nome: 'bassa', over: { emergencyFund: { coverageMonths: 1.5, current: 1200, missingAmount: 1200 } } },
  { nome: 'raggiunta', over: { emergencyFund: { coverageMonths: 3, current: 2400, missingAmount: 0 } } },
  { nome: 'forte', over: { emergencyFund: { coverageMonths: 9, current: 7200, missingAmount: 0 } } },
];

const CASH_FLOW = [
  { nome: 'negativo', over: { cashFlow: { monthlySavings: -250, savingsRate: -0.12 } } },
  { nome: 'nullo', over: { cashFlow: { monthlySavings: 0, savingsRate: 0 } } },
  { nome: 'positivo', over: { cashFlow: { monthlySavings: 500, savingsRate: 0.25 } } },
  { nome: 'ignoto', over: { cashFlow: { monthlySavings: null, savingsRate: null } } },
];

const OBIETTIVI = [
  { nome: 'nessuno', over: { goals: [] } },
  { nome: 'uno piccolo', over: { goals: [obiettivoFinto({ importo_restante: 12 })] } },
  {
    nome: 'due con priorità diverse',
    over: {
      goals: [
        obiettivoFinto({ id: 1, priorita: 'alta', importo_restante: 4000 }),
        obiettivoFinto({ id: 2, priorita: 'bassa', importo_restante: 900 }),
      ],
    },
  },
  {
    nome: 'urgente e completato',
    over: {
      goals: [
        obiettivoFinto({ id: 1, stato: 'scaduto', mesi_rimanenti: 0, scadenza: '2026-05-01', importo_restante: 700 }),
        obiettivoFinto({ id: 2, stato: 'completato', importo_restante: 0 }),
      ],
    },
  },
];

const DEBITI = [
  { nome: 'nessuno', over: {} },
  { nome: 'pressione alta', over: { debts: { totalOutstanding: 50000, totalMonthlyPayments: 1000, debtPressure: 0.5 } } },
  { nome: 'pressione ignota', over: { debts: { totalOutstanding: 8000, totalMonthlyPayments: 300, debtPressure: null } } },
];

const fondi = (...overrides) => overrides.reduce((acc, o) => contestoFinto({ ...acc, ...o }), {});

const casi = [];
EMERGENZE.forEach((e) => CASH_FLOW.forEach((c) => OBIETTIVI.forEach((g) => DEBITI.forEach((d) => {
  casi.push({
    nome: `emergenza ${e.nome} / cash flow ${c.nome} / obiettivi ${g.nome} / debiti ${d.nome}`,
    context: contestoFinto({
      ...e.over, ...c.over, ...g.over, ...d.over,
    }),
  });
}))));
casi.push({ nome: 'nuovo utente senza storico', context: contestoNuovoUtente() });

const IMPORTI = [1, 7, 100, 4999, 50000, 80000, 100000, 123457, 1000000];
const ORIGINI = [
  { sourceType: 'stipendio', sourceRecurring: true },
  { sourceType: 'regalo', sourceRecurring: false },
];

describe('invarianti su tutti i casi generati', () => {
  test(`${casi.length} contesti generati, nessuna sovrapposizione di nome`, () => {
    expect(new Set(casi.map((c) => c.nome)).size).toBe(casi.length);
    expect(casi.length).toBeGreaterThan(100);
  });

  test('la somma delle quote è sempre esattamente il capitale allocabile', () => {
    casi.forEach(({ nome, context }) => {
      IMPORTI.forEach((cents) => {
        ORIGINI.forEach((origine) => {
          const esito = generaPiano({
            incomingCents: cents, mandatoryCents: 0, context, ...origine,
          });
          const somma = esito.allocations.reduce((s, a) => s + a.recommendedCents, 0);
          if (somma !== cents) {
            throw new Error(`${nome} / ${cents} / ${origine.sourceType}: somma ${somma}`);
          }
        });
      });
    });
  });

  test('nessuna quota è mai negativa e sono tutti interi', () => {
    casi.forEach(({ nome, context }) => {
      IMPORTI.forEach((cents) => {
        const esito = generaPiano({
          incomingCents: cents, mandatoryCents: 0, sourceType: 'altro', sourceRecurring: false, context,
        });
        esito.allocations.forEach((a) => {
          if (!Number.isInteger(a.recommendedCents) || a.recommendedCents < 0) {
            throw new Error(`${nome} / ${cents}: ${a.category} = ${a.recommendedCents}`);
          }
        });
      });
    });
  });

  test('le percentuali sommano sempre a 100 entro un decimo', () => {
    casi.forEach(({ nome, context }) => {
      IMPORTI.forEach((cents) => {
        const esito = generaPiano({
          incomingCents: cents, mandatoryCents: 0, sourceType: 'altro', sourceRecurring: false, context,
        });
        const totale = esito.allocations.reduce((s, a) => s + a.recommendedPercentage, 0);
        if (Math.abs(totale - 100) > 0.1) {
          throw new Error(`${nome} / ${cents}: percentuali ${totale}`);
        }
      });
    });
  });

  test('goals non supera mai il restante complessivo degli obiettivi', () => {
    casi.forEach(({ nome, context }) => {
      IMPORTI.forEach((cents) => {
        const esito = generaPiano({
          incomingCents: cents, mandatoryCents: 0, sourceType: 'altro', sourceRecurring: false, context,
        });
        const goals = esito.allocations.find((a) => a.category === 'goals');
        const limite = goals.metadata.totalRemainingCents;
        if (goals.recommendedCents > limite) {
          throw new Error(`${nome} / ${cents}: goals ${goals.recommendedCents} > ${limite}`);
        }
      });
    });
  });

  test('safety non supera mai il gap del fondo quando il cap è applicabile', () => {
    casi.forEach(({ nome, context }) => {
      IMPORTI.forEach((cents) => {
        const esito = generaPiano({
          incomingCents: cents, mandatoryCents: 0, sourceType: 'altro', sourceRecurring: false, context,
        });
        if (esito.caps.safety === null) return;
        const safety = esito.allocations.find((a) => a.category === 'safety');
        if (safety.recommendedCents > esito.caps.safety) {
          throw new Error(`${nome} / ${cents}: safety ${safety.recommendedCents} > ${esito.caps.safety}`);
        }
      });
    });
  });

  test('il breakdown obiettivi somma sempre alla quota goals', () => {
    casi.forEach(({ nome, context }) => {
      IMPORTI.forEach((cents) => {
        const esito = generaPiano({
          incomingCents: cents, mandatoryCents: 0, sourceType: 'altro', sourceRecurring: false, context,
        });
        const goals = esito.allocations.find((a) => a.category === 'goals');
        const dettaglio = goals.metadata.goals;
        if (dettaglio.length === 0) return;
        const somma = dettaglio.reduce((s, g) => s + g.amountCents, 0);
        if (somma !== goals.recommendedCents) {
          throw new Error(`${nome} / ${cents}: obiettivi ${somma} != goals ${goals.recommendedCents}`);
        }
        dettaglio.forEach((g) => {
          if (g.amountCents > g.remainingCents) {
            throw new Error(`${nome} / ${cents}: obiettivo ${g.id} oltre il restante`);
          }
        });
      });
    });
  });

  test('gli investimenti e la liquidità non entrano mai nel capitale allocabile', () => {
    casi.forEach(({ context }) => {
      const esito = generaPiano({
        incomingCents: 80000,
        mandatoryCents: 20000,
        sourceType: 'altro',
        sourceRecurring: false,
        context: contestoFinto({
          ...context,
          investments: {
            totalValue: 99999, liquidValue: 50000, nonLiquidValue: 49999, unknownLiquidityValue: 0,
          },
          liquidity: { total: 88888, ordinary: 80000, specialAccounts: 8888, allocatable: 70000 },
        }),
      });
      expect(esito.allocatableCents).toBe(60000);
    });
  });

  test('ogni piano supera il proprio autocontrollo', () => {
    casi.forEach(({ context }) => {
      IMPORTI.forEach((cents) => {
        const esito = generaPiano({
          incomingCents: cents, mandatoryCents: 0, sourceType: 'altro', sourceRecurring: false, context,
        });
        expect(assertInvariantiMotore(esito)).toBe(true);
      });
    });
  });

  test('stesso input, stesso output su tutti i casi', () => {
    casi.forEach(({ context }) => {
      const primo = generaPiano({
        incomingCents: 80000, mandatoryCents: 0, sourceType: 'regalo', sourceRecurring: false, context,
      });
      const secondo = generaPiano({
        incomingCents: 80000, mandatoryCents: 0, sourceType: 'regalo', sourceRecurring: false, context,
      });
      expect(secondo.allocations).toEqual(primo.allocations);
      expect(secondo.reasonCodes).toEqual(primo.reasonCodes);
    });
  });

  test('ogni reason code emesso ha una spiegazione', () => {
    const emessi = new Set();
    casi.forEach(({ context }) => {
      ORIGINI.forEach((origine) => {
        const esito = generaPiano({
          incomingCents: 80000, mandatoryCents: 0, context, ...origine,
        });
        esito.reasonCodes.forEach((c) => emessi.add(c));
      });
    });
    expect(codiciSenzaSpiegazione([...emessi])).toEqual([]);
    expect(emessi.size).toBeGreaterThan(10);
  });

  test('capitale zero su tutti i casi resta uno stato coerente', () => {
    casi.forEach(({ nome, context }) => {
      const esito = generaPiano({
        incomingCents: 50000, mandatoryCents: 50000, sourceType: 'altro', sourceRecurring: false, context,
      });
      expect(esito.status).toBe('capitale_zero');
      expect(esito.allocations).toHaveLength(5);
      esito.allocations.forEach((a) => {
        expect(a.recommendedCents).toBe(0);
        expect(a.recommendedPercentage).toBeNull();
      });
      expect(esito.reasonCodes).toContain('ZERO_ALLOCATABLE_CAPITAL');
      if (!esito.warnings.length) throw new Error(`${nome}: nessun avviso a capitale zero`);
    });
  });
});

describe('validazione delle allocazioni finali scelte dall utente', () => {
  const allocazioni = (valori) => CATEGORIE.map((category, i) => ({
    category,
    cents: valori[i],
    percentage: valori.reduce((s, v) => s + v, 0) === 0
      ? null
      : Math.round((valori[i] / valori.reduce((s, v) => s + v, 0)) * 10000) / 100,
  }));

  test('totale corretto: valido', () => {
    const esito = validaAllocazioniFinali({
      allocazioni: allocazioni([20000, 30000, 10000, 15000, 5000]),
      allocatableCents: 80000,
    });
    expect(esito).toEqual({ valido: true, errori: [] });
  });

  test('totale troppo alto: rifiutato con il motivo', () => {
    const esito = validaAllocazioniFinali({
      allocazioni: allocazioni([30000, 30000, 10000, 15000, 5000]),
      allocatableCents: 80000,
    });
    expect(esito.valido).toBe(false);
    expect(esito.errori.join(' ')).toMatch(/non coincide/);
  });

  test('totale troppo basso: rifiutato', () => {
    const esito = validaAllocazioniFinali({
      allocazioni: allocazioni([10000, 30000, 10000, 15000, 5000]),
      allocatableCents: 80000,
    });
    expect(esito.valido).toBe(false);
  });

  test('categoria negativa: rifiutata', () => {
    const esito = validaAllocazioniFinali({
      allocazioni: allocazioni([-1000, 31000, 10000, 15000, 5000]),
      allocatableCents: 60000,
    });
    expect(esito.valido).toBe(false);
    expect(esito.errori.join(' ')).toMatch(/negativa/);
  });

  test('centesimi non interi: rifiutati', () => {
    const esito = validaAllocazioniFinali({
      allocazioni: allocazioni([20000.5, 29999.5, 10000, 15000, 5000]),
      allocatableCents: 80000,
    });
    expect(esito.valido).toBe(false);
    expect(esito.errori.join(' ')).toMatch(/intero/);
  });

  test('categoria mancante: rifiutata', () => {
    const esito = validaAllocazioniFinali({
      allocazioni: [{ category: 'needs', cents: 80000, percentage: 100 }],
      allocatableCents: 80000,
    });
    expect(esito.valido).toBe(false);
    expect(esito.errori.join(' ')).toMatch(/mancanti/);
  });

  test('categoria sconosciuta: rifiutata', () => {
    const esito = validaAllocazioniFinali({
      allocazioni: [...allocazioni([20000, 30000, 10000, 15000, 5000]), { category: 'crypto', cents: 0, percentage: 0 }],
      allocatableCents: 80000,
    });
    expect(esito.valido).toBe(false);
    expect(esito.errori.join(' ')).toMatch(/non riconosciute/);
  });

  test('categoria ripetuta: rifiutata', () => {
    const esito = validaAllocazioniFinali({
      allocazioni: [...allocazioni([20000, 30000, 10000, 15000, 5000]), { category: 'needs', cents: 0, percentage: 0 }],
      allocatableCents: 80000,
    });
    expect(esito.valido).toBe(false);
    expect(esito.errori.join(' ')).toMatch(/ripetute/);
  });

  test('il cap vale anche sulle scelte manuali', () => {
    const esito = validaAllocazioniFinali({
      allocazioni: allocazioni([10000, 10000, 50000, 5000, 5000]),
      allocatableCents: 80000,
      caps: { goals: 8000 },
    });
    expect(esito.valido).toBe(false);
    expect(esito.errori.join(' ')).toMatch(/supera il limite/);
  });

  test('capitale zero con quote tutte nulle e percentuali assenti: valido', () => {
    const esito = validaAllocazioniFinali({
      allocazioni: CATEGORIE.map((category) => ({ category, cents: 0, percentage: null })),
      allocatableCents: 0,
    });
    expect(esito.valido).toBe(true);
  });

  test('capitale zero con percentuali a zero invece che assenti: rifiutato', () => {
    const esito = validaAllocazioniFinali({
      allocazioni: CATEGORIE.map((category) => ({ category, cents: 0, percentage: 0 })),
      allocatableCents: 0,
    });
    expect(esito.valido).toBe(false);
    expect(esito.errori.join(' ')).toMatch(/assenti/);
  });
});

describe('spiegazioni', () => {
  test('ogni reason code del vocabolario ha un testo', () => {
    expect(codiciSenzaSpiegazione(REASON_CODES)).toEqual([]);
  });

  test('non superano il massimo previsto per l interfaccia', () => {
    const spiegazioni = spiegaReasonCodes(REASON_CODES);
    expect(spiegazioni.length).toBe(MAX_SPIEGAZIONI);
  });

  test('conservano l ordine di priorità ricevuto', () => {
    const spiegazioni = spiegaReasonCodes(['STABLE_INCOME', 'NEGATIVE_CASH_FLOW'], 2);
    expect(spiegazioni.map((s) => s.code)).toEqual(['STABLE_INCOME', 'NEGATIVE_CASH_FLOW']);
  });

  test('i testi non contengono cifre monetarie', () => {
    Object.values(require('../services/pianoSmart/explanation.service').SPIEGAZIONI)
      .forEach(({ titolo, testo }) => {
        expect(`${titolo} ${testo}`).not.toMatch(/\d+[.,]\d{2}/);
        expect(`${titolo} ${testo}`).not.toMatch(/€/);
      });
  });

  test('nessuna spiegazione nomina strumenti finanziari specifici', () => {
    const vietati = /\b(ETF|azioni|crypto|bitcoin|obbligazioni|fondo comune)\b/i;
    Object.values(require('../services/pianoSmart/explanation.service').SPIEGAZIONI)
      .forEach(({ titolo, testo }) => {
        expect(`${titolo} ${testo}`).not.toMatch(vietati);
      });
  });

  test('un codice sconosciuto viene ignorato, non stampato come sigla', () => {
    expect(spiegaReasonCodes(['CODICE_INVENTATO'])).toEqual([]);
  });
});

describe('verificaInvarianti come funzione pura', () => {
  test('capitale non intero è una violazione dichiarata', () => {
    const errori = verificaInvarianti({ allocazioni: [], allocatableCents: 1.5 });
    expect(errori.length).toBeGreaterThan(0);
  });
});
