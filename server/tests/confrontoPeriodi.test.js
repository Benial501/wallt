// Intervalli del confronto nelle Analisi. Sono calcoli di calendario puri,
// senza database: la parte che sbaglia in silenzio (settimane che partono di
// domenica, mesi di lunghezza diversa, anni bisestili, fuso del processo).
require('./setup');
const assert = require('assert');
const {
  buildPeriodi, normalizzaQuantita, QUANTITA_MIN, QUANTITA_MAX,
  QUANTITA_MAX_PER_UNITA, UNITA_VALIDE, ultimiNMesi,
} = require('../services/confrontoPeriodi.service');

// Mercoledì 10 settembre 2026.
const OGGI = new Date(Date.UTC(2026, 8, 10));

describe('buildPeriodi — settimane', () => {
  it('restituisce N settimane dal lunedì alla domenica, dalla più vecchia', () => {
    const periodi = buildPeriodi({ unita: 'settimana', quantita: 3 }, OGGI);

    expect(periodi).toHaveLength(3);
    expect(periodi.map((p) => [p.da, p.a])).toEqual([
      ['2026-08-24', '2026-08-30'],
      ['2026-08-31', '2026-09-06'],
      ['2026-09-07', '2026-09-13'],
    ]);
  });

  it('la settimana corrente è l’ultima e contiene oggi', () => {
    const periodi = buildPeriodi({ unita: 'settimana', quantita: 6 }, OGGI);
    const ultima = periodi[periodi.length - 1];

    expect(ultima.da <= '2026-09-10' && '2026-09-10' <= ultima.a).toBe(true);
  });

  it('una domenica appartiene ancora alla settimana che inizia il lunedì prima', () => {
    // Domenica 13 settembre 2026: con la settimana che inizia di domenica
    // (default di molte librerie) finirebbe nella settimana successiva.
    const domenica = new Date(Date.UTC(2026, 8, 13));
    const periodi = buildPeriodi({ unita: 'settimana', quantita: 2 }, domenica);

    expect(periodi[periodi.length - 1]).toMatchObject({ da: '2026-09-07', a: '2026-09-13' });
  });

  it('etichetta la settimana con il lunedì e ne descrive l’arco per esteso', () => {
    const [prima] = buildPeriodi({ unita: 'settimana', quantita: 3 }, OGGI);

    expect(prima.label).toBe('24 ago');
    expect(prima.labelEsteso).toBe('24–30 Ago');
  });

  it('descrive per esteso anche una settimana a cavallo di due mesi', () => {
    const periodi = buildPeriodi({ unita: 'settimana', quantita: 2 }, OGGI);

    expect(periodi[0].labelEsteso).toBe('31 Ago – 6 Set');
  });
});

describe('buildPeriodi — mesi', () => {
  it('restituisce N mesi interi, dal più vecchio al corrente', () => {
    const periodi = buildPeriodi({ unita: 'mese', quantita: 3 }, OGGI);

    expect(periodi.map((p) => [p.da, p.a])).toEqual([
      ['2026-07-01', '2026-07-31'],
      ['2026-08-01', '2026-08-31'],
      ['2026-09-01', '2026-09-30'],
    ]);
    expect(periodi.map((p) => p.label)).toEqual(['Lug 26', 'Ago 26', 'Set 26']);
  });

  it('è l’unità predefinita quando non viene indicata', () => {
    expect(buildPeriodi({ quantita: 2 }, OGGI)).toEqual(
      buildPeriodi({ unita: 'mese', quantita: 2 }, OGGI),
    );
  });

  it('attraversa il capodanno senza saltare mesi', () => {
    const gennaio = new Date(Date.UTC(2026, 0, 15));
    const periodi = buildPeriodi({ unita: 'mese', quantita: 3 }, gennaio);

    expect(periodi.map((p) => p.label)).toEqual(['Nov 25', 'Dic 25', 'Gen 26']);
  });

  it('chiude febbraio al 29 in un anno bisestile', () => {
    const marzo2028 = new Date(Date.UTC(2028, 2, 5));
    const periodi = buildPeriodi({ unita: 'mese', quantita: 2 }, marzo2028);

    expect(periodi[0]).toMatchObject({ da: '2028-02-01', a: '2028-02-29' });
  });
});

describe('buildPeriodi — anni', () => {
  it('restituisce N anni interi, dal più vecchio al corrente', () => {
    const periodi = buildPeriodi({ unita: 'anno', quantita: 3 }, OGGI);

    expect(periodi.map((p) => [p.label, p.da, p.a])).toEqual([
      ['2024', '2024-01-01', '2024-12-31'],
      ['2025', '2025-01-01', '2025-12-31'],
      ['2026', '2026-01-01', '2026-12-31'],
    ]);
  });
});

describe('buildPeriodi — intervallo custom', () => {
  it('copre i mesi toccati dall’intervallo, estremi compresi', () => {
    const periodi = buildPeriodi({ da: '2026-07-18', a: '2026-09-03' }, OGGI);

    expect(periodi.map((p) => p.label)).toEqual(['Lug 26', 'Ago 26', 'Set 26']);
  });

  it('un intervallo dentro un solo mese produce un solo periodo', () => {
    const periodi = buildPeriodi({ da: '2026-09-02', a: '2026-09-08' }, OGGI);

    expect(periodi).toHaveLength(1);
    expect(periodi[0].label).toBe('Set 26');
  });

  it('ha la precedenza su unita e quantita', () => {
    const periodi = buildPeriodi(
      { unita: 'anno', quantita: 12, da: '2026-08-01', a: '2026-09-01' },
      OGGI,
    );

    expect(periodi.map((p) => p.label)).toEqual(['Ago 26', 'Set 26']);
  });

  it('restituisce un elenco vuoto se le date sono invertite o non valide', () => {
    expect(buildPeriodi({ da: '2026-09-10', a: '2026-08-01' }, OGGI)).toEqual([]);
    expect(buildPeriodi({ da: 'non-una-data', a: '2026-08-01' }, OGGI)).toEqual([]);
  });

  it('limita i periodi di un intervallo molto ampio', () => {
    const periodi = buildPeriodi({ da: '2010-01-01', a: '2026-12-31' }, OGGI);

    expect(periodi.length).toBeLessThanOrEqual(24);
  });
});

