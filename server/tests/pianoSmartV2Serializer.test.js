const { serializePreview } = require('../services/pianoSmartV2/serializer');

describe('serializzatore Piano Smart V2', () => {
  test('serializza le azioni per ogni scenario selezionabile', () => {
    const azione = (actionKey) => ({ actionKey, amountCents: 1234 });
    const result = serializePreview({
      planningContext: { capital: {}, situation: {}, dataQuality: {}, warnings: [] },
      scenarios: [], projections: {},
      actions: [azione('azione-bilanciata')],
      actionsByScenario: {
        prudente: [azione('azione-prudente')],
        bilanciato: [azione('azione-bilanciata')],
        ambizioso: [azione('azione-ambiziosa')],
      },
    });

    expect(result.actionsByScenario.ambizioso[0]).toMatchObject({ actionKey: 'azione-ambiziosa', amount: '12.34' });
  });
});
