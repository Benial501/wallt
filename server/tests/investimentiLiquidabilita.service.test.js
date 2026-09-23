const { descriviLiquidabilita } = require('../services/investimentiLiquidabilita.service');

describe('liquidabilità portafoglio', () => {
  it.each([
    ['liquidabile', 2, null],
    ['vincolato', null, 'Svincolo contrattuale'],
    ['sconosciuto', null, null],
  ])('espone %s come dato grezzo senza trattarlo come contante', (liquidabilita, giorni, condizioni) => {
    const result = descriviLiquidabilita({
      saldo_attuale: '123.45', liquidabilita,
      giorni_disponibilita: giorni, condizioni_disponibilita: condizioni,
      data_apertura: null,
    });
    expect(result).toEqual({
      valore: 123.45, liquidabilita,
      giorni_disponibilita: giorni, condizioni_disponibilita: condizioni,
      data_apertura: null,
    });
    expect(result).not.toHaveProperty('liquidita_allocabile');
  });
});
