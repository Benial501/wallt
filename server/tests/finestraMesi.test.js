// La finestra di mesi su cui si calcolano le medie confrontabili di entrate,
// spese e cash flow. Modulo puro: nessun database, nessun fuso — riceve già
// i mesi civili di Roma da chi li ha calcolati.
const { classificaFinestra, elencoMesi } = require('../services/finestraMesi.service');

describe('elencoMesi', () => {
  it('elenca N mesi civili consecutivi che terminano nel mese indicato', () => {
    expect(elencoMesi('2026-09', 3)).toEqual(['2026-07', '2026-08', '2026-09']);
  });

  it('attraversa il cambio d\'anno senza inventare mesi', () => {
    expect(elencoMesi('2027-01', 3)).toEqual(['2026-11', '2026-12', '2027-01']);
  });

  it('con N=1 restituisce solo il mese indicato', () => {
    expect(elencoMesi('2026-09', 1)).toEqual(['2026-09']);
  });
});

describe('classificaFinestra', () => {
  const richiesti = elencoMesi('2026-09', 6); // 2026-04 .. 2026-09

  it('senza alcun movimento non esiste storico osservato: nessun mese, nessuna media', () => {
    const f = classificaFinestra({ mesiRichiesti: richiesti, meseCorrente: '2026-09', primoMovimento: null });
    expect(f.osservati).toEqual([]);
    expect(f.completi).toEqual([]);
    expect(f.primoMeseParziale).toBe(false);
  });

  it('lo storico osservato comincia dal primo movimento, non dall\'inizio della finestra richiesta', () => {
    const f = classificaFinestra({ mesiRichiesti: richiesti, meseCorrente: '2026-09', primoMovimento: '2026-07-15' });
    expect(f.osservati).toEqual(['2026-07', '2026-08', '2026-09']);
  });

  it('il mese corrente è osservato ma mai completo: è ancora in corso', () => {
    const f = classificaFinestra({ mesiRichiesti: richiesti, meseCorrente: '2026-09', primoMovimento: '2026-07-01' });
    expect(f.osservati).toContain('2026-09');
    expect(f.completi).not.toContain('2026-09');
  });

  it('il primo mese di storico non è completo se il primo movimento non cade il giorno 1', () => {
    const f = classificaFinestra({ mesiRichiesti: richiesti, meseCorrente: '2026-09', primoMovimento: '2026-07-15' });
    expect(f.primoMeseParziale).toBe(true);
    expect(f.completi).toEqual(['2026-08']);
  });

  it('il primo mese è completo se le registrazioni partono dal suo primo giorno', () => {
    const f = classificaFinestra({ mesiRichiesti: richiesti, meseCorrente: '2026-09', primoMovimento: '2026-07-01' });
    expect(f.primoMeseParziale).toBe(false);
    expect(f.completi).toEqual(['2026-07', '2026-08']);
  });

  it('se lo storico comincia prima della finestra richiesta, il primo mese richiesto è completo', () => {
    const f = classificaFinestra({ mesiRichiesti: richiesti, meseCorrente: '2026-09', primoMovimento: '2025-03-17' });
    expect(f.primoMeseParziale).toBe(false);
    expect(f.completi).toEqual(['2026-04', '2026-05', '2026-06', '2026-07', '2026-08']);
  });

  it('un solo mese di storico, quello corrente: osservato ma nessuna media possibile', () => {
    const f = classificaFinestra({ mesiRichiesti: richiesti, meseCorrente: '2026-09', primoMovimento: '2026-09-01' });
    expect(f.osservati).toEqual(['2026-09']);
    expect(f.completi).toEqual([]);
  });

  it('attraversa il cambio d\'anno conservando l\'ordine e i confini', () => {
    const f = classificaFinestra({
      mesiRichiesti: elencoMesi('2027-02', 5), // 2026-10 .. 2027-02
      meseCorrente: '2027-02',
      primoMovimento: '2026-12-01',
    });
    expect(f.osservati).toEqual(['2026-12', '2027-01', '2027-02']);
    expect(f.completi).toEqual(['2026-12', '2027-01']);
  });

  it('espone la finestra richiesta e quella osservata come intervalli distinti', () => {
    const f = classificaFinestra({ mesiRichiesti: richiesti, meseCorrente: '2026-09', primoMovimento: '2026-07-15' });
    expect(f.richiesta).toEqual({ da: '2026-04', a: '2026-09' });
    expect(f.osservata).toEqual({ da: '2026-07', a: '2026-09' });
    expect(f.mesiPerLeMedie).toEqual({ da: '2026-08', a: '2026-08', quantita: 1 });
  });

  it('senza storico, le tre finestre restano distinguibili: richiesta sì, osservata no', () => {
    const f = classificaFinestra({ mesiRichiesti: richiesti, meseCorrente: '2026-09', primoMovimento: null });
    expect(f.richiesta).toEqual({ da: '2026-04', a: '2026-09' });
    expect(f.osservata).toBeNull();
    expect(f.mesiPerLeMedie).toEqual({ da: null, a: null, quantita: 0 });
  });
});
