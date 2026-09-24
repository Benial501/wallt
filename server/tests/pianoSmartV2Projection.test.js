const { projectScenario } = require('../services/pianoSmartV2/projection.service');
const { contestoFinto, contestoNuovoUtente } = require('./helpers/pianoSmartContesto');

const scenario = { id: 'bilanciato', allocations: [{ category: 'goals', amountCents: 20000 }] };

describe('Piano Smart V2 projection', () => {
  test('proietta una tantum e ricorrente sugli orizzonti canonici', () => {
    const result = projectScenario({
      scenario,
      planningContext: { capital: { recurring: true } },
      financialContext: contestoFinto(),
      horizons: [3, 6, 12],
    });
    expect(Object.keys(result)).toEqual(['3', '6', '12']);
    expect(result[3].savingsCumulative).toBeGreaterThan(result[12].savingsCumulative / 5);
  });

  test('dichiara non stimabile il risparmio senza storico sufficiente', () => {
    const result = projectScenario({
      scenario,
      planningContext: { capital: { recurring: false } },
      financialContext: contestoNuovoUtente(),
      horizons: [3],
    });
    expect(result[3].status).toBe('non_stimabile');
    expect(result[3].reason).toMatch(/storico/i);
  });
});
