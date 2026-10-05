/**
 * La riconciliazione fra una connessione bancaria e i conti che l'utente
 * già possiede. Il punto non è "il collegamento funziona" (lo copre
 * bankSyncApi) ma "il collegamento non duplica lo storico inserito a mano".
 */

const request = require('supertest');
const { createApp } = require('../app');
const { Conto, BankConnection, Movimento, AuditLog } = require('../models');
const { datiRiconciliazione } = require('../services/bankSync/connections.service');
const {
  sincronizza, dataSuggeritaImport,
} = require('../services/bankSync/syncEngine.service');
const { processaSincronizzazioniPianificate } = require('../services/bankSync/cronSync.service');
const SandboxBankProvider = require('../services/bankSync/providers/SandboxBankProvider');
const {
  azzeraConfigurazione, abilitaSandbox, creaUtente, concediEntitlement,
  collegaBanca,
} = require('./helpers/premium');

const {
  STATO_DA_RICONCILIARE, STATO_ATTIVA, STATI_VIVI, STATI_SINCRONIZZABILI,
  CONNECTION_STATUS, ERR_SOGLIA_RICHIESTA, ORIGINE_OPEN_BANKING,
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

describe('GET /bank-sync/riconciliazione', () => {
  let utente;

  beforeEach(async () => {
    azzeraConfigurazione();
    await abilitaSandbox();
    utente = await creaUtente(app);
    await concediEntitlement(utente.userId);
  });

  it('offre i conti della banca e i conti agganciabili', async () => {
    const mio = await Conto.create({
      user_id: utente.userId, nome: 'REVOLUT', tipo: 'app_pagamento', saldo: 42, attivo: true,
    });
    await collegaBanca(app, utente.headers, { riconcilia: false });

    const r = await request(app).get('/api/bank-sync/riconciliazione').set(utente.headers);

    expect(r.status).toBe(200);
    expect(r.body.conti_banca.length).toBeGreaterThan(0);
    expect(r.body.conti_banca[0]).toHaveProperty('provider_account_id');
    expect(r.body.conti_wallt.map((c) => c.id)).toContain(mio.id);
  });

  it('il conto della banca ha un nome e un IBAN, non solo un id (Task 4-bis)', async () => {
    // Sulla sandbox `getAccounts` ha sempre fabbricato dati ricchi: questa
    // asserzione da sola non avrebbe colto il difetto del provider vero
    // (Enable Banking), dove `getAccounts({accountIds})` restituisce nome e
    // IBAN a `null`. È `getConnectionStatus` + l'unione in `contiDellaBanca`
    // a doverli portare, e il test diretto su quella forma sta in
    // `enableBankingProvider.test.js`, che gira senza passare dalla sandbox.
    await collegaBanca(app, utente.headers, { riconcilia: false });

    const r = await request(app).get('/api/bank-sync/riconciliazione').set(utente.headers);

    expect(r.status).toBe(200);
    const [conto] = r.body.conti_banca;
    expect(conto.nome).not.toBeNull();
    expect(conto.iban_mascherato).not.toBeNull();
    // Il saldo deve restare valorizzato: l'unione non deve aver sostituito
    // la fonte del saldo con quella (sulla sessione) che lo dichiara sempre
    // `null`.
    expect(conto.saldo).not.toBeNull();
  });

  it('unisce le due fonti per campo: nome/IBAN dalla sessione, saldo da getAccounts, senza che una vinca sull\'altra', async () => {
    // Un provider finto con le due fonti deliberatamente divergenti, come lo
    // è Enable Banking sul vero: la sessione ha i campi descrittivi e saldo
    // `null`, `getAccounts` ha solo il saldo. Sulla sandbox le due fonti
    // sarebbero sempre identiche fra loro (`getConnectionStatus` sandbox
    // costruisce `conti` chiamando `getAccounts`) e non distinguerebbero
    // "l'unione funziona" da "una fonte ha vinto per caso perché erano
    // uguali": qui invece se il merge sostituisse la sessione con
    // `getAccounts` (o viceversa) l'assenza di nome/IBAN o di saldo lo
    // renderebbe visibile.
    await BankConnection.create({
      // Il valore deve rispettare il CHECK della colonna; non importa quale
      // dei tre sia, perché il provider FINTO qui sotto viene passato
      // esplicitamente a `datiRiconciliazione` e la fabbrica non lo cerca mai.
      user_id: utente.userId,
      provider: 'sandbox',
      institution_id: 'FINTA_BANCA',
      institution_name: 'Finta Banca',
      provider_connection_id: 'sess-finta-1',
      status: STATO_DA_RICONCILIARE,
    });

    const providerFinto = {
      async getConnectionStatus() {
        return {
          stato: 'attiva',
          accountIds: ['acc-finto-1'],
          conti: [{
            providerAccountId: 'acc-finto-1',
            nome: 'Conto Sessione',
            ibanMascherato: 'IT•••0000',
            valuta: 'EUR',
            saldo: null,
            istituto: { id: null, nome: 'Finta Banca' },
          }],
        };
      },
      async getAccounts() {
        return [{
          providerAccountId: 'acc-finto-1',
          nome: null,
          ibanMascherato: null,
          valuta: null,
          saldo: 999.5,
          istituto: { id: null, nome: null },
        }];
      },
    };

    const esito = await datiRiconciliazione(utente.userId, { provider: providerFinto });

    expect(esito.conti_banca).toHaveLength(1);
    expect(esito.conti_banca[0]).toMatchObject({
      provider_account_id: 'acc-finto-1',
      nome: 'Conto Sessione',
      iban_mascherato: 'IT•••0000',
      saldo: 999.5,
    });
  });

  it('se la sessione non ha i campi descrittivi, il merge ripiega su getAccounts (caso GoCardless)', async () => {
    // Il test precedente prova che la sessione vince quando è ricca — ma è
    // sempre lei la fonte ricca in quel caso, quindi non esercita mai il
    // ramo `?? daAccounts?.nome` di `contiDellaBanca`. Quel ramo esiste
    // proprio per GoCardless: la sua requisition non porta nome/IBAN/valuta
    // (vengono scritti a `null` in `getConnectionStatus`, GoCardlessBankProvider.js),
    // mentre il suo `getAccounts` li ha sempre avuti (due chiamate per conto,
    // non toccate da questo task). Senza un test in questa direzione, un
    // refactor che invertisse l'ordine del `??`, o che usasse `||` (trattando
    // una stringa vuota come assente), non verrebbe colto da nessuna suite:
    // né questa (sessione sempre ricca) né enableBankingProvider.test.js
    // (Enable Banking non ha mai bisogno del ripiego, perché la sua sessione
    // è sempre quella ricca).
    await BankConnection.create({
      user_id: utente.userId,
      provider: 'gocardless',
      institution_id: 'FINTA_BANCA_2',
      institution_name: 'Finta Banca 2',
      provider_connection_id: 'req-finta-2',
      status: STATO_DA_RICONCILIARE,
    });

    const providerFinto = {
      async getConnectionStatus() {
        // Forma reale di GoCardlessBankProvider.getConnectionStatus dopo
        // questo task: `conti` esiste (contratto rispettato) ma è uno stub,
        // perché la requisition non ha dati descrittivi senza una chiamata
        // HTTP in più.
        return {
          stato: 'attiva',
          accountIds: ['acc-finto-2'],
          conti: [{
            providerAccountId: 'acc-finto-2',
            nome: null,
            ibanMascherato: null,
            valuta: null,
            saldo: null,
            istituto: { id: null, nome: null },
          }],
        };
      },
      async getAccounts() {
        // Forma reale di GoCardlessBankProvider.getAccounts: ricca, perché
        // legge /accounts/{id}/details/ e /accounts/{id}/balances/.
        return [{
          providerAccountId: 'acc-finto-2',
          nome: 'Conto GoCardless',
          ibanMascherato: 'IT•••1111',
          valuta: 'EUR',
          saldo: 42.1,
          istituto: { id: null, nome: null },
        }];
      },
    };

    const esito = await datiRiconciliazione(utente.userId, { provider: providerFinto });

    expect(esito.conti_banca).toHaveLength(1);
    expect(esito.conti_banca[0]).toMatchObject({
      provider_account_id: 'acc-finto-2',
      nome: 'Conto GoCardless',
      iban_mascherato: 'IT•••1111',
      valuta: 'EUR',
      saldo: 42.1,
    });
  });

  it('esclude il fondo di emergenza e i conti scommesse', async () => {
    await Conto.create({
      user_id: utente.userId, nome: 'Fondo', tipo: 'emergenza', saldo: 0,
      attivo: true, nascosto: true, mesi_sicurezza_target: 3,
    });
    await Conto.create({
      user_id: utente.userId, nome: 'Snai', tipo: 'scommesse', saldo: 0, attivo: true,
    });
    await collegaBanca(app, utente.headers, { riconcilia: false });

    const r = await request(app).get('/api/bank-sync/riconciliazione').set(utente.headers);

    const tipi = r.body.conti_wallt.map((c) => c.tipo);
    expect(tipi).not.toContain('emergenza');
    expect(tipi).not.toContain('scommesse');
  });

  it('409 se la connessione non è da riconciliare', async () => {
    const r = await request(app).get('/api/bank-sync/riconciliazione').set(utente.headers);
    expect(r.status).toBe(409);
  });
});

describe('POST /bank-sync/riconciliazione', () => {
  let utente;

  const riconcilia = (headers, corpo) => request(app)
    .post('/api/bank-sync/riconciliazione').set(headers).send(corpo);

  /** Il conto che la banca espone: si legge dalla sessione, non si inventa. */
  const primoContoBanca = async (headers) => {
    const r = await request(app).get('/api/bank-sync/riconciliazione').set(headers);
    if (r.status !== 200) throw new Error(`GET riconciliazione: ${r.status}`);
    return r.body.conti_banca[0].provider_account_id;
  };

  beforeEach(async () => {
    azzeraConfigurazione();
    await abilitaSandbox();
    utente = await creaUtente(app);
    await concediEntitlement(utente.userId);
  });

  it('agganciando un conto esistente non perde i suoi movimenti', async () => {
    const mio = await Conto.create({
      user_id: utente.userId, nome: 'REVOLUT', tipo: 'app_pagamento', saldo: 42, attivo: true,
    });
    await Movimento.create({
      user_id: utente.userId, conto_id: mio.id, tipo: 'uscita', importo: 10,
      categoria: 'spesa_quotidiana', descrizione: 'inserito a mano',
      data: '2026-09-01', ricorrente: false,
    });
    await collegaBanca(app, utente.headers, { riconcilia: false });

    const r = await riconcilia(utente.headers, {
      provider_account_id: await primoContoBanca(utente.headers),
      destinazione: mio.id,
    });

    expect(r.status).toBe(200);
    expect(r.body.creato).toBe(false);
    const connessione = await BankConnection.findOne({ where: { user_id: utente.userId } });
    expect(connessione.status).toBe(STATO_ATTIVA);
    expect(connessione.conto_id).toBe(mio.id);
    // Nessun conto nuovo, nessun movimento perso, id invariato.
    expect(await Conto.count({ where: { user_id: utente.userId } })).toBe(1);
    expect(await Movimento.count({ where: { conto_id: mio.id } })).toBe(1);

    // Il conto è lo STESSO conto: nome e saldo non vengono riscritti dalla
    // banca. Il saldo lo allinea la prima sincronizzazione (`allineaSaldo`),
    // che è già l'unico punto che fa quel lavoro: se la riconciliazione lo
    // scrivesse anche lei, il saldo della sandbox (2345.67) comparirebbe qui.
    const dopo = await Conto.findByPk(mio.id);
    expect(dopo.nome).toBe('REVOLUT');
    expect(Number(dopo.saldo)).toBe(42);
  });

  it('creando un conto nuovo lo nomina come la banca, non come l\'intestatario', async () => {
    await collegaBanca(app, utente.headers, { riconcilia: false });

    const r = await riconcilia(utente.headers, {
      provider_account_id: await primoContoBanca(utente.headers),
      destinazione: 'nuovo',
    });

    expect(r.status).toBe(201);
    expect(r.body.creato).toBe(true);
    const conto = await Conto.findByPk(r.body.conto.id);
    const connessione = await BankConnection.findOne({ where: { user_id: utente.userId } });
    expect(conto.nome).toBe(connessione.institution_name);
    // Enable Banking mette in `name` il nome del TITOLARE del conto: la
    // sandbox imita quel difetto con «Conto di Prova», e il nome della banca
    // («Banca di Prova») deve vincere su di esso.
    expect(conto.nome).toBe('Banca di Prova');
    expect(conto.tipo).toBe('banca');
    // Su un conto NUOVO il saldo iniziale lo mette la creazione: è la banca
    // la fonte di verità, e non c'è nessuno storico da preservare.
    expect(Number(conto.saldo)).toBe(2345.67);
  });

  it('il conto nuovo non nasce con un movimento «Saldo iniziale» inventato', async () => {
    await collegaBanca(app, utente.headers, { riconcilia: false });

    await riconcilia(utente.headers, {
      provider_account_id: await primoContoBanca(utente.headers),
      destinazione: 'nuovo',
    });

    // `createConto` (conti.controller.js) genera un'entrata «Saldo iniziale»
    // quando il saldo è positivo. Per un conto bancario sarebbe un'entrata
    // INVENTATA: falserebbe le medie di reddito, i budget e Piano Smart. Per
    // questo la riconciliazione usa `Conto.create` e non quel percorso.
    expect(await Movimento.count({ where: { user_id: utente.userId } })).toBe(0);
  });

  it('rifiuta il conto di un altro utente', async () => {
    const altro = await creaUtente(app, { email: 'altro@wallt.test' });
    const suo = await Conto.create({
      user_id: altro.userId, nome: 'Suo', tipo: 'banca', saldo: 0, attivo: true,
    });
    await collegaBanca(app, utente.headers, { riconcilia: false });

    const r = await riconcilia(utente.headers, {
      provider_account_id: await primoContoBanca(utente.headers),
      destinazione: suo.id,
    });

    expect(r.status).toBe(404);
    expect(await BankConnection.count({
      where: { user_id: utente.userId, conto_id: suo.id },
    })).toBe(0);
    // Il rifiuto non consuma il tentativo: la connessione resta associabile.
    const connessione = await BankConnection.findOne({ where: { user_id: utente.userId } });
    expect(connessione.status).toBe(STATO_DA_RICONCILIARE);
    expect(connessione.conto_id).toBeNull();
  });

  it('rifiuta il fondo di emergenza', async () => {
    const fondo = await Conto.create({
      user_id: utente.userId, nome: 'Fondo', tipo: 'emergenza', saldo: 0,
      attivo: true, nascosto: true, mesi_sicurezza_target: 3,
    });
    await collegaBanca(app, utente.headers, { riconcilia: false });

    const r = await riconcilia(utente.headers, {
      provider_account_id: await primoContoBanca(utente.headers),
      destinazione: fondo.id,
    });

    expect(r.status).toBe(422);
    expect(await BankConnection.count({
      where: { user_id: utente.userId, conto_id: fondo.id },
    })).toBe(0);
  });

  it('rifiuta un conto scommesse', async () => {
    const gioco = await Conto.create({
      user_id: utente.userId, nome: 'Snai', tipo: 'scommesse', saldo: 0, attivo: true,
    });
    await collegaBanca(app, utente.headers, { riconcilia: false });

    const r = await riconcilia(utente.headers, {
      provider_account_id: await primoContoBanca(utente.headers),
      destinazione: gioco.id,
    });

    expect(r.status).toBe(422);
  });

  it('rifiuta un provider_account_id che la sessione non espone', async () => {
    await collegaBanca(app, utente.headers, { riconcilia: false });

    const r = await riconcilia(utente.headers, {
      provider_account_id: 'inventato-da-un-client-ostile',
      destinazione: 'nuovo',
    });

    expect(r.status).toBe(422);
    // Niente è stato creato né associato: un client ostile non aggancia un
    // conto arbitrario facendo leva su un id che si è inventato.
    expect(await Conto.count({ where: { user_id: utente.userId } })).toBe(0);
    const connessione = await BankConnection.findOne({ where: { user_id: utente.userId } });
    expect(connessione.status).toBe(STATO_DA_RICONCILIARE);
  });

  it('chiamata due volte è idempotente', async () => {
    await collegaBanca(app, utente.headers, { riconcilia: false });
    const id = await primoContoBanca(utente.headers);

    const prima = await riconcilia(utente.headers, { provider_account_id: id, destinazione: 'nuovo' });
    const dopo = await riconcilia(utente.headers, { provider_account_id: id, destinazione: 'nuovo' });

    expect(prima.status).toBe(201);
    expect(dopo.status).toBe(200);
    expect(dopo.body.creato).toBe(false);
    expect(await Conto.count({ where: { user_id: utente.userId } })).toBe(1);
  });

  it('tre richieste simultanee creano UN conto solo', async () => {
    await collegaBanca(app, utente.headers, { riconcilia: false });
    const id = await primoContoBanca(utente.headers);
    const corpo = { provider_account_id: id, destinazione: 'nuovo' };

    const esiti = await Promise.all([
      riconcilia(utente.headers, corpo),
      riconcilia(utente.headers, corpo),
      riconcilia(utente.headers, corpo),
    ]);

    // Senza il lock di riga dentro la transazione le tre richieste leggono
    // tutte `da_riconciliare`, creano tre conti e la connessione ne tiene
    // uno: gli altri due resterebbero orfani nel patrimonio dell'utente,
    // cioè il doppio conteggio che questa rotta esiste per evitare.
    expect(await Conto.count({ where: { user_id: utente.userId } })).toBe(1);
    expect(esiti.filter((r) => r.status === 201)).toHaveLength(1);
    expect(esiti.filter((r) => r.status === 200)).toHaveLength(2);

    const connessione = await BankConnection.findOne({ where: { user_id: utente.userId } });
    const conto = await Conto.findOne({ where: { user_id: utente.userId } });
    expect(connessione.conto_id).toBe(conto.id);
  });

  it('registra in audit a quale conto è stata legata la banca', async () => {
    const mio = await Conto.create({
      user_id: utente.userId, nome: 'REVOLUT', tipo: 'app_pagamento', saldo: 42, attivo: true,
    });
    await collegaBanca(app, utente.headers, { riconcilia: false });

    await riconcilia(utente.headers, {
      provider_account_id: await primoContoBanca(utente.headers),
      destinazione: mio.id,
    });

    // `bank_connection_created` racconta che l'autorizzazione esiste; questo
    // racconta la decisione che tocca i dati dell'utente. Sono due fatti
    // distinti e devono restare due righe distinte.
    const righe = await AuditLog.findAll({
      where: { user_id: utente.userId, evento: 'bank_connection_linked' },
    });
    expect(righe).toHaveLength(1);
    expect(righe[0].metadata.conto_id).toBe(mio.id);
    expect(righe[0].metadata.conto_creato).toBe(false);
    expect(await AuditLog.count({
      where: { user_id: utente.userId, evento: 'bank_connection_created' },
    })).toBe(1);
  });

  it('l\'audit dell\'associazione non contiene saldi né IBAN', async () => {
    await collegaBanca(app, utente.headers, { riconcilia: false });

    await riconcilia(utente.headers, {
      provider_account_id: await primoContoBanca(utente.headers),
      destinazione: 'nuovo',
    });

    const riga = await AuditLog.findOne({
      where: { user_id: utente.userId, evento: 'bank_connection_linked' },
    });
    expect(riga.metadata.conto_creato).toBe(true);
    // Regola 17 applicata all'audit: `audit_logs` è leggibile dall'area
    // amministrativa, quindi vale la stessa riservatezza della push.
    const testo = JSON.stringify(riga.metadata);
    expect(testo).not.toContain('2345.67');
    expect(testo).not.toContain('IT•••3456');
    expect(testo).not.toContain('IT60X0542811101000000123456');
    expect(riga.metadata).not.toHaveProperty('saldo');
    expect(riga.metadata).not.toHaveProperty('iban_mascherato');
  });

  it('409 se non c\'è nessun collegamento da associare', async () => {
    const r = await riconcilia(utente.headers, {
      provider_account_id: 'qualunque', destinazione: 'nuovo',
    });

    expect(r.status).toBe(409);
    expect(r.body.codice).toBe('nessuna_riconciliazione_pendente');
  });

  it('senza entitlement la rotta è chiusa', async () => {
    const senzaPermesso = await creaUtente(app, { email: 'senza@wallt.test' });

    const r = await riconcilia(senzaPermesso.headers, {
      provider_account_id: 'qualunque', destinazione: 'nuovo',
    });

    expect(r.status).toBe(403);
  });
});

/**
 * La soglia di importazione: da quando sincronizzare.
 *
 * I task precedenti hanno fatto in modo che collegare una banca non crei un
 * conto duplicato. Qui si decide l'altra metà: DA QUANDO importare. Senza
 * soglia la sincronizzazione porta dentro la sua finestra intera e le spese
 * che l'utente ha già inserito a mano entrano una seconda volta — ed è
 * successo in produzione, con il cron, su 30 movimenti.
 *
 * La deduplica non può accorgersene: il livello 2 filtra per
 * `bank_connection_id`, nullo sui movimenti manuali, e il livello 3 si
 * applica solo alle transazioni senza id stabile.
 */
describe('la soglia di importazione (da quando importare)', () => {
  let utente;

  const giorniDaOggi = (giorni) => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + giorni);
    return d.toISOString().slice(0, 10);
  };

  const sync = (corpo = {}) => request(app)
    .post('/api/bank-sync/sync').set(utente.headers).send(corpo);

  const laConnessione = () => BankConnection.findOne({ where: { user_id: utente.userId } });

  /** Un conto con storico inserito a mano, come chi usa WALLT da mesi. */
  const contoConStorico = async (date) => {
    const conto = await Conto.create({
      user_id: utente.userId, nome: 'REVOLUT', tipo: 'app_pagamento', saldo: 100, attivo: true,
    });
    for (const data of date) {
      // eslint-disable-next-line no-await-in-loop
      await Movimento.create({
        user_id: utente.userId, conto_id: conto.id, tipo: 'uscita', importo: 10,
        categoria: 'spesa_quotidiana', descrizione: 'inserito a mano', data, ricorrente: false,
      });
    }
    return conto;
  };

  beforeEach(async () => {
    azzeraConfigurazione();
    await abilitaSandbox();
    utente = await creaUtente(app);
    await concediEntitlement(utente.userId);
  });

  it('il primo Sincronizza manuale su uno storico esistente chiede da quando, e non importa niente', async () => {
    const conto = await contoConStorico([giorniDaOggi(-40), giorniDaOggi(-5)]);
    await collegaBanca(app, utente.headers, { destinazione: conto.id });

    const res = await sync();

    expect(res.status).toBe(409);
    expect(res.body.codice).toBe(ERR_SOGLIA_RICHIESTA);
    // I dettagli sono ANNIDATI da `rispondiErrore`: è la forma del corpo,
    // accertata sul controller e non supposta.
    expect(res.body.dettagli.data_suggerita).toBe(giorniDaOggi(-4));
    expect(res.body.dettagli.movimenti_preesistenti).toBe(2);
    // Il messaggio parla a una persona, non a un programma.
    expect(res.body.message).toMatch(/da quando importare/i);

    // NIENTE è entrato: è la proprietà che questo task esiste per garantire.
    expect(await Movimento.count({
      where: { user_id: utente.userId, origine: ORIGINE_OPEN_BANKING },
    })).toBe(0);
    expect(await Movimento.count({ where: { user_id: utente.userId } })).toBe(2);

    // È una domanda, non un guasto: la connessione non va marcata in errore.
    const connessione = await laConnessione();
    expect(connessione.status).toBe(STATO_ATTIVA);
    expect(connessione.error_code).toBeNull();
    expect(connessione.last_error_at).toBeNull();
    expect(connessione.import_da).toBeNull();
  });

  it('la data suggerita non guarda i movimenti futuri', async () => {
    // Una spesa programmata già registrata in avanti produrrebbe un
    // suggerimento oltre oggi, cioè «non importare niente».
    const conto = await contoConStorico([giorniDaOggi(-5), giorniDaOggi(+20)]);
    await collegaBanca(app, utente.headers, { destinazione: conto.id });

    const res = await sync();

    expect(res.status).toBe(409);
    expect(res.body.dettagli.data_suggerita).toBe(giorniDaOggi(-4));
  });

  it('se il conto di destinazione è vuoto la soglia arriva dallo storico degli altri conti', async () => {
    // Chi crea un conto nuovo per la banca ha comunque storico altrove: il
    // rischio di doppio conteggio è cross-conto, non per conto.
    await contoConStorico([giorniDaOggi(-7)]);
    await collegaBanca(app, utente.headers, { destinazione: 'nuovo' });

    const res = await sync();

    expect(res.status).toBe(409);
    expect(res.body.dettagli.data_suggerita).toBe(giorniDaOggi(-6));
  });

  it('il cron salta la prima sincronizzazione senza soglia: niente importato, nessun errore scritto', async () => {
    // È il test che impedisce il problema trovato in produzione. Per il cron
    // non c'è nessuno a cui chiedere la data, e marcare errore ogni sei ore
    // mostrerebbe «da sistemare» su una funzione che aspetta una scelta.
    const conto = await contoConStorico([giorniDaOggi(-5)]);
    await collegaBanca(app, utente.headers, { destinazione: conto.id });

    const esito = await processaSincronizzazioniPianificate({
      provider: new SandboxBankProvider(),
    });

    // Questa asserzione viene PRIMA di ogni contatore: è la proprietà che
    // conta davvero, e deve essere la prima a rompersi se la guardia
    // sparisse. Senza di essa il cron scriverebbe qui i 3 movimenti della
    // banca sopra lo storico manuale — che è esattamente ciò che è
    // avvenuto in produzione.
    expect(await Movimento.count({ where: { user_id: utente.userId } })).toBe(1);
    expect(await Movimento.count({
      where: { user_id: utente.userId, origine: ORIGINE_OPEN_BANKING },
    })).toBe(0);

    expect(esito.saltato).toBe(false);
    expect(esito.processate).toBe(1);
    expect(esito.saltate).toBe(1);
    expect(esito.riuscite).toBe(0);
    expect(esito.fallite).toBe(0);
    expect(esito.importati).toBe(0);

    const connessione = await laConnessione();
    expect(connessione.error_code).toBeNull();
    expect(connessione.last_error_at).toBeNull();
    expect(connessione.status).toBe(STATO_ATTIVA);
    expect(connessione.sync_errori_totali).toBe(0);
    expect(connessione.last_successful_sync_at).toBeNull();
  });

  it('il salto del cron ha la forma che il cron già conosce', async () => {
    const conto = await contoConStorico([giorniDaOggi(-5)]);
    await collegaBanca(app, utente.headers, { destinazione: conto.id });
    const connessione = await laConnessione();

    const esito = await sincronizza({
      userId: utente.userId,
      connectionId: connessione.id,
      origine: 'cron',
      provider: new SandboxBankProvider(),
      ignoraCooldown: true,
    });

    expect(esito).toMatchObject({ saltato: true, motivo: 'soglia_non_impostata', importati: 0 });
  });

  it('senza movimenti preesistenti importa come sempre, e la soglia resta nulla', async () => {
    // Protegge la Regola 24: `import_da` nullo significa «nessuna soglia,
    // vale la finestra di sempre». Le connessioni esistenti devono
    // comportarsi esattamente come prima di questo task.
    await collegaBanca(app, utente.headers);

    const res = await sync();

    expect(res.status).toBe(200);
    expect(res.body.importati).toBe(3);
    const connessione = await laConnessione();
    expect(connessione.import_da).toBeNull();
    expect(connessione.last_successful_sync_at).not.toBeNull();
  });

  it('con la soglia, le transazioni precedenti non entrano e la soglia resta sulla connessione', async () => {
    const conto = await contoConStorico([giorniDaOggi(-5)]);
    await collegaBanca(app, utente.headers, { destinazione: conto.id });

    // Le transazioni della sandbox sono a -3, -2 e -1 giorni (più una
    // `pending` di oggi, che non entra mai). La soglia ne esclude una.
    const soglia = giorniDaOggi(-2);
    const res = await sync({ import_da: soglia });

    expect(res.status).toBe(200);
    expect(res.body.importati).toBe(2);

    const importati = await Movimento.findAll({
      where: { user_id: utente.userId, origine: ORIGINE_OPEN_BANKING },
      order: [['data', 'ASC']],
    });
    expect(importati.map((m) => m.data)).toEqual([giorniDaOggi(-2), giorniDaOggi(-1)]);

    const connessione = await laConnessione();
    expect(connessione.import_da).toBe(soglia);

    // La soglia vale anche dopo: la finestra incrementale non può scendere
    // sotto di essa, quindi la transazione esclusa resta fuori per sempre.
    const seconda = await sync();
    expect(seconda.status).toBe(200);
    expect(seconda.body.importati).toBe(0);
    expect(await Movimento.count({
      where: { user_id: utente.userId, origine: ORIGINE_OPEN_BANKING },
    })).toBe(2);
  });

  it('il confine del giorno è quello di Roma, non quello del processo', async () => {
    // Regola 16: i confini di giorno si calcolano nel fuso dell'utente, mai
    // in quello del processo (su Vercel, UTC).
    //
    // Le 22:30 UTC del 5 ottobre sono già le 00:30 del 6 a Roma (CEST, l'ora
    // legale finisce il 25). A quell'istante un movimento datato 6 ottobre è
    // «oggi» per l'utente e «domani» per il processo: con il confine in UTC
    // verrebbe scartato come futuro e il suggerimento arretrerebbe al 6,
    // cioè a un giorno che l'utente ha già registrato a mano — l'esatto
    // contrario dello scopo di questa funzione.
    //
    // Il movimento dell'8 serve a dimostrare che il filtro sul futuro c'è
    // ancora: è futuro anche per Roma e non deve spostare nulla. Le tre
    // ipotesi danno tre risultati distinti — nessun filtro 2026-10-09,
    // filtro in UTC 2026-10-06, filtro di Roma 2026-10-07 — quindi questa
    // sola asserzione le separa tutte.
    const conto = await contoConStorico(['2026-10-05', '2026-10-06', '2026-10-08']);

    const suggerita = await dataSuggeritaImport({
      userId: utente.userId,
      contoId: conto.id,
      riferimento: new Date('2026-10-05T22:30:00.000Z'),
    });

    expect(suggerita).toBe('2026-10-07');
  });

  it('una soglia oltre domani è rifiutata dalla validazione', async () => {
    // Il pavimento accetta fino a DOMANI compreso (vedi i due test al
    // confine, più sotto, con l'orologio congelato): oltre domani resta
    // rifiutato, perché un pavimento più lontano nel futuro disabiliterebbe
    // gli import a tempo indeterminato.
    const conto = await contoConStorico([giorniDaOggi(-5)]);
    await collegaBanca(app, utente.headers, { destinazione: conto.id });

    // `+3` e non `+2`: `giorniDaOggi` conta in UTC mentre la validazione
    // confronta con `oggiLocale()` (Europe/Rome) e ora ammette anche domani.
    // Fra le 22:00/23:00 UTC e la mezzanotte di Roma il giorno locale è già
    // quello successivo, quindi nel caso peggiore `oggiLocale()` vale già
    // "UTC + 1" e il massimo accettato vale "UTC + 2": `+2` non basterebbe più
    // a restare oltre il limite in ogni finestra oraria, `+3` sì.
    const res = await sync({ import_da: giorniDaOggi(+3) });

    expect(res.status).toBe(400);
    const connessione = await laConnessione();
    expect(connessione.import_da).toBeNull();
    expect(await Movimento.count({ where: { user_id: utente.userId } })).toBe(1);
  });

  describe('il confine di "domani" (Difetto 1: il server non può proporre una data che rifiuta da sé)', () => {
    // Orologio congelato a mezzogiorno UTC del 5 ottobre 2026: a quell'ora
    // Roma (CEST, +2) è già pomeriggio dello stesso giorno, quindi non c'è
    // ambiguità di fuso sul "oggi" — il test isola solo il confine
    // domani/dopodomani, non l'offset Roma/UTC (già coperto sopra).
    afterEach(() => {
      jest.useRealTimers();
    });

    const congelaOggi = () => {
      jest.useFakeTimers({
        doNotFake: ['nextTick', 'setImmediate', 'setInterval', 'setTimeout', 'clearImmediate', 'clearInterval', 'clearTimeout'],
      }).setSystemTime(new Date('2026-10-05T12:00:00.000Z'));
    };

    it('accetta "domani" — è esattamente ciò che dataSuggeritaImport può proporre a chi è in pari', async () => {
      congelaOggi();
      // Nessuno storico preesistente: la guardia non deve intervenire, qui
      // si verifica solo la validazione del campo.
      await collegaBanca(app, utente.headers);

      const res = await sync({ import_da: '2026-10-06' }); // domani

      expect(res.status).toBe(200);
      const connessione = await laConnessione();
      expect(connessione.import_da).toBe('2026-10-06');
    });

    it('rifiuta "dopodomani"', async () => {
      congelaOggi();
      await collegaBanca(app, utente.headers);

      const res = await sync({ import_da: '2026-10-07' }); // dopodomani

      expect(res.status).toBe(400);
      const connessione = await laConnessione();
      expect(connessione.import_da).toBeNull();
    });
  });

  describe('il pavimento e un intervallo scelto a mano (Difetto 2: la soglia non deve diventare permanente)', () => {
    /** Transazioni sandbox fisse a -3/-2/-1 giorni (booked) + oggi (pending,
     * mai importata): vedi SandboxBankProvider. */
    const impostaPavimentoRecente = async () => {
      const connessione = await laConnessione();
      // Un pavimento impostato in precedenza (come dopo aver accettato la
      // data suggerita), più recente delle transazioni sandbox più vecchie.
      await connessione.update({ import_da: giorniDaOggi(-1) });
      return connessione;
    };

    it('un data_da esplicito più vecchio del pavimento viene rispettato', async () => {
      await collegaBanca(app, utente.headers);
      await impostaPavimentoRecente();

      // Intervallo scelto a mano, più vecchio del pavimento: è la scelta
      // deliberata che deve superarlo, non un'alternativa ignorata.
      const res = await sync({ data_da: giorniDaOggi(-3), data_a: giorniDaOggi(-1) });

      expect(res.status).toBe(200);
      // Le tre transazioni booked (-3, -2, -1) entrano tutte: se il pavimento
      // avesse vinto, ne sarebbe entrata solo una (quella di -1 giorno).
      expect(res.body.importati).toBe(3);
    });

    it('senza un data_da esplicito, il pavimento continua a limitare la finestra predefinita', async () => {
      // È il test che impedisce alla correzione di diventare una regressione:
      // senza di lui si sarebbe rimossa la protezione invece di circoscriverla
      // al solo intervallo scelto a mano.
      await collegaBanca(app, utente.headers);
      await impostaPavimentoRecente();

      const res = await sync(); // nessun data_da/data_a: finestra predefinita

      expect(res.status).toBe(200);
      // Il pavimento esclude le transazioni di -3 e -2 giorni: resta solo
      // quella di -1 giorno.
      expect(res.body.importati).toBe(1);
    });
  });
});

