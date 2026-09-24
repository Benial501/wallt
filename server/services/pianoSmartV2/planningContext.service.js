const { fromCents } = require('../pianoSmart/money');

const numero = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : null);
const euroToCents = (value) => (numero(value) === null ? null : Math.max(0, Math.floor(value * 100)));

const reserveFromContext = (context) => {
  const fund = context.emergencyFund || {};
  if (euroToCents(fund.missingAmount) !== null && fund.status !== 'assente') {
    return { cents: euroToCents(fund.missingAmount), source: 'observed' };
  }
  const essential = euroToCents(context.expenses?.byNecessity?.essential?.monthlyAverage);
  if (essential !== null && essential > 0) return { cents: essential * 3, source: 'estimated' };
  const expenses = euroToCents(context.expenses?.monthlyAverage);
  if (expenses !== null && expenses > 0) return { cents: expenses * 3, source: 'estimated' };
  return { cents: null, source: 'unavailable' };
};

const buildPlanningContext = ({ context, input }) => {
  const reserve = reserveFromContext(context);
  const mandatory = Number.isInteger(input.mandatoryCents) ? input.mandatoryCents : 0;
  const received = Number.isInteger(input.amountCents) ? input.amountCents : 0;
  const distributable = Math.max(received - mandatory - (reserve.cents ?? 0), 0);
  const warnings = [];
  if (reserve.source === 'estimated') warnings.push('La riserva minima è una stima prudenziale, non un saldo osservato.');
  if (reserve.source === 'unavailable') warnings.push('La riserva minima non è stimabile: mancano dati sulle spese.');
  return {
    capital: {
      receivedCents: received,
      mandatoryCents: mandatory,
      minimumReserveCents: reserve.cents,
      distributableCents: distributable,
      freeCents: distributable,
      reserveSource: reserve.source,
      formula: 'ricevuto - impegni obbligatori - riserva minima',
      received: fromCents(received),
      mandatory: fromCents(mandatory),
      minimumReserve: reserve.cents === null ? null : fromCents(reserve.cents),
      distributable: fromCents(distributable),
      recurring: input.recurring === true,
    },
    situation: {
      monthlyRecurringIncome: context.income?.recurringMonthlyAverage ?? null,
      essentialMonthlyExpenses: context.expenses?.byNecessity?.essential?.monthlyAverage ?? null,
      monthlySavings: context.cashFlow?.monthlySavings ?? null,
      liquidity: context.liquidity?.allocatable ?? null,
      emergencyCoverageMonths: context.emergencyFund?.coverageMonths ?? null,
      debtMonthlyPayments: context.debts?.totalMonthlyPayments ?? null,
      activeGoals: (context.goals || []).filter((goal) => goal.stato !== 'completato').length,
    },
    dataQuality: context.dataQuality || {},
    warnings,
  };
};

module.exports = { buildPlanningContext };
