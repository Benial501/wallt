// Il setup globale dei test backend importa i modelli reali per PostgreSQL.
// Questa suite usa modelli finti e deve caricarli dopo il reset del registro.
jest.resetModules();
jest.mock('../models', () => ({ Movimento: { findAll: jest.fn() } }));
jest.mock('../services/categorie.service', () => ({ list: jest.fn() }));

const { Movimento } = require('../models');
const { list: listCategories } = require('../services/categorie.service');
const { aggregaMedieSpeseFrequenti } = require('../services/spese.service');

describe('aggregaMedieSpeseFrequenti', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Movimento.findAll.mockResolvedValue([
      { data: '2026-09-14', categoria: 'cibo_spesa', importo: '100.00', ricorrente: false, tipo: 'uscita' },
      { data: '2026-09-15', categoria: 'cibo_spesa', importo: '900.00', ricorrente: true, tipo: 'uscita' },
    ]);
    listCategories.mockResolvedValue([
      { id: 'cibo_spesa', nome: 'Alimentari', emoji: '🛒', colore: '#357', tipo: 'uscita' },
    ]);
  });

  test('interroga solo le uscite nella finestra comune e associa i metadati della categoria', async () => {
    const result = await aggregaMedieSpeseFrequenti('user-1', '2026-09-26', '2026-06-01');

    expect(Movimento.findAll).toHaveBeenCalledTimes(1);
    expect(Movimento.findAll.mock.calls[0][0]).toMatchObject({
      where: { user_id: 'user-1', tipo: 'uscita' },
      attributes: ['data', 'categoria', 'importo', 'ricorrente'],
    });
    expect(result.weekly.items[0]).toMatchObject({
      category: 'cibo_spesa', name: 'Alimentari', average: 8.33,
    });
    expect(result.monthly.items).toEqual([]);
  });

  test('non interroga il database quando non esistono periodi completi osservati', async () => {
    const result = await aggregaMedieSpeseFrequenti('user-1', '2026-09-26', '2026-09-25');

    expect(Movimento.findAll).not.toHaveBeenCalled();
    expect(result.weekly.periodCount).toBe(0);
    expect(result.monthly.periodCount).toBe(0);
  });
});
