class SmartPlanValidationError extends Error {
  constructor(message, field = 'amount') {
    super(message);
    this.name = 'SmartPlanValidationError';
    this.code = 'SMART_PLAN_VALIDATION_ERROR';
    this.field = field;
  }
}

const CATEGORY_DEFINITIONS = [
  { key: 'necessita', label: 'Necessità', baseWeight: 0.35 },
  { key: 'sicurezza', label: 'Sicurezza', baseWeight: 0.25 },
  { key: 'obiettivi', label: 'Obiettivi', baseWeight: 0.2 },
  { key: 'futuro', label: 'Futuro', baseWeight: 0.12 },
  { key: 'liberta', label: 'Libertà', baseWeight: 0.08 },
];

const roundCents = (value) => Math.round((value + Number.EPSILON) * 100) / 100;

function validateAmount(amount) {
  if (amount === undefined || amount === null || amount === '') {
    throw new SmartPlanValidationError('Inserisci l’importo della nuova entrata.');
  }
  const parsed = Number(amount);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new SmartPlanValidationError('L’importo deve essere maggiore di zero.');
  }
  return roundCents(parsed);
}

function normaliseContext(context = {}) {
  const numeric = (key) => {
    const value = Number(context[key]);
    return Number.isFinite(value) && value >= 0 ? roundCents(value) : 0;
  };
  return {
    monthlyExpenses: numeric('monthlyExpenses'),
    emergencyFund: numeric('emergencyFund'),
    imminentObligations: numeric('imminentObligations'),
    activeGoals: Array.isArray(context.activeGoals) ? context.activeGoals : [],
    analysedPeriod: context.analysedPeriod || 'dati disponibili',
  };
}

function allocate(total, context) {
  const obligation = Math.min(total, context.imminentObligations);
  const remainder = roundCents(total - obligation);
  const safetyBoost = context.emergencyFund === 0 ? 0.1 : 0;
  const weights = CATEGORY_DEFINITIONS.map((category) => ({
    ...category,
    weight: category.key === 'necessita' ? 1 : category.baseWeight,
  }));

  if (obligation === 0) {
    const normalTotal = weights.slice(1).reduce((sum, category) => sum + category.weight, 0) + safetyBoost;
    weights[0].weight = 0.35;
    weights[1].weight = 0.25 + safetyBoost;
    const discretionaryTotal = weights.slice(0, 2).reduce((sum, category) => sum + category.weight, 0);
    weights.slice(2).forEach((category) => { category.weight /= normalTotal; });
    const fixed = weights.slice(0, 2).reduce((sum, category) => sum + category.weight, 0);
    weights.slice(2).forEach((category) => { category.weight *= Math.max(0, 1 - fixed); });
  }

  const allocations = CATEGORY_DEFINITIONS.map((category, index) => {
    let amount = 0;
    if (index === 0) amount = obligation;
    else if (obligation === total) amount = 0;
    else if (index === 1) amount = roundCents(remainder * (0.35 + safetyBoost));
    else amount = roundCents(remainder * category.baseWeight);
    return {
      ...category,
      amount,
      percentage: 0,
      reason: category.key === 'sicurezza' && context.emergencyFund === 0
        ? 'Non risulta ancora un fondo di sicurezza registrato.'
        : 'Quota prudente basata sui dati disponibili.',
      dataUsed: ['importo inserito', context.analysedPeriod],
    };
  });
  const distributed = roundCents(allocations.reduce((sum, item) => sum + item.amount, 0));
  allocations[allocations.length - 1].amount = roundCents(allocations.at(-1).amount + total - distributed);
  allocations.forEach((item) => { item.percentage = roundCents((item.amount / total) * 100); });
  return allocations;
}

function createSmartPlan({ amount, recurring = false, context = {} } = {}) {
  const total = validateAmount(amount);
  const normalised = normaliseContext(context);
  const missingData = [];
  if (!normalised.monthlyExpenses) missingData.push('spese medie mensili');
  // Un fondo pari a zero è un dato reale: va prodotta una stima prudenziale,
  // non trattato come informazione mancante. La distinzione tra chiave assente
  // e valore zero evita di degradare l’affidabilità quando l’utente non ha
  // ancora creato il fondo.
  if (!Object.prototype.hasOwnProperty.call(context, 'emergencyFund')) {
    missingData.push('fondo di sicurezza');
  }
  if (!normalised.activeGoals.length) missingData.push('obiettivi attivi');
  const allocations = allocate(total, normalised);
  const scenarioFactors = { prudente: 0.75, bilanciata: 1, ambiziosa: 1.25 };
  const scenarios = Object.entries(scenarioFactors).map(([key, factor]) => {
    const scenarioAllocations = allocations.map((item) => ({ ...item, amount: roundCents(item.amount * factor) }));
    const scenarioTotal = roundCents(scenarioAllocations.reduce((sum, item) => sum + item.amount, 0));
    scenarioAllocations.at(-1).amount = roundCents(scenarioAllocations.at(-1).amount + total - scenarioTotal);
    return { key, label: key[0].toUpperCase() + key.slice(1), allocations: scenarioAllocations, liquidityResidual: roundCents(Math.max(0, total - scenarioAllocations.find((item) => item.key === 'necessita').amount)), safety: key === 'prudente' ? 'alta' : key === 'bilanciata' ? 'media' : 'bassa', advantages: key === 'prudente' ? 'Più liquidità per imprevisti.' : key === 'bilanciata' ? 'Equilibrio tra sicurezza e obiettivi.' : 'Accelera gli obiettivi prioritari.', risks: key === 'ambiziosa' ? 'Minore margine per imprevisti.' : 'Progressione più graduale sugli obiettivi.' };
  });
  const isFallback = missingData.length >= 2;
  const reliability = missingData.length === 0 ? 'alta' : missingData.length <= 1 ? 'media' : 'bassa';
  return {
    total,
    recurring,
    allocations,
    isFallback,
    reliability,
    missingData,
    analysedPeriod: normalised.analysedPeriod,
    warning: normalised.imminentObligations > total
      ? 'La nuova entrata non è sufficiente a coprire gli impegni imminenti.'
      : normalised.imminentObligations > 0
        ? `Prima di destinare denaro agli obiettivi risultano ${normalised.imminentObligations} € di impegni imminenti.`
        : null,
    disclaimer: 'Questa è una simulazione: non sposta denaro, non modifica transazioni o saldi e non è consulenza finanziaria.',
    scenarios,
  };
}

module.exports = { createSmartPlan, SmartPlanValidationError, CATEGORY_DEFINITIONS };
