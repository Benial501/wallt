/**
 * Le rotte di Bank Sync, attraversate per davvero: dal rate limiter al
 * controller, passando dall'entitlement, dalla validazione e dalla fabbrica
 * dei provider.
 *
 * Il provider è il sandbox ATTIVATO DALLA CONFIGURAZIONE, non iniettato: così
 * questi test esercitano anche `providers/index.js` e la lettura di
 * `bank_sync_provider`, cioè i pezzi che decidono quale provider si usa. Un
 * test che inietta l'adapter salta proprio quelli.
 */

const request = require('supertest');
const { createApp } = require('../app');
const { Conto, Movimento, BankConnection } = require('../models');
const {
  STATO_ATTIVA, STATO_REVOCATA, STATO_IN_ATTESA, STATO_DA_RICONCILIARE,
  ORIGINE_OPEN_BANKING, ORIGINE_MANUALE, TX_BOOKED,
} = require('../constants/bankSync');
const { SOURCE_BETA_25 } = require('../constants/entitlements');
const {
  azzeraConfigurazione, abilitaSandbox, creaUtente, concediEntitlement,
  collegaBanca, estraiState,
} = require('./helpers/premium');

const app = createApp({ enableRateLimit: false });

describe('un utente Free non può usare Bank Sync', () => {
  let utente;

  beforeEach(async () => {
    azzeraConfigurazione();
    await abilitaSandbox();
    utente = await creaUtente(app);
  });

  it('403 su ogni rotta che usa la banca, con il motivo nella risposta', async () => {
    const chiamate = [
      ['get', '/api/bank-sync/istituti'],
      ['post', '/api/bank-sync/connect'],
      ['post', '/api/bank-sync/reconnect'],
      ['post', '/api/bank-sync/callback'],
      ['post', '/api/bank-sync/sync'],
    ];

    for (const [metodo, percorso] of chiamate) {
      const res = await request(app)[metodo](percorso)
        .set(utente.headers)
        .send({ institution_id: 'SANDBOX_BANCA_IT', state: 'x'.repeat(40) });
      expect(res.status).toBe(403);
      // Il motivo è ciò che permette alla SPA di mostrare l'invito alla beta
      // invece di un errore generico.
      expect(res.body.motivo).toBe('nessun_entitlement');
      expect(res.body.message).toMatch(/Premium/);
    }
  });

  it('nessuna connessione e nessun conto vengono creati dal tentativo', async () => {
    await request(app).post('/api/bank-sync/connect')
      .set(utente.headers).send({ institution_id: 'SANDBOX_BANCA_IT' }).expect(403);

    expect(await BankConnection.count({ where: { user_id: utente.userId } })).toBe(0);
    expect(await Conto.count({ where: { user_id: utente.userId } })).toBe(0);
  });

  it('può comunque leggere lo stato e i posti beta: è ciò che gli propone l\'attivazione', async () => {
    const stato = await request(app).get('/api/bank-sync/status')
      .set(utente.headers).expect(200);
    expect(stato.body.connessione).toBeNull();
    expect(stato.body.permesso.attiva).toBe(false);

    const beta = await request(app).get('/api/bank-sync/beta')
      .set(utente.headers).expect(200);
    expect(beta.body.disponibili).toBe(25);
  });

  it('senza autenticazione tutto risponde 401', async () => {
    for (const percorso of ['/api/bank-sync/status', '/api/bank-sync/beta']) {
      await request(app).get(percorso).expect(401);
    }
    for (const percorso of ['/api/bank-sync/connect', '/api/bank-sync/sync', '/api/bank-sync/claim-beta']) {
      await request(app).post(percorso).send({}).expect(401);
    }
  });
});

