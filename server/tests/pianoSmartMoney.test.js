/**
 * Primitive monetarie di Piano Smart: conversione in centesimi interi,
 * serializzazione in stringhe decimali e ripartizione al resto maggiore.
 *
 * Nessun database: suite pura, gira anche in `npm run test:unit`.
 */
const {
  toCents, fromCents, isImportoValido, ripartisciCentesimi, percentuale,
} = require('../services/pianoSmart/money');

describe('toCents', () => {
  test('converte stringhe decimali senza perdita', () => {
    expect(toCents('800.00')).toBe(80000);
    expect(toCents('0.01')).toBe(1);
    expect(toCents('1000')).toBe(100000);
    expect(toCents('0')).toBe(0);
    expect(toCents('9999999999.99')).toBe(999999999999);
  });

  test('accetta la virgola come separatore decimale', () => {
    expect(toCents('800,50')).toBe(80050);
  });

  test('un solo decimale non è mezzo centesimo', () => {
    expect(toCents('800.5')).toBe(80050);
  });

  test('converte numeri senza passare per float sporchi', () => {
    // 800.07 * 100 in floating point vale 80006.99999999999: il parser non
    // deve mai fare quella moltiplicazione.
    expect(toCents(800.07)).toBe(80007);
    expect(toCents(0.29)).toBe(29);
    expect(toCents(1.005)).toBeNull();
  });

  test('rifiuta ciò che non è un importo', () => {
    ['', ' ', 'abc', '8e3', '-1', '-0.01', '1.234', 'NaN', 'Infinity', null, undefined, true, [], {}]
      .forEach((valore) => {
        expect(toCents(valore)).toBeNull();
      });
    expect(toCents(NaN)).toBeNull();
    expect(toCents(Infinity)).toBeNull();
    expect(toCents(-Infinity)).toBeNull();
  });

  test('isImportoValido rispecchia toCents', () => {
    expect(isImportoValido('800.00')).toBe(true);
    expect(isImportoValido('1.234')).toBe(false);
    expect(isImportoValido(Infinity)).toBe(false);
  });
});

describe('fromCents', () => {
  test('serializza sempre con due decimali', () => {
    expect(fromCents(80000)).toBe('800.00');
    expect(fromCents(1)).toBe('0.01');
    expect(fromCents(0)).toBe('0.00');
    expect(fromCents(100000)).toBe('1000.00');
    expect(fromCents(80050)).toBe('800.50');
    expect(fromCents(999999999999)).toBe('9999999999.99');
  });

  test('round-trip esatto su tutti i centesimi di un intervallo', () => {
    for (let c = 0; c < 2000; c += 1) {
      expect(toCents(fromCents(c))).toBe(c);
    }
  });

  test('rifiuta ciò che non è un numero intero di centesimi', () => {
    [1.5, NaN, Infinity, -1, null, undefined, '10'].forEach((valore) => {
      expect(() => fromCents(valore)).toThrow();
    });
  });
});

describe('ripartisciCentesimi', () => {
  const ORDINE = ['needs', 'safety', 'goals', 'future', 'freedom'];

  test('la somma è sempre esattamente il totale', () => {
    const pesi = {
      needs: 25, safety: 25, goals: 20, future: 20, freedom: 10,
    };
    [0, 1, 7, 99, 100, 333, 80000, 100001, 999983].forEach((totale) => {
      const esito = ripartisciCentesimi(pesi, totale, ORDINE);
      const somma = ORDINE.reduce((s, k) => s + esito[k], 0);
      expect(somma).toBe(totale);
    });
  });

  test('nessuna quota negativa', () => {
    const esito = ripartisciCentesimi({
      needs: 1, safety: 0, goals: 0, future: 0, freedom: 0,
    }, 7, ORDINE);
    ORDINE.forEach((k) => expect(esito[k]).toBeGreaterThanOrEqual(0));
  });

  test('peso zero riceve zero centesimi', () => {
    const esito = ripartisciCentesimi({
      needs: 25, safety: 25, goals: 0, future: 20, freedom: 10,
    }, 80000, ORDINE);
    expect(esito.goals).toBe(0);
  });

  test('il resto va alle frazioni maggiori, spareggio sull ordine fisso', () => {
    // Tre pesi uguali su 10 centesimi: 3.33 ciascuno, base 3, resto 1.
    // Tutte le frazioni sono identiche, quindi vince la prima nell ordine.
    const esito = ripartisciCentesimi({
      needs: 1, safety: 1, goals: 1, future: 0, freedom: 0,
    }, 10, ORDINE);
    expect(esito).toEqual({
      needs: 4, safety: 3, goals: 3, future: 0, freedom: 0,
    });
  });

  test('è deterministica: stessi input, stesso output', () => {
    const pesi = {
      needs: 31.7, safety: 22.4, goals: 18.9, future: 17.2, freedom: 9.8,
    };
    const primo = ripartisciCentesimi(pesi, 123457, ORDINE);
    for (let i = 0; i < 20; i += 1) {
      expect(ripartisciCentesimi(pesi, 123457, ORDINE)).toEqual(primo);
    }
  });

  test('somma dei pesi zero distribuisce tutto alla prima categoria', () => {
    const esito = ripartisciCentesimi({
      needs: 0, safety: 0, goals: 0, future: 0, freedom: 0,
    }, 500, ORDINE);
    expect(esito.needs).toBe(500);
    expect(ORDINE.reduce((s, k) => s + esito[k], 0)).toBe(500);
  });
});

describe('percentuale', () => {
  test('due decimali sul totale', () => {
    expect(percentuale(25000, 100000)).toBe(25);
    expect(percentuale(33333, 100000)).toBe(33.33);
  });

  test('totale zero non produce una percentuale, produce null', () => {
    expect(percentuale(0, 0)).toBeNull();
  });

  test('la somma delle cinque percentuali resta entro 0.1 da 100', () => {
    const quote = [23456, 23456, 17654, 17654, 17780];
    const totale = quote.reduce((s, v) => s + v, 0);
    const somma = quote.reduce((s, v) => s + percentuale(v, totale), 0);
    expect(Math.abs(somma - 100)).toBeLessThanOrEqual(0.1);
  });
});
