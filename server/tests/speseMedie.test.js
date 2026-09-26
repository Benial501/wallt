const {
  costruisciPeriodiMedia,
  calcolaMediePerCategoria,
} = require('../services/speseMedie.service');

describe('medie delle spese frequenti', () => {
  test('calcola le medie per categoria sulle sole settimane e mesi completi osservati', () => {
    const periodi = costruisciPeriodiMedia({
      riferimento: '2026-09-26',
      primoMovimento: '2026-06-01',
    });
    const medie = calcolaMediePerCategoria({
      periodiSettimanali: periodi.weekly.periods,
      periodiMensili: periodi.monthly.periods,
      movimenti: [
        { data: '2026-09-14', categoria: 'cibo_spesa', importo: 40, ricorrente: false, tipo: 'uscita' },
        { data: '2026-09-20', categoria: 'cibo_spesa', importo: 20, ricorrente: false, tipo: 'uscita' },
        { data: '2026-09-02', categoria: 'trasporti', importo: 30, ricorrente: false, tipo: 'uscita' },
      ],
      categorie: [
        { id: 'cibo_spesa', nome: 'Alimentari', emoji: '🛒', colore: '#357' },
        { id: 'trasporti', nome: 'Trasporti', emoji: '🚗', colore: '#579' },
      ],
    });

    expect(periodi.weekly.periods).toHaveLength(12);
    expect(periodi.weekly.periods.at(-1)).toEqual({ from: '2026-09-14', to: '2026-09-20' });
    expect(periodi.monthly.periods.map(({ key }) => key)).toEqual(['2026-06', '2026-07', '2026-08']);
    expect(medie.weekly.items.find(({ category }) => category === 'cibo_spesa')).toMatchObject({
      name: 'Alimentari', total: 60, average: 5,
    });
    expect(medie.monthly.periodCount).toBe(3);
    expect(medie.monthly.items).toEqual([]);
    expect(medie.weekly.items.find(({ category }) => category === 'trasporti')).toMatchObject({
      emoji: '🚗', color: '#579', average: 2.5,
    });
  });

  test('esclude la prima settimana e il primo mese quando lo storico inizia a periodo avviato', () => {
    const periodi = costruisciPeriodiMedia({
      riferimento: '2026-09-26',
      primoMovimento: '2026-08-12',
    });

    expect(periodi.weekly.periods).toHaveLength(5);
    expect(periodi.weekly.periods[0]).toEqual({ from: '2026-08-17', to: '2026-08-23' });
    expect(periodi.monthly.periods).toEqual([]);
  });

  test('non inventa periodi di storico per un utente senza movimenti', () => {
    const periodi = costruisciPeriodiMedia({ riferimento: '2026-09-26', primoMovimento: null });
    expect(periodi.weekly.periods).toEqual([]);
    expect(periodi.monthly.periods).toEqual([]);
  });
});
