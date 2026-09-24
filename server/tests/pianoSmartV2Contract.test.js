const { SCENARI_V2, STATI_AZIONE_V2, ORIZZONTI_PROIEZIONE_V2 } = require('../constants/pianoSmartV2');
const { PianoSmartAzione } = require('../models');

describe('Piano Smart V2 contract', () => {
  test('espone tre scenari e tre orizzonti canonici', () => {
    expect(SCENARI_V2).toEqual(['prudente', 'bilanciato', 'ambizioso']);
    expect(ORIZZONTI_PROIEZIONE_V2).toEqual([3, 6, 12]);
  });

  test('espone gli stati delle azioni preparatorie', () => {
    expect(STATI_AZIONE_V2).toEqual(['da_fare', 'completata', 'ignorata']);
  });

  test('registra il modello Sequelize delle azioni', () => {
    expect(PianoSmartAzione).toBeDefined();
    expect(PianoSmartAzione.rawAttributes.plan_id).toBeDefined();
    expect(PianoSmartAzione.rawAttributes.user_id).toBeDefined();
    expect(PianoSmartAzione.rawAttributes.amount).toBeDefined();
    expect(PianoSmartAzione.rawAttributes.status).toBeDefined();
  });
});
