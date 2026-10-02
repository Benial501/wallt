/**
 * La riconciliazione fra una connessione bancaria e i conti che l'utente
 * già possiede. Il punto non è "il collegamento funziona" (lo copre
 * bankSyncApi) ma "il collegamento non duplica lo storico inserito a mano".
 */

const {
  STATO_DA_RICONCILIARE, STATO_ATTIVA, STATI_VIVI, STATI_SINCRONIZZABILI,
  CONNECTION_STATUS,
} = require('../constants/bankSync');

describe('il vocabolario del nuovo stato', () => {
  it('da_riconciliare occupa il posto ma non è sincronizzabile', () => {
    expect(CONNECTION_STATUS).toContain(STATO_DA_RICONCILIARE);
    // Occupa il posto: l'autorizzazione presso la banca esiste già.
    expect(STATI_VIVI).toContain(STATO_DA_RICONCILIARE);
    // Ma niente può partire: è questa appartenenza, non una guardia
    // scritta a mano, che protegge lo storico manuale.
    expect(STATI_SINCRONIZZABILI).not.toContain(STATO_DA_RICONCILIARE);
    expect(STATI_SINCRONIZZABILI).toContain(STATO_ATTIVA);
  });
});
