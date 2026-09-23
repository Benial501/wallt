const { calcolaProgressoObiettivo } = require('../services/obiettiviStato.service');

const base = { tipo_obiettivo: 'generico', importo_target: '1000', importo_attuale: '400' };

describe('stato deterministico obiettivi', () => {
  it('usa mesi civili Europe/Rome e non intervalli fissi di 30 giorni', () => {
    const result = calcolaProgressoObiettivo({ ...base, deadline: '2026-04-03' }, new Date('2026-03-28T12:00:00Z'));
    expect(result.mesi_rimanenti).toBe(1);
    expect(result.contributo_mensile_richiesto).toBe(600);
    expect(result.stato).toBe('in_corso');
  });

  it.each([
    ['2026-03-31T22:30:00Z', '2026-04-01', 'scadenza_oggi'],
    ['2026-04-01T12:00:00Z', '2026-04-15', 'scadenza_mese_corrente'],
    ['2026-04-01T12:00:00Z', '2026-03-31', 'scaduto'],
  ])('distingue oggi, mese corrente e scaduto (%s)', (now, deadline, expected) => {
    const result = calcolaProgressoObiettivo({ ...base, deadline }, new Date(now));
    expect(result.stato).toBe(expected);
    expect(result.contributo_mensile_richiesto).toBeNull();
  });

  it('gestisce completato, senza scadenza, target non valido e dati mancanti', () => {
    expect(calcolaProgressoObiettivo({ ...base, importo_attuale: 1200, deadline: null }).stato).toBe('completato');
    expect(calcolaProgressoObiettivo({ ...base, deadline: null }).stato).toBe('senza_scadenza');
    expect(calcolaProgressoObiettivo({ ...base, importo_target: 0 }).stato).toBe('target_non_valido');
    expect(calcolaProgressoObiettivo({ ...base, importo_attuale: null }).stato).toBe('dati_mancanti');
  });

  it('espone priorita: alta/media/bassa passano invariate', () => {
    expect(calcolaProgressoObiettivo({ ...base, priorita: 'alta' }).priorita).toBe('alta');
    expect(calcolaProgressoObiettivo({ ...base, priorita: 'media' }).priorita).toBe('media');
    expect(calcolaProgressoObiettivo({ ...base, priorita: 'bassa' }).priorita).toBe('bassa');
  });

  it('priorita mancante o non valida (dato legacy/corrotto) è null, mai un valore inventato', () => {
    expect(calcolaProgressoObiettivo({ ...base }).priorita).toBeNull();
    expect(calcolaProgressoObiettivo({ ...base, priorita: null }).priorita).toBeNull();
    expect(calcolaProgressoObiettivo({ ...base, priorita: 'urgente' }).priorita).toBeNull();
  });
});
