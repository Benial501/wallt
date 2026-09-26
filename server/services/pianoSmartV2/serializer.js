const { fromCents } = require('../pianoSmart/money');

const serializeScenario = (scenario) => ({
  ...scenario,
  allocations: scenario.allocations.map((item) => ({
    ...item,
    amount: fromCents(item.amountCents),
    amountCents: undefined,
  })),
});

const serializeAction = (action) => ({ ...action, amount: fromCents(action.amountCents), amountCents: undefined });

const serializePreview = ({ planningContext, scenarios, projections, actions, actionsByScenario = {} }) => ({
  engineVersion: 'smart-v2',
  capital: planningContext.capital,
  financialSituation: planningContext.situation,
  dataQuality: planningContext.dataQuality,
  scenarios: scenarios.map(serializeScenario),
  selectedScenario: 'bilanciato',
  projections,
  actions: actions.map(serializeAction),
  actionsByScenario: Object.fromEntries(Object.entries(actionsByScenario)
    .map(([scenarioId, scenarioActions]) => [scenarioId, scenarioActions.map(serializeAction)])),
  warnings: planningContext.warnings,
  confidence: planningContext.dataQuality.hasSufficientHistory ? 'GOOD' : 'LIMITED',
});

module.exports = { serializePreview };
