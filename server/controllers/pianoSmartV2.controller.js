const { getFinancialContext, riepilogoRicorrenti } = require('../services/financialContext.service');
const { buildPlanningContext } = require('../services/pianoSmartV2/planningContext.service');
const { generateScenarios } = require('../services/pianoSmartV2/scenario.service');
const { projectScenario } = require('../services/pianoSmartV2/projection.service');
const { createActions } = require('../services/pianoSmartV2/action.service');
const { toCents } = require('../services/pianoSmart/money');
const { serializePreview } = require('../services/pianoSmartV2/serializer');
const { sequelize, PianoSmart, PianoSmartAllocazione, PianoSmartAzione } = require('../models');
const { buildCurrentSituation, simulatePurchase: simulaAcquisto } = require('../services/pianoSmartV2/currentSituation.service');
const { getMovementDailyTotals, buildChangeTimeline } = require('../services/pianoSmartV2/changeTimeline.service');
const logger = require('../utils/logger');

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
  const actionsByScenario = Object.fromEntries(scenarios.map((scenario) => [
    scenario.id,
    createActions({ scenario, planningContext, projection: projections[scenario.id] }),
  ]));
  const actions = actionsByScenario.bilanciato
    || createActions({ scenario: balanced, planningContext, projection: projections.bilanciato });
  return serializePreview({ planningContext, scenarios, projections, actions, actionsByScenario });
};

const preview = async (req, res) => {
  try { return res.json(await generate(req.userId, req.body)); } catch (error) {
    return res.status(error.status || 500).json({ error: error.status ? error.message : 'Errore nella generazione del piano V2.' });
  }
};

/**
 * `getFinancialContext` più l'arricchimento dell'orizzonte: la proiezione
 * lunga delle ricorrenze costa un giro di query in più, quindi si chiede
 * solo a chi ha scelto un orizzonte a data. `riepilogoRicorrenti` è già
 * esportata, quindi non serve allargare `getFinancialContext`.
 *
 * UNICA fonte per entrambi i gestori che costruiscono una situazione
 * (`currentSituation` e `simulatePurchase`, gli unici due in tutto
 * `server/controllers` e `server/services`): prima questo blocco viveva
 * solo in `currentSituation`, e `simulatePurchase` chiamava
 * `buildCurrentSituation` su un contesto senza `recurring.horizon`. In
 * modalità a data `impegniFinoACents` arrivava sempre `null`,
 * `calcolaOrizzonte` restituiva `non_stimabile` con `capitaleLibero: null`,
 * e il simulatore rispondeva sempre 400 — un difetto Critico, il
 * simulatore era completamente inutilizzabile in quella modalità. Due
 * copie dello stesso arricchimento sono già divergite una volta; qui non
 * ne resta che una.
 */
const caricaContestoConOrizzonte = async (userId) => {
  const financialContext = await getFinancialContext(userId);
  if (financialContext.preferences?.orizzonteTipo === 'data'
    && financialContext.preferences?.orizzonteData) {
    const conOrizzonte = await riepilogoRicorrenti(
      userId,
      new Date(financialContext.period.referenceDate),
      financialContext.preferences.orizzonteData,
    );
    financialContext.recurring.horizon = conOrizzonte.horizon;
  }
  return financialContext;
};

const currentSituation = async (req, res) => {
  try {
    const financialContext = await caricaContestoConOrizzonte(req.userId);
    const { dailyTotals, firstMovementDate } = await getMovementDailyTotals(
      req.userId,
      financialContext.period.referenceDate,
    );
    const changes = buildChangeTimeline({
      dailyTotals,
      firstMovementDate,
      referenceDate: financialContext.period.referenceDate,
    });
    return res.json(buildCurrentSituation({ context: financialContext, changes }));
  } catch (error) {
    logger.error('Current situation calculation failed', { err: error, userId: req.userId });
    return res.status(error.status || 500).json({ error: error.status ? error.message : 'Errore nel riepilogo della situazione.' });
  }
};

const simulatePurchase = async (req, res) => {
  try {
    const amountCents = toCents(req.body?.amount);
    if (amountCents === null || amountCents <= 0) {
      return res.status(400).json({ error: 'Inserisci un importo positivo con al massimo due decimali.' });
    }
    const financialContext = await caricaContestoConOrizzonte(req.userId);
    const situation = buildCurrentSituation({ context: financialContext });
    const result = simulaAcquisto(situation, req.body.amount);
    // Due cause diverse, due frasi diverse: un importo già respinto sopra
    // non arriva qui, quindi se `simulaAcquisto` restituisce `null` non è
    // l'importo a essere invalido (lo sappiamo già) — è la situazione a non
    // essere calcolabile (dati insufficienti o inconsistenti). Prima la
    // stessa frase copriva entrambe le cause e accusava l'utente di un
    // errore che non aveva fatto.
    if (!result) {
      return res.status(422).json({ error: 'Non riesco a calcolare la tua situazione in questo momento: riprova più tardi.' });
    }
    return res.json(result);
  } catch (error) {
    logger.error('Purchase simulation failed', { err: error, userId: req.userId });
    return res.status(error.status || 500).json({ error: error.status ? error.message : 'Errore nella simulazione della spesa.' });
  }
};

const save = async (req, res) => {
  try {
    const result = await generate(req.userId, req.body);
    const selected = result.scenarios.find((scenario) => scenario.id === (req.body.selectedScenario || 'bilanciato'))
      || result.scenarios.find((scenario) => scenario.id === 'bilanciato');
    const selectedActions = result.actionsByScenario?.[selected.id] || result.actions;
    const savedResult = { ...result, selectedScenario: selected.id, actions: selectedActions };
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
        context_snapshot: savedResult,
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
      await PianoSmartAzione.bulkCreate(selectedActions.map((action) => ({
        plan_id: plan.id, user_id: req.userId, action_key: action.actionKey, title: action.title,
        amount: action.amount, destination_type: action.destinationType, destination_id: action.destinationId,
        reason: action.reason, risk_if_ignored: action.riskIfIgnored, priority: action.priority, status: action.status,
      })), { transaction });
      return plan;
    });
    return res.status(201).json({ id: created.id, engineVersion: 'smart-v2', ...savedResult });
  } catch (error) {
    logger.error('Errore nel salvataggio del piano V2', { err: error, userId: req.userId });
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

const getSnapshot = async (req, res) => {
  const plan = await PianoSmart.findOne({ where: { id: req.params.id, user_id: req.userId } });
  if (!plan || plan.engine_version !== 'smart-v2') return res.status(404).json({ error: 'Piano V2 non trovato.' });
  return res.json(plan.context_snapshot);
};

const getScenarios = async (req, res) => {
  const snapshot = await getOwnedSnapshot(req);
  if (!snapshot) return res.status(404).json({ error: 'Piano V2 non trovato.' });
  return res.json(snapshot.scenarios || []);
};

const getProjection = async (req, res) => {
  const snapshot = await getOwnedSnapshot(req);
  if (!snapshot) return res.status(404).json({ error: 'Piano V2 non trovato.' });
  return res.json(snapshot.projections || {});
};

const getOwnedSnapshot = async (req) => {
  const plan = await PianoSmart.findOne({ where: { id: req.params.id, user_id: req.userId, engine_version: 'smart-v2' } });
  return plan?.context_snapshot || null;
};

module.exports = { preview, currentSituation, simulatePurchase, save, listActions, updateAction, getSnapshot, getScenarios, getProjection, generate };
