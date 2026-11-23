// Modello di budget consigliato e obiettivi per voce: funzioni pure, girano
// anche in `npm run test:unit` senza database.
const {
  consigliaModello, percentualiDelPiano, obiettiviInCentesimi,
} = require('../services/budgetModello');
const { calcolaSpeseFisse } = require('../utils/speseFisse');

describe('calcolaSpeseFisse', () => {
  it('somma casa, bollette divise a metà, trasporti ed extra', () => {
    expect(calcolaSpeseFisse({
      situazione_abitativa: 'affitto', costo_abitazione: '600.00', paga_bollette: 'divise',
      stima_bollette: '100', ha_auto: true, spesa_benzina: '80', spese_fisse_extra: '20',
    })).toBe(750);
  });

  it('chi vive con i genitori non conta il costo della casa', () => {
    expect(calcolaSpeseFisse({ situazione_abitativa: 'vivo_con_genitori', costo_abitazione: 500 })).toBe(0);
  });
});

describe('consigliaModello', () => {
  it('chi vive con i genitori riceve Risparmio deciso', () => {
    expect(consigliaModello({ situazione_abitativa: 'vivo_con_genitori', entrata_mensile: 1200 }).modello).toBe('risparmio_deciso');
  });

  it('spese fisse oltre il 40% → Spese fisse alte', () => {
    const r = consigliaModello({
      situazione_abitativa: 'affitto', costo_abitazione: 700, paga_bollette: 'tutte', stima_bollette: 110, entrata_mensile: 2000,
    });
    expect(r.modello).toBe('spese_fisse_alte');
    expect(r.percentuali).toEqual({ bisogni: 70, desideri: 20, futuro: 10 });
    expect(r.motivo).toEqual({ codice: 'spese_fisse_alte', quota_spese_fisse: 0.41 });
  });

  it('esattamente il 40% resta Equilibrato', () => {
    const r = consigliaModello({ situazione_abitativa: 'affitto', costo_abitazione: 800, entrata_mensile: 2000 });
    expect(r.modello).toBe('equilibrato');
    expect(r.motivo).toEqual({ codice: 'equilibrato', quota_spese_fisse: 0.4 });
  });

  it('senza entrata consiglia Equilibrato senza quota', () => {
    expect(consigliaModello({ entrata_mensile: null }).motivo).toEqual({ codice: 'senza_entrata', quota_spese_fisse: null });
    expect(consigliaModello(null).modello).toBe('equilibrato');
  });
});

describe('obiettiviInCentesimi', () => {
  it('2.000 € con 50/30/20', () => {
    expect(obiettiviInCentesimi({ bisogni: 50, desideri: 30, futuro: 20 }, 2000))
      .toEqual({ bisogni: 100000, desideri: 60000, futuro: 40000 });
  });

  it('1.000,01 € somma esattamente', () => {
    const o = obiettiviInCentesimi({ bisogni: 50, desideri: 30, futuro: 20 }, 1000.01);
    expect(o.bisogni + o.desideri + o.futuro).toBe(100001);
    expect(o).toEqual({ bisogni: 50001, desideri: 30000, futuro: 20000 });
  });

  it('accetta l’entrata come stringa decimale, come la restituisce Sequelize', () => {
    expect(obiettiviInCentesimi({ bisogni: 70, desideri: 20, futuro: 10 }, '1999.99').bisogni).toBe(139999);
  });

  it('Futuro allo 0% vale 0 centesimi', () => {
    expect(obiettiviInCentesimi({ bisogni: 70, desideri: 30, futuro: 0 }, 1500).futuro).toBe(0);
  });

  it('senza entrata gli obiettivi sono zero', () => {
    expect(obiettiviInCentesimi({ bisogni: 50, desideri: 30, futuro: 20 }, null)).toEqual({ bisogni: 0, desideri: 0, futuro: 0 });
    expect(obiettiviInCentesimi({ bisogni: 50, desideri: 30, futuro: 20 }, -5)).toEqual({ bisogni: 0, desideri: 0, futuro: 0 });
  });
});

describe('percentualiDelPiano', () => {
  it('un modello pronto ignora le percentuali inviate', () => {
    expect(percentualiDelPiano('equilibrato', { bisogni: 10, desideri: 10, futuro: 80 }))
      .toEqual({ bisogni: 50, desideri: 30, futuro: 20 });
  });

  it('personalizzato valido restituisce le sue percentuali', () => {
    expect(percentualiDelPiano('personalizzato', { bisogni: 60, desideri: 25, futuro: 15 }))
      .toEqual({ bisogni: 60, desideri: 25, futuro: 15 });
  });

  it('personalizzato invalido → null', () => {
    expect(percentualiDelPiano('personalizzato', { bisogni: 60, desideri: 30, futuro: 20 })).toBeNull();
  });

  it('modello sconosciuto → null', () => {
    expect(percentualiDelPiano('aggressivo', { bisogni: 50, desideri: 30, futuro: 20 })).toBeNull();
  });
});
