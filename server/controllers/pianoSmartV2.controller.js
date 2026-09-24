const { getFinancialContext } = require('../services/financialContext.service');
const { buildPlanningContext } = require('../services/pianoSmartV2/planningContext.service');
const { generateScenarios } = require('../services/pianoSmartV2/scenario.service');
const { projectScenario } = require('../services/pianoSmartV2/projection.service');
const { createActions } = require('../services/pianoSmartV2/action.service');
const { toCents } = require('../services/pianoSmart/money');
const { serializePreview } = require('../services/pianoSmartV2/serializer');

const inputFromBody = (body) => ({
  amountCents: toCents(body.amount),
  mandatoryCents: body.mandatoryExpenses === undefined ? 0 : toCents(body.mandatoryExpenses),
  recurring: body.recurring === true,
});

const generate = async (userId, body) => {
  const input = inputFromBody(body);
  if (input.amountCents === null || input.amountCents <= 0 || input.mandatoryCents === null) {
    const error = new Error('Importi non validi.');
    error.status = 400;
    throw error;
  }
  const financialContext = await getFinancialContext(userId);
  const planningContext = buildPlanningContext({ context: financialContext, input });
  const scenarios = generateScenarios({ planningContext, financialContext });
  const projections = Object.fromEntries(scenarios.map((scenario) => [
    scenario.id,
    projectScenario({ scenario, planningContext, financialContext }),
  ]));
  const balanced = scenarios.find((scenario) => scenario.id === 'bilanciato');
  const actions = createActions({ scenario: balanced, planningContext, projection: projections.bilanciato });
  return serializePreview({ planningContext, scenarios, projections, actions });
};

const preview = async (req, res) => {
  try { return res.json(await generate(req.userId, req.body)); } catch (error) {
    return res.status(error.status || 500).json({ error: error.status ? error.message : 'Errore nella generazione del piano V2.' });
  }
};

module.exports = { preview, generate };
