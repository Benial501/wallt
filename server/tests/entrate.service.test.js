const { riepilogoEntrateDaMovimenti } = require('../services/entrate.service');

describe('riepilogo entrate', () => {
  it('conta i mesi senza movimenti come zero osservato ed esclude i trasferimenti', () => {
    const result = riepilogoEntrateDaMovimenti([
      { tipo: 'entrata', importo: 100, data: '2026-01-10', periodicita_entrata: 'ricorrente' },
      { tipo: 'trasferimento', importo: 500, data: '2026-02-10' },
      { tipo: 'entrata', importo: 50, data: '2026-03-10', periodicita_entrata: 'occasionale' },
    ], { da: '2026-01', a: '2026-03' });
    expect(result.totale).toBe(150);
    expect(result.media_mensile).toBe(50);
    expect(result.mesi.map((m) => m.totale)).toEqual([100, 0, 50]);
    expect(result.quote).toEqual({ ricorrente: 100, occasionale: 50, sconosciuta: 0 });
  });

  it('distingue storico insufficiente da zero osservato e conserva gli sconosciuti', () => {
    const short = riepilogoEntrateDaMovimenti([], { da: '2026-01', a: '2026-02' });
    expect(short.stabilita).toBe('insufficiente');
    const full = riepilogoEntrateDaMovimenti([
      { tipo: 'entrata', importo: 10, data: '2026-01-01' },
    ], { da: '2026-01', a: '2026-03' });
    expect(full.quote.sconosciuta).toBe(10);
    expect(full.mesi.map((m) => m.totale)).toEqual([10, 0, 0]);
    expect(full.stabilita).toBe('variabile');
  });

  it('usa la variabilità della finestra completa e separa natura da periodicità', () => {
    const result = riepilogoEntrateDaMovimenti([
      { tipo: 'entrata', importo: 100, data: '2026-01-01', natura_entrata: 'bonus', periodicita_entrata: 'ricorrente' },
      { tipo: 'entrata', importo: 100, data: '2026-02-01', natura_entrata: 'stipendio', periodicita_entrata: 'ricorrente' },
      { tipo: 'entrata', importo: 100, data: '2026-03-01', natura_entrata: 'vendita', periodicita_entrata: 'ricorrente' },
    ], { da: '2026-01', a: '2026-03' });
    expect(result.variabilita).toBe(0);
    expect(result.stabilita).toBe('stabile');
    expect(result.quote_percentuali.ricorrente).toBe(100);
    expect(riepilogoEntrateDaMovimenti([], { da: '2026-01', a: '2026-03' }).stabilita).toBe('nessuna_entrata');
  });

  it('non chiama zero osservato un mese futuro nel fuso di Roma', () => {
    expect(() => riepilogoEntrateDaMovimenti([], {
      da: '2026-03', a: '2026-04', now: new Date('2026-03-31T21:30:00Z'),
    })).toThrow('futuro');
  });
});