describe('collegamento del conto', () => {
  let utente;

  beforeEach(async () => {
    azzeraConfigurazione();
    await abilitaSandbox();
    utente = await creaUtente(app);
    await concediEntitlement(utente.userId, { source: SOURCE_BETA_25 });
  });

  it('dopo il claim della beta il collegamento diventa possibile', async () => {
    const nuovo = await creaUtente(app);
    await request(app).post('/api/bank-sync/connect')
      .set(nuovo.headers).send({ institution_id: 'SANDBOX_BANCA_IT' }).expect(403);

    await request(app).post('/api/bank-sync/claim-beta').set(nuovo.headers).expect(201);

    await request(app).post('/api/bank-sync/connect')
      .set(nuovo.headers).send({ institution_id: 'SANDBOX_BANCA_IT' }).expect(201);
  });

  it('connect crea una connessione in attesa e restituisce l\'URL della banca', async () => {
    const res = await request(app).post('/api/bank-sync/connect')
      .set(utente.headers).send({ institution_id: 'SANDBOX_BANCA_IT' }).expect(201);

    expect(res.body.url_autorizzazione).toContain('/banca/callback');
    expect(res.body.scade_il).toBeTruthy();

    const connessione = await BankConnection.findOne({ where: { user_id: utente.userId } });
    expect(connessione.status).toBe(STATO_IN_ATTESA);
    // Nel database c'è l'HASH dello state, non lo state.
    const state = estraiState(res.body.url_autorizzazione);
    expect(connessione.state_hash).toHaveLength(64);
    expect(connessione.state_hash).not.toBe(state);
    // Nessun conto finché il consenso non è completato.
    expect(connessione.conto_id).toBeNull();
    expect(await Conto.count({ where: { user_id: utente.userId } })).toBe(0);
  });

  it('il collegamento completo crea il conto, attiva la connessione e non lascia segreti', async () => {
    const { callback } = await collegaBanca(app, utente.headers);
    expect(callback.status).toBe(201);
    // Il CALLBACK si ferma a `da_riconciliare`: non decide da solo dove
    // vanno i movimenti, perché l'utente può già tracciare quella banca a
    // mano. È la riconciliazione (chiamata da `collegaBanca`) a portare la
    // connessione ad `attiva`, e tutto ciò che segue verifica lo stato
    // FINALE del flusso completo.
    expect(callback.body.connessione.stato).toBe(STATO_DA_RICONCILIARE);

    const connessione = await BankConnection.findOne({ where: { user_id: utente.userId } });
    expect(connessione.status).toBe(STATO_ATTIVA);
    expect(connessione.conto_id).not.toBeNull();
    // Lo state è CONSUMATO: è `state_used_at` a impedire che serva di nuovo a
    // qualcosa, non la cancellazione dell'hash. L'hash resta perché un
    // callback ripetuto (refresh della pagina) deve essere idempotente, e un
    // hash a senso unico di un valore già consumato non autorizza nulla.
    expect(connessione.state_used_at).not.toBeNull();
    expect(connessione.state_hash).toMatch(/^[0-9a-f]{64}$/);

    const conto = await Conto.findByPk(connessione.conto_id);
    expect(conto.tipo).toBe('banca');
    expect(conto.user_id).toBe(utente.userId);
    expect(Number(conto.saldo)).toBe(2345.67);

    // NESSUN movimento "Saldo iniziale": sarebbe un'entrata inventata, e
    // falserebbe le medie di reddito, i budget e Piano Smart.
    expect(await Movimento.count({ where: { user_id: utente.userId } })).toBe(0);
  });

  it('l\'IBAN è conservato solo mascherato', async () => {
    await collegaBanca(app, utente.headers);
    const connessione = await BankConnection.findOne({ where: { user_id: utente.userId } });

    expect(connessione.iban_mascherato).toBe('IT•••3456');
    // L'IBAN completo del sandbox non deve comparire in nessuna colonna.
    const tutto = JSON.stringify(connessione.toJSON());
    expect(tutto).not.toContain('IT60X0542811101000000123456');
  });

  it('un institution_id non valido viene rifiutato dalla validazione', async () => {
    for (const cattivo of ['', 'a'.repeat(200), 'ok; DROP TABLE conti', '<script>']) {
      const res = await request(app).post('/api/bank-sync/connect')
        .set(utente.headers).send({ institution_id: cattivo });
      expect(res.status).toBe(400);
    }
    expect(await BankConnection.count({ where: { user_id: utente.userId } })).toBe(0);
  });
});

