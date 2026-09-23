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

// Punto 2 dell'audit: entrate e spese devono trattare il mese corrente allo
// stesso modo. Le spese lo escludono dalle medie da sempre (spese.service.js);
// le entrate esponevano solo `media_mensile` calcolata sull'intera finestra,
// mese in corso compreso, rendendo le due medie non confrontabili.
describe('riepilogo entrate — mese corrente separato dalle medie', () => {
  const now = new Date('2026-09-23T10:00:00Z');
  const movimenti = [
    { tipo: 'entrata', importo: 1000, data: '2026-07-01', periodicita_entrata: 'ricorrente' },
    { tipo: 'entrata', importo: 1000, data: '2026-08-01', periodicita_entrata: 'ricorrente' },
    { tipo: 'entrata', importo: 200, data: '2026-09-02', periodicita_entrata: 'ricorrente' },
  ];

  it('marca come parziale solo il mese corrente', () => {
    const r = riepilogoEntrateDaMovimenti(movimenti, { da: '2026-07', a: '2026-09', now });
    expect(r.mesi.map((m) => m.parziale)).toEqual([false, false, true]);
  });

  it('espone una media sui soli mesi completi, distinta da quella sull\'intera finestra', () => {
    const r = riepilogoEntrateDaMovimenti(movimenti, { da: '2026-07', a: '2026-09', now });
    expect(r.mesi_completi).toBe(2);
    expect(r.media_mensile_mesi_completi).toBe(1000); // (1000 + 1000) / 2
    expect(r.media_mensile).toBe(733.33); // 2200 / 3, invariata per compatibilità
  });

  it('nessun mese completo nella finestra: media sui completi null, non zero', () => {
    const r = riepilogoEntrateDaMovimenti(
      [{ tipo: 'entrata', importo: 200, data: '2026-09-02' }],
      { da: '2026-09', a: '2026-09', now },
    );
    expect(r.mesi_completi).toBe(0);
    expect(r.media_mensile_mesi_completi).toBeNull();
  });

  it('una finestra che finisce prima del mese corrente non ha mesi parziali', () => {
    const r = riepilogoEntrateDaMovimenti(movimenti, { da: '2026-07', a: '2026-08', now });
    expect(r.mesi.map((m) => m.parziale)).toEqual([false, false]);
    expect(r.mesi_completi).toBe(2);
    expect(r.media_mensile_mesi_completi).toBe(1000);
  });
});

describe('riepilogo entrate — quote per mese', () => {
  it('ogni mese porta la propria scomposizione ricorrente/occasionale/sconosciuta', () => {
    const r = riepilogoEntrateDaMovimenti([
      { tipo: 'entrata', importo: 1000, data: '2026-07-01', periodicita_entrata: 'ricorrente' },
      { tipo: 'entrata', importo: 300, data: '2026-07-20', periodicita_entrata: 'occasionale' },
      { tipo: 'entrata', importo: 1000, data: '2026-08-01', periodicita_entrata: 'ricorrente' },
      { tipo: 'entrata', importo: 50, data: '2026-08-10' },
    ], { da: '2026-07', a: '2026-08', now: new Date('2026-09-23T10:00:00Z') });

    expect(r.mesi[0].quote).toEqual({ ricorrente: 1000, occasionale: 300, sconosciuta: 0 });
    expect(r.mesi[1].quote).toEqual({ ricorrente: 1000, occasionale: 0, sconosciuta: 50 });
    // Le quote per mese riconciliano con le quote della finestra.
    expect(r.mesi.reduce((s, m) => s + m.quote.ricorrente, 0)).toBe(r.quote.ricorrente);
    expect(r.mesi.reduce((s, m) => s + m.quote.occasionale, 0)).toBe(r.quote.occasionale);
    expect(r.mesi.reduce((s, m) => s + m.quote.sconosciuta, 0)).toBe(r.quote.sconosciuta);
  });
});
