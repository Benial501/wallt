const {
  calcolaStatsMovimenti,
} = require('../services/scommesseStats.service');

const mov = (tipo, importo) => ({ tipo, importo });

describe('Statistiche scommesse', () => {
  test('un deposito non è una perdita: il risultato di gioco resta zero', () => {
    const stats = calcolaStatsMovimenti([mov('deposito', 11)]);

    expect(stats.totale_depositato).toBe(11);
    expect(stats.risultato_gioco).toBe(0);
    expect(stats.bilancio).toBe(0);
    expect(stats.roi_percentuale).toBe(0);
  });

  test('deposito 11 e perdita 11 valgono una perdita netta di 11, non 22', () => {
    const stats = calcolaStatsMovimenti([mov('deposito', 11), mov('perdita', 11)]);

    expect(stats.risultato_gioco).toBe(-11);
    expect(stats.bilancio).toBe(-11);
    expect(stats.roi_percentuale).toBe(-100);
  });

  test('un prelievo non è una vincita', () => {
    const stats = calcolaStatsMovimenti([
      mov('deposito', 100),
      mov('vincita', 30),
      mov('prelievo', 130),
    ]);

    expect(stats.risultato_gioco).toBe(30);
    expect(stats.bilancio).toBe(30);
    expect(stats.saldo_trasferimenti).toBe(30);
    expect(stats.roi_percentuale).toBe(30);
  });

  test('vincite e perdite si compensano', () => {
    const stats = calcolaStatsMovimenti([
      mov('deposito', 50),
      mov('perdita', 20),
      mov('vincita', 35),
      mov('perdita', 15),
    ]);

    expect(stats.totale_vincite).toBe(35);
    expect(stats.totale_perdite).toBe(35);
    expect(stats.risultato_gioco).toBe(0);
  });

  test('senza depositi il ROI è zero e non NaN', () => {
    const stats = calcolaStatsMovimenti([mov('vincita', 10)]);

    expect(stats.roi_percentuale).toBe(0);
    expect(stats.risultato_gioco).toBe(10);
  });

  test('gli importi arrivano come stringhe decimali dal database', () => {
    const stats = calcolaStatsMovimenti([
      { tipo: 'deposito', importo: '11.00' },
      { tipo: 'perdita', importo: '5.50' },
    ]);

    expect(stats.totale_depositato).toBe(11);
    expect(stats.risultato_gioco).toBe(-5.5);
  });

  test('somma di più piattaforme: i totali restano coerenti', () => {
    const a = calcolaStatsMovimenti([mov('deposito', 10), mov('perdita', 10)]);
    const b = calcolaStatsMovimenti([mov('deposito', 20), mov('vincita', 5)]);

    expect(a.risultato_gioco + b.risultato_gioco).toBe(-5);
  });
});