describe('normalizzaQuantita', () => {
  it('riporta i valori fuori scala dentro gli estremi del selettore', () => {
    expect(normalizzaQuantita(1)).toBe(QUANTITA_MIN);
    expect(normalizzaQuantita(99)).toBe(QUANTITA_MAX);
    expect(normalizzaQuantita(-4)).toBe(QUANTITA_MIN);
  });

  it('accetta la stringa che arriva dalla query', () => {
    expect(normalizzaQuantita('7')).toBe(7);
  });

  it('usa il valore predefinito quando il parametro manca o non è un numero', () => {
    expect(normalizzaQuantita(undefined)).toBe(6);
    expect(normalizzaQuantita('abc')).toBe(6);
  });
});

describe('buildPeriodi — giorni', () => {
  it('restituisce un punto per giorno, dal più vecchio a oggi', () => {
    const periodi = buildPeriodi({ unita: 'giorno', quantita: 7 }, OGGI);
    assert.equal(periodi.length, 7);
    assert.equal(periodi[0].da, '2026-09-04');
    assert.equal(periodi[6].da, '2026-09-10');
  });

  it('ogni giorno è un intervallo di un giorno solo', () => {
    const periodi = buildPeriodi({ unita: 'giorno', quantita: 3 }, OGGI);
    periodi.forEach((p) => {
      assert.equal(p.da, p.a);
      assert.equal(p.chiave, p.da);
    });
  });

  it('attraversa il confine del mese senza saltare giorni', () => {
    // 2 settembre 2026: cinque giorni indietro finiscono in agosto.
    const periodi = buildPeriodi({ unita: 'giorno', quantita: 5 }, new Date(Date.UTC(2026, 8, 2)));
    assert.deepEqual(periodi.map((p) => p.da), [
      '2026-08-29', '2026-08-30', '2026-08-31', '2026-09-01', '2026-09-02',
    ]);
  });

  it('etichetta breve per l\'asse ed estesa per il tooltip', () => {
    const [primo] = buildPeriodi({ unita: 'giorno', quantita: 2 }, OGGI);
    assert.equal(primo.label, '9 set');
    assert.equal(primo.labelEsteso, '9 settembre 2026');
  });

  it('accetta fino a 31 giorni', () => {
    assert.equal(buildPeriodi({ unita: 'giorno', quantita: 31 }, OGGI).length, 31);
  });

  it('taglia a 31 una richiesta più ampia', () => {
    assert.equal(buildPeriodi({ unita: 'giorno', quantita: 90 }, OGGI).length, 31);
  });
});

describe('normalizzaQuantita — tetto per unità', () => {
  it('il tetto di 31 vale solo per i giorni', () => {
    assert.equal(normalizzaQuantita(31, 'giorno'), 31);
    assert.equal(normalizzaQuantita(31, 'settimana'), 12);
    assert.equal(normalizzaQuantita(31, 'mese'), 12);
    assert.equal(normalizzaQuantita(31, 'anno'), 12);
  });

  it('senza unità vale il tetto storico, perché è la firma che usavano le Analisi', () => {
    assert.equal(normalizzaQuantita(31), 12);
  });

  it('il minimo resta 2 per ogni unità', () => {
    assert.equal(normalizzaQuantita(1, 'giorno'), 2);
    assert.equal(normalizzaQuantita(0, 'mese'), 2);
  });
});

describe('ultimiNMesi — nessun minimo di 2, a differenza di buildPeriodi', () => {
  const OGGI = new Date(Date.UTC(2026, 8, 23)); // 23 settembre 2026

  it('numMesi=1 restituisce esattamente un mese, il corrente', () => {
    const periodi = ultimiNMesi(1, OGGI);
    expect(periodi).toHaveLength(1);
    expect(periodi[0].chiave).toBe('2026-09');
  });

  it('numMesi=3 restituisce gli ultimi 3 mesi, dal più vecchio al più recente', () => {
    const periodi = ultimiNMesi(3, OGGI);
    expect(periodi.map((p) => p.chiave)).toEqual(['2026-07', '2026-08', '2026-09']);
  });

  it('rifiuta numMesi non intero o minore di 1', () => {
    expect(() => ultimiNMesi(0, OGGI)).toThrow();
    expect(() => ultimiNMesi(-1, OGGI)).toThrow();
    expect(() => ultimiNMesi(1.5, OGGI)).toThrow();
  });

  it('senza riferimento esplicito usa il mese corrente a Roma, non quello UTC del processo', () => {
    // Stesso confine di mezzanotte già coperto per buildPeriodi: alle 22:30
    // UTC del 30 settembre, a Roma (CEST, +2h) è già il 1° ottobre.
    const periodi = ultimiNMesi(1, new Date('2026-09-30T22:30:00Z'));
    expect(periodi[0].chiave).toBe('2026-10');
  });
});
