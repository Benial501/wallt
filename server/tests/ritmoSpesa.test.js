const { classificaSpeseDelMese, sogliaUnaTantum, mediaVariabileMensile } = require('../services/ritmoSpesa');
const {
  UNA_TANTUM_SOGLIA_MINIMA, UNA_TANTUM_SOGLIA_SENZA_STORICO, UNA_TANTUM_GIORNI_DI_SPESA,
} = require('../constants/ritmoSpesa');

const mov = (id, importo, categoria = 'supermercato', extra = {}) => ({
  id, importo, categoria, descrizione: `Spesa ${id}`, data: '2026-11-03', ...extra,
});

describe('Ritmo di spesa: quali uscite del mese si proiettano', () => {
  test('la spesa di tutti i giorni entra nel ritmo', () => {
    const esito = classificaSpeseDelMese([mov(1, 30), mov(2, 12.5)], { soglia: 300 });
    expect(esito.totale).toBe(42.5);
    expect(esito.escluse).toEqual([]);
  });

  test('una programmata confermata come pagata non si ripete ogni giorno', () => {
    // Il caso segnalato: affitto da 700 € pagato il 1°, proiettato per 25 giorni.
    const esito = classificaSpeseDelMese(
      [mov(1, 120), mov(2, 700, 'casa', { descrizione: 'Affitto' })],
      { soglia: 300, movimentiProgrammati: new Set([2]) },
    );
    expect(esito.totale).toBe(120);
    expect(esito.escluse).toEqual([expect.objectContaining({ id: 2, motivo: 'pagamento_programmato', importo: 700, descrizione: 'Affitto' })]);
    expect(esito.totaleEscluse).toBe(700);
  });

  test('un versamento su un investimento non è una spesa', () => {
    const esito = classificaSpeseDelMese([mov(1, 120), mov(2, 300, 'investimento')], { soglia: 1000 });
    expect(esito.totale).toBe(120);
    expect(esito.escluse[0].motivo).toBe('versamento');
  });

  test('affitto e bollette arrivati dalla banca restano fuori anche sotto la soglia', () => {
    const esito = classificaSpeseDelMese([mov(1, 80, 'bollette'), mov(2, 650, 'affitto'), mov(3, 40)], { soglia: 1000 });
    expect(esito.totale).toBe(40);
    expect(esito.escluse.map((e) => e.motivo)).toEqual(['spesa_fissa', 'spesa_fissa']);
  });

  test('una spesa grande e isolata non viene moltiplicata per i giorni', () => {
    const esito = classificaSpeseDelMese([mov(1, 400, 'elettronica'), mov(2, 60)], { soglia: 300 });
    expect(esito.totale).toBe(60);
    expect(esito.escluse[0]).toMatchObject({ motivo: 'una_tantum', importo: 400 });
  });

  test('alla soglia esatta la spesa resta nel ritmo', () => {
    expect(classificaSpeseDelMese([mov(1, 300)], { soglia: 300 }).totale).toBe(300);
  });

  test('somma in centesimi, senza scarti di virgola mobile', () => {
    expect(classificaSpeseDelMese([mov(1, 0.1), mov(2, 0.2)], { soglia: 300 }).totale).toBe(0.3);
  });
});

describe('Ritmo di spesa: soglia della spesa una tantum', () => {
  test('con lo storico è qualche giorno di spesa media, mai sotto il minimo', () => {
    expect(sogliaUnaTantum(1826.25)).toBe(Math.round(1826.25 / 30.4375 * UNA_TANTUM_GIORNI_DI_SPESA * 100) / 100);
    expect(sogliaUnaTantum(30)).toBe(UNA_TANTUM_SOGLIA_MINIMA);
  });
  test('senza storico usa una soglia fissa', () => {
    expect(sogliaUnaTantum(null)).toBe(UNA_TANTUM_SOGLIA_SENZA_STORICO);
  });
  test('la media è quella delle sole spese variabili, così l’affitto non alza la soglia', () => {
    const mesi = [
      { categorie: [{ categoria: 'supermercato', importo: 480 }, { categoria: 'affitto', importo: 700 }, { categoria: 'investimento', importo: 300 }] },
      { categorie: [{ categoria: 'supermercato', importo: 500 }, { categoria: 'ristoranti', importo: 20 }] },
    ];
    expect(mediaVariabileMensile(mesi)).toBe(500);
    expect(mediaVariabileMensile([])).toBeNull();
  });
  test('la spesa settimanale al supermercato resta nel ritmo', () => {
    // 480 € al mese, una spesa da 120 € ogni settimana: è il ritmo, non un'eccezione.
    const soglia = sogliaUnaTantum(480);
    expect(classificaSpeseDelMese([mov(1, 120)], { soglia }).totale).toBe(120);
    expect(classificaSpeseDelMese([mov(2, 400, 'elettronica')], { soglia }).escluse[0].motivo).toBe('una_tantum');
  });
});