describe('massimo un conto sincronizzato per utente', () => {
  let utente;

  beforeEach(async () => {
    azzeraConfigurazione();
    await abilitaSandbox();
    utente = await creaUtente(app);
    await concediEntitlement(utente.userId, { source: SOURCE_BETA_25 });
  });

  it('un secondo collegamento viene rifiutato con un codice che la UI può usare', async () => {
    await collegaBanca(app, utente.headers);

    const res = await request(app).post('/api/bank-sync/connect')
      .set(utente.headers).send({ institution_id: 'SANDBOX_REVOLUT_IT' });

    expect(res.status).toBe(409);
    expect(res.body.codice).toBe('limite_connessioni_raggiunto');
    expect(await BankConnection.count({
      where: { user_id: utente.userId, status: STATO_ATTIVA },
    })).toBe(1);
  });

  it('nemmeno durante un\'autorizzazione già avviata se ne può aprire una seconda', async () => {
    await request(app).post('/api/bank-sync/connect')
      .set(utente.headers).send({ institution_id: 'SANDBOX_BANCA_IT' }).expect(201);

    const res = await request(app).post('/api/bank-sync/connect')
      .set(utente.headers).send({ institution_id: 'SANDBOX_REVOLUT_IT' });
    expect(res.status).toBe(409);
  });

  it('il limite è nel DATABASE, non solo nel servizio', async () => {
    // Scrittura diretta, saltando ogni controllo applicativo: solo l'indice
    // parziale può fermarla. Se questo test passasse senza errore, il limite
    // sarebbe aggirabile da qualunque percorso futuro che dimenticasse il
    // controllo.
    await collegaBanca(app, utente.headers);

    await expect(BankConnection.create({
      user_id: utente.userId,
      provider: 'sandbox',
      institution_id: 'SANDBOX_REVOLUT_IT',
      status: STATO_ATTIVA,
    })).rejects.toThrow();
  });

  it('più connessioni REVOCATE possono convivere: lo storico non si perde', async () => {
    await collegaBanca(app, utente.headers);
    await request(app).post('/api/bank-sync/disconnect').set(utente.headers).expect(200);
    await collegaBanca(app, utente.headers);
    await request(app).post('/api/bank-sync/disconnect').set(utente.headers).expect(200);

    expect(await BankConnection.count({
      where: { user_id: utente.userId, status: STATO_REVOCATA },
    })).toBe(2);
  });

  it('due utenti diversi hanno ciascuno il proprio conto: il limite è per utente', async () => {
    const altro = await creaUtente(app);
    await concediEntitlement(altro.userId, { source: SOURCE_BETA_25 });

    await collegaBanca(app, utente.headers);
    await collegaBanca(app, altro.headers);

    expect(await BankConnection.count({ where: { status: STATO_ATTIVA } })).toBe(2);
  });
});

