const { ORIZZONTI_PROIEZIONE_V2 } = require('../../constants/pianoSmartV2');

const projectScenario = ({ scenario, planningContext, financialContext, horizons = ORIZZONTI_PROIEZIONE_V2 }) => {
  const sufficient = financialContext.dataQuality?.hasSufficientHistory
    && Number.isFinite(financialContext.cashFlow?.monthlySavings);
  const monthlySavings = financialContext.cashFlow?.monthlySavings;
  const recurring = planningContext.capital?.recurring === true;
  const oneOff = scenario.allocations?.reduce((sum, item) => sum + item.amountCents, 0) || 0;
  return Object.fromEntries(horizons.map((months) => {
    if (!sufficient) return [months, { months, status: 'non_stimabile', reason: 'Manca uno storico sufficiente per stimare il risparmio.' }];
    const recurringEffect = recurring ? Math.max(0, Math.round(monthlySavings * months * 100)) : 0;
    return [months, {
      months,
      status: 'stimabile',
      liquidityCents: Math.round((financialContext.liquidity?.allocatable || 0) * 100) + oneOff + recurringEffect,
      savingsCumulative: recurringEffect + (recurring ? 0 : oneOff),
      emergencyCoverageMonths: financialContext.emergencyFund?.coverageMonths ?? null,
      goals: financialContext.goals || [],
      debtOutstandingCents: Number.isFinite(financialContext.debts?.totalOutstanding)
        ? Math.round(financialContext.debts.totalOutstanding * 100) : null,
    }];
  }));
};

module.exports = { projectScenario };