describe('il saldo di un conto collegato lo decide la banca', () => {
  let utente;

  beforeEach(async () => {
    azzeraConfigurazione();
    await abilitaSandbox();
    utente = await creaUtente(app);
    await concediEntitlement(utente.userId);
  });

  it('rifiuta la modifica del saldo e spiega perché', async () => {
    const { riconciliazione } = await collegaBanca(app, utente.headers);
    const contoId = riconciliazione.body.conto.id;
    const saldoPrima = (await Conto.findByPk(contoId)).saldo;

    const r = await request(app).put(`/api/conti/${contoId}`).set(utente.headers)
      .send({ saldo: 999 });

    expect(r.status).toBe(422);
    expect(r.body.message).toMatch(/banca/i);
    expect((await Conto.findByPk(contoId)).saldo).toBe(saldoPrima);
  });

  it('il nome resta modificabile', async () => {
    const { riconciliazione } = await collegaBanca(app, utente.headers);
    const contoId = riconciliazione.body.conto.id;

    const r = await request(app).put(`/api/conti/${contoId}`).set(utente.headers)
      .send({ nome: 'Il mio Revolut' });

    expect(r.status).toBe(200);
    expect((await Conto.findByPk(contoId)).nome).toBe('Il mio Revolut');
  });

  it('su un conto non collegato il saldo si modifica come sempre', async () => {
    const mio = await Conto.create({
      user_id: utente.userId, nome: 'CONTANTI', tipo: 'contanti', saldo: 10, attivo: true,
    });

    const r = await request(app).put(`/api/conti/${mio.id}`).set(utente.headers)
      .send({ saldo: 50 });

    expect(r.status).toBe(200);
  });

  it('scollegare la banca rende il saldo di nuovo modificabile a mano', async () => {
    // La guardia guarda le connessioni VIVE: una connessione revocata non
    // deve più bloccare nulla, altrimenti scollegare la banca (Regola 24,
    // "scollegare non cancella movimenti") lascerebbe il conto bloccato per
    // sempre, senza nessuna sincronizzazione che possa più contraddire il
    // valore scritto a mano.
    const { riconciliazione } = await collegaBanca(app, utente.headers);
    const contoId = riconciliazione.body.conto.id;

    const scollega = await request(app).post('/api/bank-sync/disconnect').set(utente.headers).send({});
    expect(scollega.status).toBe(200);

    const r = await request(app).put(`/api/conti/${contoId}`).set(utente.headers)
      .send({ saldo: 123.45 });

    expect(r.status).toBe(200);
    expect((await Conto.findByPk(contoId)).saldo).toBe('123.45');
  });
});