describe('sostituzione e scollegamento', () => {
  let utente;

  beforeEach(async () => {
    azzeraConfigurazione();
    await abilitaSandbox();
    utente = await creaUtente(app);
    await concediEntitlement(utente.userId, { source: SOURCE_BETA_25 });
  });

  it('sostituisci revoca la precedente, ne apre una nuova e CONSERVA i movimenti', async () => {
    await collegaBanca(app, utente.headers);
    await request(app).post('/api/bank-sync/sync').set(utente.headers).expect(200);

    const movimentiPrima = await Movimento.count({
      where: { user_id: utente.userId, origine: ORIGINE_OPEN_BANKING },
    });
    expect(movimentiPrima).toBeGreaterThan(0);

    const vecchia = await BankConnection.findOne({
      where: { user_id: utente.userId, status: STATO_ATTIVA },
    });

    await request(app).post('/api/bank-sync/connect')
      .set(utente.headers)
      .send({ institution_id: 'SANDBOX_REVOLUT_IT', sostituisci: true })
      .expect(201);

    await vecchia.reload();
    expect(vecchia.status).toBe(STATO_REVOCATA);

    // Il requisito centrale: la cronologia non viene cancellata, e i
    // movimenti continuano a referenziare la connessione che li ha portati.
    expect(await Movimento.count({
      where: { user_id: utente.userId, bank_connection_id: vecchia.id },
    })).toBe(movimentiPrima);
  });

  it('senza il flag sostituisci non si sostituisce per sbaglio', async () => {
    await collegaBanca(app, utente.headers);
    const res = await request(app).post('/api/bank-sync/connect')
      .set(utente.headers).send({ institution_id: 'SANDBOX_REVOLUT_IT' });
    expect(res.status).toBe(409);

    const attive = await BankConnection.count({
      where: { user_id: utente.userId, status: STATO_ATTIVA },
    });
    expect(attive).toBe(1);
  });

  it('ricollega usa l\'istituto della connessione esistente, non quello del corpo', async () => {
    await collegaBanca(app, utente.headers, { institutionId: 'SANDBOX_BANCA_IT' });

    await request(app).post('/api/bank-sync/reconnect')
      .set(utente.headers)
      .send({ institution_id: 'SANDBOX_REVOLUT_IT' })
      .expect(201);

    const nuova = await BankConnection.findOne({
      where: { user_id: utente.userId, status: STATO_IN_ATTESA },
    });
    // Se leggesse il corpo, "ricollega" sarebbe un modo di collegare una
    // banca diversa saltando la conferma di sostituzione.
    expect(nuova.institution_id).toBe('SANDBOX_BANCA_IT');
  });

  it('scollegare NON cancella movimenti, e il conto resta con il suo saldo', async () => {
    await collegaBanca(app, utente.headers);
    await request(app).post('/api/bank-sync/sync').set(utente.headers).expect(200);

    const connessione = await BankConnection.findOne({
      where: { user_id: utente.userId, status: STATO_ATTIVA },
    });
    const contoPrima = await Conto.findByPk(connessione.conto_id);
    const saldoPrima = Number(contoPrima.saldo);
    const movimentiPrima = await Movimento.count({ where: { user_id: utente.userId } });

    const res = await request(app).post('/api/bank-sync/disconnect')
      .set(utente.headers).expect(200);
    expect(res.body.movimenti_conservati).toBe(true);
    expect(res.body.message).toMatch(/restano disponibili/);

    expect(await Movimento.count({ where: { user_id: utente.userId } })).toBe(movimentiPrima);
    const contoDopo = await Conto.findByPk(connessione.conto_id);
    expect(Number(contoDopo.saldo)).toBe(saldoPrima);
    expect(contoDopo.attivo).toBe(true);
  });

  it('dopo lo scollegamento si può collegare di nuovo: il posto è libero', async () => {
    await collegaBanca(app, utente.headers);
    await request(app).post('/api/bank-sync/disconnect').set(utente.headers).expect(200);
    const { callback } = await collegaBanca(app, utente.headers);
    expect(callback.status).toBe(201);
  });

  it('scollegare è permesso anche a chi ha perso l\'entitlement', async () => {
    // Negarglielo lo lascerebbe con un consenso presso la banca che non
    // riesce a revocare.
    await collegaBanca(app, utente.headers);
    const { UserEntitlement } = require('../models');
    await UserEntitlement.update(
      { status: 'revoked' }, { where: { user_id: utente.userId } },
    );

    await request(app).post('/api/bank-sync/sync').set(utente.headers).expect(403);
    await request(app).post('/api/bank-sync/disconnect').set(utente.headers).expect(200);
  });
});

