const { buildChangeTimeline } = require('../services/pianoSmartV2/changeTimeline.service');
const { buildCurrentSituation } = require('../services/pianoSmartV2/currentSituation.service');
const { Movimento } = require('../models');

describe('timeline dei cambiamenti Piano Smart', () => {
  test('confronta finestre inclusive uguali e include la granularità richiesta', () => {
    const result = buildChangeTimeline({
      dailyTotals: [],
      firstMovementDate: '2026-01-01',
      referenceDate: '2026-09-30',
    });
    expect(result.points.map((point) => point.days)).toEqual([
      ...Array.from({ length: 30 }, (_, index) => index + 1),
      37, 44, 51, 58, 65, 72, 79, 86, 90,
    ]);
    expect(result.points.find((point) => point.days === 1).recent.from).toBe('2026-09-30');
    expect(result.points.find((point) => point.days === 1).previous.to).toBe('2026-09-29');
  });

  test('non riempie con zeri gli intervalli precedenti al primo movimento utile', () => {
    const result = buildChangeTimeline({
      dailyTotals: [],
      firstMovementDate: '2026-09-30',
      referenceDate: '2026-09-30',
    });
    expect(result.points.find((point) => point.days === 90).quality).toBe('storico_limitato');
    expect(buildChangeTimeline({ dailyTotals: [], firstMovementDate: null, referenceDate: '2026-09-30' })
      .points.find((point) => point.days === 1).quality).toBe('dati_insufficienti');
  });

  test('mantiene finestre equivalenti ai confini mensili e trimestrali', () => {
    const result = buildChangeTimeline({ dailyTotals: [], firstMovementDate: '2025-01-01', referenceDate: '2026-09-30' });
    expect(result.points.find((point) => point.days === 30)).toMatchObject({
      recent: { from: '2026-09-01', to: '2026-09-30' },
      previous: { from: '2026-08-02', to: '2026-08-31' },
    });
    expect(result.points.find((point) => point.days === 37)).toMatchObject({
      recent: { from: '2026-08-25', to: '2026-09-30' },
      previous: { from: '2026-07-19', to: '2026-08-24' },
    });
    expect(result.points.find((point) => point.days === 90)).toMatchObject({
      recent: { from: '2026-07-03', to: '2026-09-30' },
      previous: { from: '2026-04-04', to: '2026-07-02' },
    });
  });

  test('calcola differenze recenti meno precedenti e ignora la giornata corrente parziale nei totali precedenti', () => {
    const result = buildChangeTimeline({
      dailyTotals: [
        { date: '2026-09-29', type: 'uscita', category: 'cibo_spesa', amount: '10.00' },
        { date: '2026-09-30', type: 'uscita', category: 'cibo_spesa', amount: '12.35' },
        { date: '2026-09-30', type: 'entrata', category: 'stipendio', amount: '50.00' },
      ],
      firstMovementDate: '2026-09-29',
      referenceDate: '2026-09-30',
    });
    const point = result.points.find(({ days }) => days === 1);
    expect(point.recent).toMatchObject({ expenses: '12.35', income: '50.00', from: '2026-09-30', to: '2026-09-30' });
    expect(point.previous).toMatchObject({ expenses: '10.00', income: '0.00', from: '2026-09-29', to: '2026-09-29' });
    expect(point.delta).toMatchObject({ expenses: '2.35', income: '50.00' });
    expect(point.currentPeriodPartial).toBe(true);
  });
  test('non presenta come zero la media del periodo precedente al primo movimento', () => {
    const point = buildChangeTimeline({
      dailyTotals: [{ date: '2026-09-29', type: 'uscita', category: 'cibo_spesa', amount: '10.00' }],
      firstMovementDate: '2026-09-29',
      referenceDate: '2026-09-30',
    }).points.find((item) => item.days === 7);
    expect(point.recent.observedDays).toBe(2);
    expect(point.previous.observedDays).toBe(0);
    expect(point.previous.averageDailyExpenses).toBeNull();
    expect(point.recent.averageDailyExpenses).toBe('5.00');
  });

  test('limita la lettura ai movimenti utili dell’utente e agli ultimi 180 giorni', async () => {
    const original = Movimento.findAll;
    Movimento.findAll = jest.fn()
      .mockResolvedValueOnce([{ data: '2026-09-30', tipo: 'uscita', categoria: 'cibo_spesa', amount: '1.25' }])
      .mockResolvedValueOnce({ firstMovementDate: '2026-01-02' });
    try {
      const result = await require('../services/pianoSmartV2/changeTimeline.service')
        .getMovementDailyTotals(23, '2026-09-30');
      expect(result).toEqual({
        dailyTotals: [{ date: '2026-09-30', type: 'uscita', category: 'cibo_spesa', amount: '1.25' }],
        firstMovementDate: '2026-01-02',
      });
      const [dailyQuery, firstDateQuery] = Movimento.findAll.mock.calls.map(([query]) => query);
      expect(dailyQuery.where.user_id).toBe(23);
      expect(dailyQuery.where.data[Object.getOwnPropertySymbols(dailyQuery.where.data)[0]]).toEqual(['2026-04-04', '2026-09-30']);
      expect(dailyQuery.where.tipo).toBeDefined();
      expect(dailyQuery.where.tipo[Object.getOwnPropertySymbols(dailyQuery.where.tipo)[0]]).toEqual(['entrata', 'uscita']);
      expect(dailyQuery.group).toEqual(['data', 'tipo', 'categoria']);
      expect(firstDateQuery.where.user_id).toBe(23);
      expect(firstDateQuery.where.data).toBeDefined();
    } finally {
      Movimento.findAll = original;
    }
  });

  test('la situazione conserva i cambiamenti precomposti dal server', () => {
    const changes = { referenceDate: '2026-09-30', points: [] };
    const situation = buildCurrentSituation({ context: { period: { referenceDate: '2026-09-30' } }, changes });
    expect(situation.changes).toBe(changes);
  });
});
