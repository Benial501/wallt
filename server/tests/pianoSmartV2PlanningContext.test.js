const { buildPlanningContext } = require('../services/pianoSmartV2/planningContext.service');
const { contestoFinto, contestoNuovoUtente } = require('./helpers/pianoSmartContesto');

describe('Piano Smart V2 planning context', () => {
  test('sottrae obblighi e riserva osservata dal capitale ricevuto', () => {
    const result = buildPlanningContext({
      context: contestoFinto(),
      input: { amountCents: 100000, mandatoryCents: 10000, recurring: false },
    });
    expect(result.capital).toMatchObject({
      receivedCents: 100000,
      mandatoryCents: 10000,
      minimumReserveCents: 160000,
      reserveSource: 'observed',
      distributableCents: 0,
    });
  });

  test('stima tre mesi essenziali quando il fondo non è configurato', () => {
    const context = contestoNuovoUtente();
    context.emergencyFund = { status: 'assente', current: null, target: null, missingAmount: null };
    context.expenses.byNecessity.essential.monthlyAverage = 800;
    const result = buildPlanningContext({
      context,
      input: { amountCents: 100000, mandatoryCents: 10000, recurring: false },
    });
    expect(result.capital.minimumReserveCents).toBe(240000);
    expect(result.capital.reserveSource).toBe('estimated');
  });

  test('non inventa la riserva quando mancano anche le spese', () => {
    const result = buildPlanningContext({
      context: contestoNuovoUtente(),
      input: { amountCents: 100000, mandatoryCents: 10000, recurring: false },
    });
    expect(result.capital.minimumReserveCents).toBeNull();
    expect(result.capital.reserveSource).toBe('unavailable');
    expect(result.capital.distributableCents).toBe(90000);
  });
});
