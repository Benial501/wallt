const { aCentesimi, calcolaCosti, calcolaTotali } = require('../utils/abbonamentiCosti');

describe('conti degli abbonamenti', () => {
  // La tabella del documento di progetto: se cambia una riga, cambia ciò che
  // l'utente legge sulla scheda.
  it.each([
    ['13.99', 1, null, 1399, 16788, null, 16788],
    ['49.90', 12, null, 416, 4990, null, 4990],
    ['30.00', 3, null, 1000, 12000, null, 12000],
    ['10.99', 1, 3, 1099, 13188, 3297, 3297],
    ['10.00', 1, 24, 1000, 12000, 24000, 12000],
    ['30.00', 3, 7, 1000, 12000, 9000, 9000],
  ])('%s ogni %i mesi per %s mesi', (costo, periodo_mesi, durata_mesi, al_mese, in_un_anno, in_totale, peso_annuo) => {
    expect(calcolaCosti({ costo, periodo_mesi, durata_mesi })).toEqual({
      al_mese, in_un_anno, in_totale, peso_annuo,
    });
  });

  it('non perde centesimi su un importo che in virgola mobile non è esatto', () => {
    // 19.99 * 100 in virgola mobile vale 1998.9999999999998.
    expect(aCentesimi('19.99')).toBe(1999);
    expect(aCentesimi(19.99)).toBe(1999);
    expect(aCentesimi('1.10')).toBe(110);
  });

  const voci = [
    { costo: '13.99', periodo_mesi: 1, durata_mesi: null },
    { costo: '49.90', periodo_mesi: 12, durata_mesi: null },
    { costo: '23.00', periodo_mesi: 1, durata_mesi: null },
    { costo: '18.00', periodo_mesi: 1, durata_mesi: null },
    { costo: '10.99', periodo_mesi: 1, durata_mesi: 3 },
  ];

  it('somma i totali come nelle bozze approvate', () => {
    expect(calcolaTotali(voci)).toEqual({ al_mese: 7014, all_anno: 74275, se_tutti_12_mesi: 84166 });
  });

  it('senza abbonamenti a tempo non propone il totale alternativo', () => {
    expect(calcolaTotali(voci.slice(0, 4)).se_tutti_12_mesi).toBeNull();
  });

  it('il totale al mese divide la somma annua, non somma valori già arrotondati', () => {
    // Tre annuali da 10 €: 0,83 × 3 darebbe 2,49; il valore vero è 2,50.
    const annuali = Array.from({ length: 3 }, () => ({ costo: '10.00', periodo_mesi: 12, durata_mesi: null }));
    expect(calcolaTotali(annuali).al_mese).toBe(250);
  });

  it('senza abbonamenti i totali sono zero', () => {
    expect(calcolaTotali([])).toEqual({ al_mese: 0, all_anno: 0, se_tutti_12_mesi: null });
  });
});
