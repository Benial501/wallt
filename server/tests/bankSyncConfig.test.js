const {
  BANK_SYNC_CRON_ENABLED,
  BANK_SYNC_CRON_ORE_MINIME,
  valoreDefault,
} = require('../constants/appConfig');

describe('configurazione sincronizzazione bancaria pianificata', () => {
  it('è attiva con intervallo minimo di sei ore', () => {
    expect(valoreDefault(BANK_SYNC_CRON_ENABLED)).toBe(true);
    expect(valoreDefault(BANK_SYNC_CRON_ORE_MINIME)).toBe(6);
  });
});
