const { generateScenarios, validateScenarioSelection } = require('../services/pianoSmartV2/scenario.service');
const { contestoFinto } = require('./helpers/pianoSmartContesto');

const context = contestoFinto();
const planningContext = {
  capital: { distributableCents: 100000 },
  situation: {}, dataQuality: {}, warnings: [],
};

describe('Piano Smart V2 scenarios', () => {
  test('genera prudente, bilanciato e ambizioso con somme esatte', () => {
    const result = generateScenarios({ planningContext, financialContext: context });
    expect(result.map((scenario) => scenario.id)).toEqual(['prudente', 'bilanciato', 'ambizioso']);
    result.forEach((scenario) => {
      expect(scenario.allocations.reduce((sum, item) => sum + item.amountCents, 0)).toBe(100000);
      expect(scenario.allocations.every((item) => item.amountCents >= 0)).toBe(true);
    });
  });

  test('espone la destinazione dell’obiettivo e non duplica la sicurezza', () => {
    const scenarios = generateScenarios({ planningContext, financialContext: context });
    scenarios.forEach((scenario) => {
      const safety = scenario.allocations.filter((item) => item.destinationType === 'fondo_sicurezza');
      const goals = scenario.allocations.filter((item) => item.destinationType === 'obiettivo');
      expect(safety.length).toBeLessThanOrEqual(1);
      goals.forEach((item) => expect(item.destinationId).toBe(1));
    });
  });

  test('valida la scelta contro lo snapshot e rifiuta importi incoerenti', () => {
    const scenario = generateScenarios({ planningContext, financialContext: context })[1];
    expect(validateScenarioSelection({ scenario, allocations: scenario.allocations, snapshot: { distributableCents: 100000 } })).toEqual({ valid: true, errors: [] });
    expect(validateScenarioSelection({ scenario, allocations: [{ ...scenario.allocations[0], amountCents: 1 }], snapshot: { distributableCents: 100000 } }).valid).toBe(false);
  });
});