describe('sincronizzazione attraverso l\'API', () => {
  let utente;

  beforeEach(async () => {
    azzeraConfigurazione();
    await abilitaSandbox();
    utente = await creaUtente(app);
    await concediEntitlement(utente.userId, { source: SOURCE_BETA_25 });
    await collegaBanca(app, utente.headers);
  });

  it('importa le transazioni come movimenti WALLT normali', async () => {
    const res = await request(app).post('/api/bank-sync/sync')
      .set(utente.headers).expect(200);

    expect(res.body.esito).toBe('ok');
    expect(res.body.importati).toBe(3);

    const movimenti = await Movimento.findAll({
      where: { user_id: utente.userId },
      order: [['data', 'ASC']],
    });
    expect(movimenti).toHaveLength(3);

    movimenti.forEach((m) => {
      expect(m.origine).toBe(ORIGINE_OPEN_BANKING);
      expect(m.stato_banca).toBe(TX_BOOKED);
      expect(m.external_transaction_id).toMatch(/^sbx-tx-/);
      // `ricorrente: false` è ciò che rende vero `muoveSaldo` (Regola 11):
      // senza, patrimonio e saldo effettivo non li vedrebbero.
      expect(m.ricorrente).toBe(false);
      expect(['entrata', 'uscita']).toContain(m.tipo);
      expect(Number(m.importo)).toBeGreaterThan(0);
      expect(m.categoria).toBeTruthy();
    });

    const entrate = movimenti.filter((m) => m.tipo === 'entrata');
    const uscite = movimenti.filter((m) => m.tipo === 'uscita');
    expect(entrate).toHaveLength(1);
    expect(uscite).toHaveLength(2);
    expect(Number(entrate[0].importo)).toBe(1850);
  });

  it('una transazione in attesa presso la banca NON diventa un movimento', async () => {
    // È la garanzia contro il doppio conteggio pending → booked: la coppia da
    // riconciliare non esiste, perché la pending non è mai stata scritta.
    const res = await request(app).post('/api/bank-sync/sync')
      .set(utente.headers).expect(200);

    expect(res.body.pending).toBe(1);
    expect(await Movimento.count({
      where: { user_id: utente.userId, stato_banca: 'pending' },
    })).toBe(0);
    // Riportata, non nascosta: la UI può dirlo all'utente.
    expect(res.body.scartate.non_contabilizzate).toBe(1);
  });

  it('due sincronizzazioni di seguito NON duplicano nulla', async () => {
    const prima = await request(app).post('/api/bank-sync/sync')
      .set(utente.headers).expect(200);
    const seconda = await request(app).post('/api/bank-sync/sync')
      .set(utente.headers).expect(200);

    expect(prima.body.importati).toBe(3);
    expect(seconda.body.importati).toBe(0);
    expect(seconda.body.duplicati_evitati).toBe(3);
    expect(await Movimento.count({ where: { user_id: utente.userId } })).toBe(3);
  });

  it('il saldo del conto viene allineato a quello della banca', async () => {
    await request(app).post('/api/bank-sync/sync').set(utente.headers).expect(200);

    const connessione = await BankConnection.findOne({ where: { user_id: utente.userId } });
    const conto = await Conto.findByPk(connessione.conto_id);
    expect(Number(conto.saldo)).toBe(2345.67);
    expect(Number(connessione.saldo_provider)).toBe(2345.67);
  });

  it('i movimenti importati entrano nel patrimonio e nel saldo effettivo', async () => {
    // Nessuna riga di financialSummary/liquidita è stata toccata: se questo
    // passa, è perché i movimenti bancari sono movimenti WALLT a tutti gli
    // effetti.
    await request(app).post('/api/bank-sync/sync').set(utente.headers).expect(200);

    const res = await request(app).get('/api/conti/patrimonio')
      .set(utente.headers).expect(200);
    expect(res.body.totale).toBe(2345.67);
    expect(res.body.saldo_effettivo).toBe(2345.67);

    const movimenti = await request(app).get('/api/movimenti')
      .set(utente.headers).expect(200);
    const lista = movimenti.body.movimenti ?? movimenti.body;
    expect(Array.isArray(lista) ? lista.length : lista).toBeTruthy();
  });

  it('le metriche della connessione si aggiornano, e sono solo conteggi', async () => {
    await request(app).post('/api/bank-sync/sync').set(utente.headers).expect(200);
    await request(app).post('/api/bank-sync/sync').set(utente.headers).expect(200);

    const connessione = await BankConnection.findOne({ where: { user_id: utente.userId } });
    expect(connessione.sync_ok_totali).toBe(2);
    expect(connessione.sync_errori_totali).toBe(0);
    expect(connessione.movimenti_importati_totali).toBe(3);
    expect(connessione.duplicati_evitati_totali).toBe(3);
    expect(connessione.last_successful_sync_at).not.toBeNull();
    expect(connessione.sync_started_at).toBeNull();
  });

  it('lo stato riporta l\'ultimo aggiornamento riuscito', async () => {
    await request(app).post('/api/bank-sync/sync').set(utente.headers).expect(200);
    const res = await request(app).get('/api/bank-sync/status')
      .set(utente.headers).expect(200);

    expect(res.body.connessione.ultima_sincronizzazione).toBeTruthy();
    expect(res.body.connessione.sincronizzabile).toBe(true);
    expect(res.body.connessione.richiede_riconnessione).toBe(false);
    // Nessun identificatore del provider verso il browser.
    const serializzata = JSON.stringify(res.body.connessione);
    expect(serializzata).not.toContain('sbx-req-');
    expect(serializzata).not.toContain('sbx-acc-');
    expect(serializzata).not.toContain('state_hash');
  });
});

