const { getFinancialContext } = require('../services/financialContext.service');
const { buildPlanningContext } = require('../services/pianoSmartV2/planningContext.service');
const { generateScenarios } = require('../services/pianoSmartV2/scenario.service');
const { projectScenario } = require('../services/pianoSmartV2/projection.service');
const { createActions } = require('../services/pianoSmartV2/action.service');
const { toCents } = require('../services/pianoSmart/money');
const { serializePreview } = require('../services/pianoSmartV2/serializer');
const { sequelize, PianoSmart, PianoSmartAllocazione, PianoSmartAzione } = require('../models');

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

const save = async (req, res) => {
  try {
    const result = await generate(req.userId, req.body);
    const selected = result.scenarios.find((scenario) => scenario.id === (req.body.selectedScenario || 'bilanciato'))
      || result.scenarios.find((scenario) => scenario.id === 'bilanciato');
    const input = inputFromBody(req.body);
    const created = await sequelize.transaction(async (transaction) => {
      const plan = await PianoSmart.create({
        user_id: req.userId,
        incoming_amount: (input.amountCents / 100).toFixed(2),
        mandatory_expenses: (input.mandatoryCents / 100).toFixed(2),
        allocatable_capital: (result.capital.distributableCents / 100).toFixed(2),
        recommended_total: (result.capital.distributableCents / 100).toFixed(2),
        source_type: req.body.sourceType || 'altro',
        source_recurring: input.recurring,
        engine_version: 'smart-v2',
        context_snapshot: result,
        reason_codes: [],
        status: 'draft',
      }, { transaction });
      await PianoSmartAllocazione.bulkCreate(selected.allocations.map((item) => ({
        plan_id: plan.id,
        category: item.category,
        recommended_amount: item.amount,
        final_amount: item.amount,
        recommended_percentage: item.percentage,
        final_percentage: item.percentage,
        metadata: { destinationType: item.destinationType, destinationId: item.destinationId },
        reason_codes: [],
      })), { transaction });
      await PianoSmartAzione.bulkCreate(result.actions.map((action) => ({
        plan_id: plan.id, user_id: req.userId, action_key: action.actionKey, title: action.title,
        amount: action.amount, destination_type: action.destinationType, destination_id: action.destinationId,
        reason: action.reason, risk_if_ignored: action.riskIfIgnored, priority: action.priority, status: action.status,
      })), { transaction });
      return plan;
    });
    return res.status(201).json({ id: created.id, engineVersion: 'smart-v2', ...result, selectedScenario: selected.id });
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.status ? error.message : 'Errore nel salvataggio del piano V2.' });
  }
};

const listActions = async (req, res) => {
  const actions = await PianoSmartAzione.findAll({ where: { plan_id: req.params.id, user_id: req.userId }, order: [['priority', 'ASC']] });
  return res.json(actions.map((action) => ({
    id: action.id, actionKey: action.action_key, title: action.title,
    amount: action.amount === null ? null : String(action.amount), destinationType: action.destination_type,
    destinationId: action.destination_id, reason: action.reason, riskIfIgnored: action.risk_if_ignored,
    priority: action.priority, status: action.status,
  })));
};

const updateAction = async (req, res) => {
  const action = await PianoSmartAzione.findOne({ where: { id: req.params.actionId, plan_id: req.params.id, user_id: req.userId } });
  if (!action) return res.status(404).json({ error: 'Azione non trovata.' });
  const next = req.body.status;
  if (!['completata', 'ignorata'].includes(next) || action.status !== 'da_fare') {
    return res.status(400).json({ error: 'Stato azione non valido.' });
  }
  await action.update({ status: next });
  return res.json({ id: action.id, status: action.status });
};

module.exports = { preview, save, listActions, updateAction, generate };
