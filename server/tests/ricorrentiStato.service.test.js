const { cambiaStatoRicorrenza, ricorrenzaAttiva } = require('../services/ricorrenti.service');

describe('stati ricorrenza', () => {
  it('sospesa è riattivabile e non è un impegno attivo', () => {
    expect(cambiaStatoRicorrenza('attiva', 'sospesa')).toBe('sospesa');
    expect(ricorrenzaAttiva({ ricorrente: true, stato_ricorrenza: 'sospesa' })).toBe(false);
    expect(cambiaStatoRicorrenza('sospesa', 'attiva')).toBe('attiva');
  });

  it('terminata è definitiva', () => {
    expect(cambiaStatoRicorrenza('sospesa', 'terminata')).toBe('terminata');
    expect(() => cambiaStatoRicorrenza('terminata', 'attiva')).toThrow('terminata');
    expect(ricorrenzaAttiva({ ricorrente: true, stato_ricorrenza: 'terminata' })).toBe(false);
  });
});
