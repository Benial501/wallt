const { Op, fn, col } = require('sequelize');
const { Movimento } = require('../../models');
const { finestraGiorni, sommaGiorni } = require('../../utils/dateRome');
const { toCents, fromCents } = require('../pianoSmart/money');

const DAYS = [
  ...Array.from({ length: 30 }, (_, index) => index + 1),
  37, 44, 51, 58, 65, 72, 79, 86, 90,
];

const totalCents = (rows, predicate) => rows.reduce((sum, row) => (
  predicate(row) ? sum + (toCents(String(row.amount)) || 0) : sum
), 0);

const serializza = (value) => fromCents(Math.abs(value));
const signed = (value) => value < 0 ? `-${serializza(value)}` : serializza(value);

/** Legge al massimo 180 giorni di movimenti utili, più la prima data utile. */
async function getMovementDailyTotals(userId, referenceDate) {
  const startDate = finestraGiorni(referenceDate, 180).da;
  const usefulMovementWhere = {
    user_id: userId,
    tipo: { [Op.in]: ['entrata', 'uscita'] },
    [Op.or]: [
      { ricorrente: false },
      { ricorrente: { [Op.is]: null } },
    ],
  };
  const [dailyTotals, first] = await Promise.all([
    Movimento.findAll({
      where: {
        ...usefulMovementWhere,
        data: { [Op.between]: [startDate, referenceDate] },
      },
      attributes: [
        'data', 'tipo', 'categoria',
        [fn('SUM', col('importo')), 'amount'],
      ],
      group: ['data', 'tipo', 'categoria'],
      order: [['data', 'ASC']],
      raw: true,
    }),
    Movimento.findOne({
      where: {
        ...usefulMovementWhere,
        data: { [Op.lte]: referenceDate },
      },
      attributes: [[fn('MIN', col('data')), 'firstMovementDate']],
      raw: true,
    }),
  ]);
  const firstMovementDate = first?.firstMovementDate
    ? String(first.firstMovementDate).slice(0, 10) : null;
  return {
    dailyTotals: dailyTotals.map((row) => ({
      date: String(row.data).slice(0, 10),
      type: row.tipo,
      category: row.categoria || 'non_classificata',
      amount: String(row.amount),
    })),
    firstMovementDate,
  };
}

function buildChangeTimeline({ dailyTotals = [], referenceDate, firstMovementDate = null }) {
  const points = DAYS.map((days) => {
    const recent = finestraGiorni(referenceDate, days);
    const previous = {
      da: sommaGiorni(recent.da, -days),
      a: sommaGiorni(recent.da, -1),
    };
    const within = (date, range) => date >= range.da && date <= range.a;
    const recentRows = dailyTotals.filter((row) => within(row.date, recent));
    const previousRows = dailyTotals.filter((row) => within(row.date, previous));
    const recentIncome = totalCents(recentRows, (row) => row.type === 'entrata');
    const recentExpenses = totalCents(recentRows, (row) => row.type === 'uscita');
    const previousIncome = totalCents(previousRows, (row) => row.type === 'entrata');
    const previousExpenses = totalCents(previousRows, (row) => row.type === 'uscita');
    const categoryTotals = new Map();
    dailyTotals.forEach((row) => {
      if (row.type !== 'uscita' || !row.category) return;
      const current = categoryTotals.get(row.category) || { recent: 0, previous: 0 };
      if (within(row.date, recent)) current.recent += toCents(String(row.amount)) || 0;
      if (within(row.date, previous)) current.previous += toCents(String(row.amount)) || 0;
      categoryTotals.set(row.category, current);
    });
    const changedCategories = [...categoryTotals.entries()]
      .map(([category, totals]) => ({
        category,
        recent: serializza(totals.recent),
        previous: serializza(totals.previous),
        delta: signed(totals.recent - totals.previous),
      }))
      .filter((item) => item.delta !== '0.00')
      .sort((a, b) => Math.abs(Number(b.delta) * 100) - Math.abs(Number(a.delta) * 100))
      .slice(0, 3);
    const hasHistory = Boolean(firstMovementDate);
    const covered = hasHistory && firstMovementDate <= previous.da;
    const quality = !hasHistory ? 'dati_insufficienti' : covered ? 'storico_disponibile' : 'storico_limitato';
    const observedDays = hasHistory && firstMovementDate <= referenceDate
      ? Math.min(days, Math.max(0, Math.floor((Date.parse(`${referenceDate}T00:00:00Z`) - Date.parse(`${firstMovementDate}T00:00:00Z`)) / 86400000) + 1))
      : 0;

    return {
      days,
      recent: {
        from: recent.da, to: recent.a,
        income: serializza(recentIncome), expenses: serializza(recentExpenses),
        averageDailyExpenses: serializza(Math.round(recentExpenses / days)),
      },
      previous: {
        from: previous.da, to: previous.a,
        income: serializza(previousIncome), expenses: serializza(previousExpenses),
        averageDailyExpenses: serializza(Math.round(previousExpenses / days)),
      },
      delta: {
        income: signed(recentIncome - previousIncome),
        expenses: signed(recentExpenses - previousExpenses),
      },
      changedCategories,
      quality,
      observedDays,
      currentPeriodPartial: true,
    };
  });
  return { referenceDate, points };
}

module.exports = { DAYS, getMovementDailyTotals, buildChangeTimeline };
