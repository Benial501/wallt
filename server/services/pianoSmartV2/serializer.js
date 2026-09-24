const { fromCents } = require('../pianoSmart/money');

const serializeScenario = (scenario) => ({
  ...scenario,
  allocations: scenario.allocations.map((item) => ({
    ...item,
    amount: fromCents(item.amountCents),
    amountCents: undefined,
  })),
});

const serializePreview = ({ planningContext, scenarios, projections, actions }) => ({
  engineVersion: 'smart-v2',
  capital: planningContext.capital,
  financialSituation: planningContext.situation,
  dataQuality: planningContext.dataQuality,
  scenarios: scenarios.map(serializeScenario),
  selectedScenario: 'bilanciato',
  projections,
  actions: actions.map((action) => ({ ...action, amount: fromCents(action.amountCents), amountCents: undefined })),
  warnings: planningContext.warnings,
  confidence: planningContext.dataQuality.hasSufficientHistory ? 'GOOD' : 'LIMITED',
});

module.exports = { serializePreview };
