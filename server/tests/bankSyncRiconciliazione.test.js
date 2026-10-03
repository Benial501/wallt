/**
 * La riconciliazione fra una connessione bancaria e i conti che l'utente
 * già possiede. Il punto non è "il collegamento funziona" (lo copre
 * bankSyncApi) ma "il collegamento non duplica lo storico inserito a mano".
 */

const request = require('supertest');
const { createApp } = require('../app');
const { Conto, BankConnection } = require('../models');
const {
  azzeraConfigurazione, abilitaSandbox, creaUtente, concediEntitlement,
  collegaBanca,
} = require('./helpers/premium');

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

const app = createApp({ enableRateLimit: false });

describe('il callback non decide da solo dove vanno i movimenti', () => {
  let utente;

  beforeEach(async () => {
    azzeraConfigurazione();
    await abilitaSandbox();
    utente = await creaUtente(app);
    await concediEntitlement(utente.userId);
  });

  it('lascia la connessione da riconciliare, senza creare nessun conto', async () => {
    const contiPrima = await Conto.count({ where: { user_id: utente.userId } });

    const { callback } = await collegaBanca(app, utente.headers, { riconcilia: false });

    expect(callback.status).toBe(201);
    const connessione = await BankConnection.findOne({ where: { user_id: utente.userId } });
    expect(connessione.status).toBe(STATO_DA_RICONCILIARE);
    expect(connessione.conto_id).toBeNull();
    // Il conto NON esiste ancora: è la differenza con il comportamento
    // precedente, dove il collegamento ne creava uno a prescindere.
    expect(await Conto.count({ where: { user_id: utente.userId } })).toBe(contiPrima);

    // Il callback scrive ciò che descrive l'AUTORIZZAZIONE e la BANCA (già
    // note, indipendenti da quale conto l'utente scelga), non ciò che
    // descrive il CONTO (ancora da scegliere in `completaRiconciliazione`).
    expect(connessione.provider_connection_id).not.toBeNull();
    expect(connessione.institution_name).toBe('Banca di Prova');
    expect(connessione.provider_account_id).toBeNull();
    expect(connessione.iban_mascherato).toBeNull();
    expect(connessione.valuta).toBeNull();
    expect(connessione.saldo_provider).toBeNull();
  });

  it('nessuna sincronizzazione parte da da_riconciliare', async () => {
    await collegaBanca(app, utente.headers, { riconcilia: false });

    const sync = await request(app)
      .post('/api/bank-sync/sync')
      .set(utente.headers)
      .send({});

    // 404 e non 409: `sincronizza()` (syncEngine.service.js, fuori dal
    // perimetro di questo task) filtra già `STATI_SINCRONIZZABILI` nella
    // query quando non le viene passato un `connectionId` esplicito — come
    // già faceva per `in_attesa`, `consenso_scaduto` e
    // `sospesa_entitlement`. Nessuna riga `da_riconciliare` la soddisfa,
    // quindi la connessione risulta "non trovata", non "in conflitto". Il
    // punto del test — che la sincronizzazione non parte — resta verificato.
    expect(sync.status).toBe(404);
    const connessione = await BankConnection.findOne({ where: { user_id: utente.userId } });
    expect(connessione.last_sync_at).toBeNull();
  });

  it('un secondo callback con lo stesso state, da da_riconciliare, è idempotente', async () => {
    const { state } = await collegaBanca(app, utente.headers, { riconcilia: false });

    // Stesso state, ricevuto una seconda volta prima ancora che l'utente
    // abbia scelto il conto (es. refresh della pagina di ritorno dalla
    // banca): deve tornare la connessione esistente, non un errore di
    // state riusato.
    const ripetuto = await request(app)
      .post('/api/bank-sync/callback')
      .set(utente.headers)
      .send({ state });

    expect(ripetuto.status).toBe(200);
    expect(ripetuto.body.ripetuto).toBe(true);
    expect(await BankConnection.count({ where: { user_id: utente.userId } })).toBe(1);
  });
});
