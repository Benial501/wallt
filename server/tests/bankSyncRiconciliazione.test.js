/**
 * La riconciliazione fra una connessione bancaria e i conti che l'utente
 * già possiede. Il punto non è "il collegamento funziona" (lo copre
 * bankSyncApi) ma "il collegamento non duplica lo storico inserito a mano".
 */

const request = require('supertest');
const { createApp } = require('../app');
const { Conto, BankConnection, Movimento, AuditLog } = require('../models');
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