describe('un movimento inserito a mano su un conto collegato avvisa, non blocca', () => {
  let utente;

  beforeEach(async () => {
    azzeraConfigurazione();
    await abilitaSandbox();
    utente = await creaUtente(app);
    await concediEntitlement(utente.userId);
  });

  const payloadMovimento = (contoId) => ({
    conto_id: contoId,
    tipo: 'uscita',
    importo: 10,
    categoria: 'cibo_spesa',
    descrizione: 'Spesa di stamattina',
    data: '2026-10-05',
  });

  it('riesce e segnala avviso: conto_collegato quando il conto è agganciato a una connessione viva', async () => {
    const { riconciliazione } = await collegaBanca(app, utente.headers);
    const contoId = riconciliazione.body.conto.id;

    const r = await request(app).post('/api/movimenti').set(utente.headers)
      .send(payloadMovimento(contoId));

    expect(r.status).toBe(201);
    expect(r.body.avviso).toBe('conto_collegato');
    // L'operazione È riuscita: non è un errore, il movimento esiste davvero
    // e ha mosso il saldo come qualunque altro.
    expect(await Movimento.count({ where: { conto_id: contoId, user_id: utente.userId } })).toBe(1);
  });

  it('una regola ricorrente non muove denaro ora, quindi non avvisa: lo farà la sua occorrenza', async () => {
    // Regola 11: l'origine di una ricorrenza NON è un movimento avvenuto
    // (`muoveSaldo` è falso per lei), lo diventa solo l'occorrenza che il
    // cron genera alla scadenza. Avvisare qui direbbe «questa operazione
    // arriverà anche dalla banca» su un'operazione che non è ancora
    // avvenuta: un'affermazione falsa, non solo imprecisa.
    const { riconciliazione } = await collegaBanca(app, utente.headers);
    const contoId = riconciliazione.body.conto.id;

    const r = await request(app).post('/api/movimenti').set(utente.headers)
      .send({
        conto_id: contoId,
        tipo: 'uscita',
        importo: 10,
        categoria: 'cibo_spesa',
        descrizione: 'Affitto',
        data: '2026-10-05',
        ricorrente: true,
        ricorrente_frequenza: 'mensile',
        ricorrente_giorno: 5,
      });

    expect(r.status).toBe(201);
    expect(Object.prototype.hasOwnProperty.call(r.body, 'avviso')).toBe(false);
  });

  it('su un conto non collegato la forma della risposta non cambia: nessun campo avviso', async () => {
    const mio = await Conto.create({
      user_id: utente.userId, nome: 'CONTANTI', tipo: 'contanti', saldo: 100, attivo: true,
    });

    const r = await request(app).post('/api/movimenti').set(utente.headers)
      .send(payloadMovimento(mio.id));

    expect(r.status).toBe(201);
    expect(Object.prototype.hasOwnProperty.call(r.body, 'avviso')).toBe(false);
  });

  it('scollegare la banca fa sparire l\'avviso sui movimenti successivi', async () => {
    // Stessa guardia del Task 6 (`contoCollegatoAConnessioneViva` guarda solo
    // le connessioni VIVE): una banca scollegata non deve avvisare per
    // sempre su un conto tornato manuale.
    const { riconciliazione } = await collegaBanca(app, utente.headers);
    const contoId = riconciliazione.body.conto.id;

    const scollega = await request(app).post('/api/bank-sync/disconnect').set(utente.headers).send({});
    expect(scollega.status).toBe(200);

    const r = await request(app).post('/api/movimenti').set(utente.headers)
      .send(payloadMovimento(contoId));

    expect(r.status).toBe(201);
    expect(Object.prototype.hasOwnProperty.call(r.body, 'avviso')).toBe(false);
  });

  it('resta fuori dal perimetro di updateMovimento', async () => {
    const { riconciliazione } = await collegaBanca(app, utente.headers);
    const contoId = riconciliazione.body.conto.id;

    const creato = await request(app).post('/api/movimenti').set(utente.headers)
      .send(payloadMovimento(contoId));
    expect(creato.status).toBe(201);

    const aggiornato = await request(app).put(`/api/movimenti/${creato.body.movimento.id}`).set(utente.headers)
      .send({ descrizione: 'Modificato' });

    expect(aggiornato.status).toBe(200);
    expect(Object.prototype.hasOwnProperty.call(aggiornato.body, 'avviso')).toBe(false);
  });
});
