const { ripartisciCentesimi } = require('../pianoSmart/money');
const { SCENARI_V2 } = require('../../constants/pianoSmartV2');

const ORDINE = ['needs', 'safety', 'goals', 'future', 'freedom'];
const PESI = {
  prudente: { needs: 30, safety: 35, goals: 15, future: 10, freedom: 10 },
  bilanciato: { needs: 25, safety: 25, goals: 25, future: 15, freedom: 10 },
  ambizioso: { needs: 20, safety: 15, goals: 35, future: 20, freedom: 10 },
};

const generateScenarios = ({ planningContext, financialContext }) => {
  const total = planningContext.capital.distributableCents;
  const goal = (financialContext.goals || []).find((item) => item.stato !== 'completato' && item.importo_restante > 0);
  return SCENARI_V2.map((id) => {
    const weights = { ...PESI[id] };
    const raw = ripartisciCentesimi(weights, total, ORDINE);
    const allocations = ORDINE.map((category) => {
      const destination = category === 'safety'
        ? { destinationType: 'fondo_sicurezza', destinationId: null }
        : category === 'goals' && goal
          ? { destinationType: 'obiettivo', destinationId: goal.id }
          : { destinationType: category === 'freedom' ? 'liquidita_libera' : category };
      return { category, amountCents: raw[category], percentage: total ? Math.round((raw[category] / total) * 10000) / 100 : null, ...destination };
    });
    return {
      id,
      label: id[0].toUpperCase() + id.slice(1),
      recommended: id === 'bilanciato',
      allocations,
      advantages: id === 'prudente' ? ['Riduce il rischio e protegge la liquidità.'] : id === 'ambizioso' ? ['Accelera obiettivi e futuro.'] : ['Bilancia sicurezza e crescita.'],
      risks: id === 'ambizioso' ? ['Lascia meno margine libero nel breve periodo.'] : [],
      effects: { months: [3, 6, 12], sourceRecurring: Boolean(planningContext.capital.recurring) },
      reasonCodes: [`SCENARIO_${id.toUpperCase()}`],
    };
  });
};

const validateScenarioSelection = ({ allocations, snapshot }) => {
  const errors = [];
  if (!Array.isArray(allocations) || allocations.length !== ORDINE.length) errors.push('Allocazioni scenario incomplete.');
  const total = (allocations || []).reduce((sum, item) => sum + (Number.isInteger(item.amountCents) ? item.amountCents : 0), 0);
  if (total !== snapshot.distributableCents) errors.push('La somma delle allocazioni non coincide con il capitale distribuibile.');
  if ((allocations || []).some((item) => item.amountCents < 0)) errors.push('Le allocazioni non possono essere negative.');
  return { valid: errors.length === 0, errors };
};

module.exports = { generateScenarios, validateScenarioSelection };
