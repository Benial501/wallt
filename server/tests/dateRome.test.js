const {
  oggiLocale,
  inizioMese,
  fineMese,
  sommaMesi,
  finestraGiorni,
  mesiRimanenti,
} = require('../utils/dateRome');

describe('dateRome — confine mezzanotte Europe/Rome vs UTC', () => {
  it('CET (inverno, UTC+1): 23:30 UTC è già il giorno dopo a Roma', () => {
    const istante = new Date('2026-01-15T23:30:00Z');
    expect(oggiLocale('Europe/Rome', istante)).toBe('2026-01-16');
  });

  it('CEST (estate, ora legale, UTC+2): 22:30 UTC è già il giorno dopo a Roma', () => {
    const istante = new Date('2026-07-15T22:30:00Z');
    expect(oggiLocale('Europe/Rome', istante)).toBe('2026-07-16');
  });

  it('poco prima della mezzanotte di Roma resta ancora il giorno corrente', () => {
    const istante = new Date('2026-01-15T22:30:00Z'); // 23:30 a Roma (CET)
    expect(oggiLocale('Europe/Rome', istante)).toBe('2026-01-15');
  });
});

describe('dateRome — inizio/fine mese, cambio anno, bisestile', () => {
  it('fine mese di febbraio bisestile (2028)', () => {
    expect(fineMese('2028-02-10')).toBe('2028-02-29');
  });

  it('fine mese di febbraio non bisestile (2026)', () => {
    expect(fineMese('2026-02-10')).toBe('2026-02-28');
  });

  it('inizio mese', () => {
    expect(inizioMese('2026-03-17')).toBe('2026-03-01');
  });

  it('somma mesi con cambio anno', () => {
    expect(sommaMesi('2026-11-15', 2)).toBe('2027-01-15');
  });

  it('somma mesi con clamp sul fine mese risultante (31 gennaio + 1 mese)', () => {
    expect(sommaMesi('2026-01-31', 1)).toBe('2026-02-28');
  });

  it('somma mesi negativi', () => {
    expect(sommaMesi('2026-01-15', -1)).toBe('2025-12-15');
  });
});

describe('dateRome — finestre a giorni fissi', () => {
  it('finestra di 30 giorni inclusiva, a cavallo di febbraio non bisestile', () => {
    expect(finestraGiorni('2026-03-01', 30)).toEqual({ da: '2026-01-31', a: '2026-03-01' });
  });

  it('finestra di 90 giorni', () => {
    const { da, a } = finestraGiorni('2026-09-23', 90);
    expect(a).toBe('2026-09-23');
    expect(da).toBe('2026-06-26');
  });
});

describe('dateRome — mesi rimanenti fino a una scadenza', () => {
  it('meno di un mese pieno conta 0, non 1', () => {
    expect(mesiRimanenti('2026-09-23', '2026-10-03')).toBe(0);
  });

  it('esattamente 3 mesi pieni', () => {
    expect(mesiRimanenti('2026-09-23', '2026-12-23')).toBe(3);
  });

  it('scadenza oggi stesso: 0, non un mese', () => {
    expect(mesiRimanenti('2026-09-23', '2026-09-23')).toBe(0);
  });

  it('scadenza già passata: 0, mai negativo', () => {
    expect(mesiRimanenti('2026-09-23', '2025-01-01')).toBe(0);
  });

  it('cambio anno con giorno che non è ancora arrivato nel mese di scadenza', () => {
    expect(mesiRimanenti('2026-11-20', '2027-01-10')).toBe(1);
  });
});
