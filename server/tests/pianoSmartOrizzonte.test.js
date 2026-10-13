/**
 * L'orizzonte di spesa: quanto si può spendere al giorno perché il capitale
 * basti fino a una data. Nessun database: suite pura, gira anche in
 * `npm run test:unit`.
 */
const { calcolaOrizzonte } = require('../services/pianoSmartV2/orizzonte.service');

const base = {
  tipo: 'data',
  dataFine: '2026-10-21',
  referenceDate: '2026-10-12',
  baseCents: 100000,
  impegniFinoACents: 0,
  ritmoGiornalieroCents: null,
};

describe('giorni', () => {
  test('conta inclusivi entrambi gli estremi', () => {
    expect(calcolaOrizzonte(base).giorni).toBe(10);
  });

  test('un orizzonte che finisce oggi vale un giorno', () => {
    expect(calcolaOrizzonte({ ...base, dataFine: '2026-10-12' }).giorni).toBe(1);
  });

  test('attraversa il cambio di mese e di anno', () => {
    expect(calcolaOrizzonte({
      ...base, referenceDate: '2026-12-30', dataFine: '2027-01-02',
    }).giorni).toBe(4);
  });
});

describe('budget giornaliero', () => {
  test('distribuisce il capitale libero sui giorni, arrotondando per difetto', () => {
    const esito = calcolaOrizzonte({ ...base, baseCents: 100005 });
    expect(esito.capitaleLibero).toBe(100005);
    expect(esito.budgetGiornaliero).toBe(10000);
    expect(esito.stato).toBe('in_rotta');
  });

  test('sottrae gli impegni prima di dividere', () => {
    const esito = calcolaOrizzonte({ ...base, impegniFinoACents: 40000 });
    expect(esito.capitaleLibero).toBe(60000);
    expect(esito.budgetGiornaliero).toBe(6000);
  });

  // La proprietà centrale: chi ha speso meno ieri oggi può spendere di più.
  test('speso meno di ieri: il budget di oggi sale', () => {
    const ieri = calcolaOrizzonte({ ...base, referenceDate: '2026-10-11', baseCents: 100000 });
    const oggiRisparmiando = calcolaOrizzonte({ ...base, baseCents: 95000 });
    expect(ieri.budgetGiornaliero).toBe(9090);
    expect(oggiRisparmiando.budgetGiornaliero).toBe(9500);
    expect(oggiRisparmiando.budgetGiornaliero).toBeGreaterThan(ieri.budgetGiornaliero);
  });

  test('speso piu del budget: il budget di oggi scende', () => {
    const ieri = calcolaOrizzonte({ ...base, referenceDate: '2026-10-11', baseCents: 100000 });
    const oggiSpendendo = calcolaOrizzonte({ ...base, baseCents: 80000 });
    expect(oggiSpendendo.budgetGiornaliero).toBeLessThan(ieri.budgetGiornaliero);
  });
});

describe('capitale insufficiente', () => {
  test('impegni oltre il capitale: scoperto e budget a zero', () => {
    const esito = calcolaOrizzonte({ ...base, impegniFinoACents: 150000 });
    expect(esito.stato).toBe('scoperto');
    expect(esito.capitaleLibero).toBe(-50000);
    expect(esito.mancanti).toBe(50000);
    expect(esito.budgetGiornaliero).toBe(0);
  });

  test('in rotta non espone mancanti', () => {
    expect(calcolaOrizzonte(base).mancanti).toBeNull();
  });
});

describe('data raggiungibile', () => {
  test('al ritmo attuale si ferma prima della data scelta', () => {
    const esito = calcolaOrizzonte({ ...base, ritmoGiornalieroCents: 25000 });
    expect(esito.dataRaggiungibile).toBe('2026-10-15');
  });

  test('un ritmo sostenibile arriva almeno alla data scelta', () => {
    const esito = calcolaOrizzonte({ ...base, ritmoGiornalieroCents: 5000 });
    expect(esito.dataRaggiungibile >= esito.dataFine).toBe(true);
  });

  test('senza ritmo osservato la data raggiungibile non si inventa', () => {
    expect(calcolaOrizzonte(base).dataRaggiungibile).toBeNull();
  });

  test('ritmo zero non divide per zero', () => {
    expect(calcolaOrizzonte({ ...base, ritmoGiornalieroCents: 0 }).dataRaggiungibile).toBeNull();
  });
});

describe('dati mancanti', () => {
  test('senza capitale non si stima nulla', () => {
    const esito = calcolaOrizzonte({ ...base, baseCents: null });
    expect(esito.stato).toBe('non_stimabile');
    expect(esito.budgetGiornaliero).toBeNull();
    expect(esito.capitaleLibero).toBeNull();
  });

  test('senza impegni noti non si stima nulla', () => {
    expect(calcolaOrizzonte({ ...base, impegniFinoACents: null }).stato).toBe('non_stimabile');
  });

  // Difetto 4 della review finale: una data già passata non è un dato
  // mancante, è una scelta da rifare. `scaduto` lo dice esplicitamente
  // invece di suggerire (falsamente) che manchino registrazioni.
  test('una data nel passato non produce un budget ed è scaduta, non "non stimabile"', () => {
    const esito = calcolaOrizzonte({ ...base, dataFine: '2026-10-01' });
    expect(esito.stato).toBe('scaduto');
    expect(esito.giorni).toBe(0);
    expect(esito.budgetGiornaliero).toBeNull();
  });

  test('la data uguale a oggi produce un solo giorno da distribuire', () => {
    const esito = calcolaOrizzonte({ ...base, dataFine: base.referenceDate });
    expect(esito.stato).not.toBe('scaduto');
    expect(esito.stato).not.toBe('non_stimabile');
    expect(esito.giorni).toBe(1);
    expect(esito.budgetGiornaliero).toBe(esito.capitaleLibero);
  });
});

describe('modalita mensile', () => {
  test('serializza i valori ricevuti senza ricalcolarli', () => {
    const esito = calcolaOrizzonte({
      tipo: 'mensile',
      dataFine: '2026-10-31',
      referenceDate: '2026-10-12',
      baseCents: 60000,
      impegniFinoACents: 0,
      ritmoGiornalieroCents: null,
    });
    expect(esito.tipo).toBe('mensile');
    expect(esito.giorni).toBe(20);
    expect(esito.budgetGiornaliero).toBe(3000);
  });
});
