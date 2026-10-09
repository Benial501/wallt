const {
  BANK_SYNC_CRON_ENABLED,
  BANK_SYNC_CRON_ORE_MINIME,
  BANK_SYNC_MANUALI_AL_GIORNO,
  valoreDefault,
} = require('../constants/appConfig');

describe('configurazione sincronizzazione bancaria pianificata', () => {
  it('è attiva, con un intervallo minimo che non ostacola il passaggio notturno', () => {
    expect(valoreDefault(BANK_SYNC_CRON_ENABLED)).toBe(true);
    expect(valoreDefault(BANK_SYNC_CRON_ORE_MINIME)).toBe(1);
  });

  it('il tetto delle sincronizzazioni manuali è due al giorno', () => {
    // Il numero sta in configurazione e non nel codice: è il valore che
    // l'interfaccia mostra all'utente e quello che il motore applica.
    expect(valoreDefault(BANK_SYNC_MANUALI_AL_GIORNO)).toBe(2);
  });
});
