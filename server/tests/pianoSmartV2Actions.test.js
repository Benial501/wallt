const { createActions } = require('../services/pianoSmartV2/action.service');

test('genera azioni preparatorie ordinate e non più di cinque', () => {
  const actions = createActions({
    scenario: { allocations: [
      { category: 'safety', amountCents: 30000, destinationType: 'fondo_sicurezza' },
      { category: 'goals', amountCents: 25000, destinationType: 'obiettivo', destinationId: 4 },
      { category: 'freedom', amountCents: 10000, destinationType: 'liquidita_libera' },
    ] },
    planningContext: {},
    projection: {},
  });
  expect(actions.length).toBeLessThanOrEqual(5);
  expect(actions[0]).toEqual(expect.objectContaining({ status: 'da_fare', amountCents: expect.any(Number) }));
});