describe('cancellazione dei dati importati', () => {
  let utente;

  beforeEach(async () => {
    azzeraConfigurazione();
    await abilitaSandbox();
    utente = await creaUtente(app);
    await concediEntitlement(utente.userId, { source: SOURCE_BETA_25 });
    await collegaBanca(app, utente.headers);
    await request(app).post('/api/bank-sync/sync').set(utente.headers).expect(200);
  });

  it('richiede la riverifica d\'identità, come reset ed eliminazione account', async () => {
    const res = await request(app).delete('/api/bank-sync/dati-importati')
      .set(utente.headers);
    expect(res.status).toBe(403);
    expect(await Movimento.count({ where: { user_id: utente.userId } })).toBe(3);
  });

  it('con lo step-up cancella SOLO le righe importate e ricalcola il saldo', async () => {
    const connessione = await BankConnection.findOne({ where: { user_id: utente.userId } });

    // Un movimento inserito a mano sullo stesso conto: non è un dato
    // importato e non deve essere toccato.
    await Movimento.create({
      user_id: utente.userId,
      conto_id: connessione.conto_id,
      tipo: 'uscita',
      importo: 20,
      categoria: 'cibo_spesa',
      descrizione: 'Spesa inserita a mano',
      data: new Date().toISOString().slice(0, 10),
      ricorrente: false,
      origine: ORIGINE_MANUALE,
    });

    const { getStepUpToken } = require('./setup');
    const stepUp = await getStepUpToken(app, utente.token, utente.password);

    const res = await request(app).delete('/api/bank-sync/dati-importati')
      .set(utente.headers)
      .set('X-Step-Up-Token', stepUp)
      .expect(200);

    expect(res.body.movimenti_eliminati).toBe(3);

    const rimasti = await Movimento.findAll({ where: { user_id: utente.userId } });
    expect(rimasti).toHaveLength(1);
    expect(rimasti[0].descrizione).toBe('Spesa inserita a mano');

    // Il saldo non può più venire dalla banca: viene dalla somma di ciò che
    // resta, che è l'unico valore che il database può giustificare.
    const conto = await Conto.findByPk(connessione.conto_id);
    expect(Number(conto.saldo)).toBe(-20);
  });
});

describe('interruttore globale', () => {
  it('spegnere Bank Sync blocca anche chi ha l\'entitlement, senza perdita di dati', async () => {
    azzeraConfigurazione();
    await abilitaSandbox();
    const utente = await creaUtente(app);
    await concediEntitlement(utente.userId, { source: SOURCE_BETA_25 });
    await collegaBanca(app, utente.headers);
    await request(app).post('/api/bank-sync/sync').set(utente.headers).expect(200);

    const { impostaBankSyncAttivo } = require('./helpers/premium');
    await impostaBankSyncAttivo(false);

    const res = await request(app).post('/api/bank-sync/sync').set(utente.headers);
    expect(res.status).toBe(403);
    expect(res.body.motivo).toBe('feature_disattivata');
    // I dati restano: l'interruttore sospende la funzione, non cancella nulla.
    expect(await Movimento.count({ where: { user_id: utente.userId } })).toBe(3);

    await impostaBankSyncAttivo(true);
    await request(app).post('/api/bank-sync/sync').set(utente.headers).expect(200);
  });
});
