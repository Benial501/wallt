/**
 * Revisione finale nel ruolo di un utente malevolo.
 *
 * Ogni test qui sotto è un tentativo di attacco esplicito, e DEVE fallire:
 *
 *   ottenere Premium senza autorizzazione
 *   superare i 25 posti
 *   collegare due conti
 *   leggere il conto di un altro utente
 *   duplicare una transazione
 *   manipolare il callback
 *   abusare della sincronizzazione
 *   accedere ai token del provider
 *
 * Se uno di questi test passasse "con successo" dal punto di vista
 * dell'attaccante, il lavoro non sarebbe concluso.
 */

const request = require('supertest');
const jwt = require('jsonwebtoken');
const { createApp } = require('../app');
const {
  User, UserEntitlement, BankConnection, Movimento, Conto, AppConfig, AuditLog,
} = require('../models');
const {
  FEATURE_BANK_SYNC, SOURCE_BETA_25, SOURCE_ADMIN, ENTITLEMENT_ATTIVO,
} = require('../constants/entitlements');
const { STATO_ATTIVA, STATO_IN_ATTESA } = require('../constants/bankSync');
const { canUseFeature } = require('../services/entitlements.service');
const { contaOccupati } = require('../services/betaSlots.service');
const {
  azzeraConfigurazione, abilitaSandbox, creaUtente, rendiAdmin, concediEntitlement,
  collegaBanca, estraiState, impostaLimiteBeta,
} = require('./helpers/premium');

const app = createApp({ enableRateLimit: false });

describe('ottenere Premium senza autorizzazione', () => {
  beforeEach(() => azzeraConfigurazione());

  it('non esiste nessuna rotta con cui un utente si scriva un entitlement', async () => {
    const utente = await creaUtente(app);
    const tentativi = [
      ['post', '/api/entitlements', { feature_key: 'bank_sync', source: 'admin' }],
      ['post', '/api/user_entitlements', { feature_key: 'bank_sync' }],
      ['put', '/api/piano', { piano: 'premium' }],
      ['post', '/api/subscriptions', { plan: 'premium', status: 'active' }],
      ['post', '/api/admin/entitlements/grant', { user_id: 1, feature_key: 'bank_sync' }],
    ];

    for (const [metodo, percorso, corpo] of tentativi) {
      const res = await request(app)[metodo](percorso).set(utente.headers).send(corpo);
      // 404 (rotta inesistente, o area admin nascosta) oppure 403: mai 2xx.
      expect(res.status).toBeGreaterThanOrEqual(400);
    }

    expect(await UserEntitlement.count()).toBe(0);
    expect((await canUseFeature(utente.userId, FEATURE_BANK_SYNC)).consentito).toBe(false);
  });

  it('il claim della beta ignora source e user_id suggeriti dal client', async () => {
    const vittima = await creaUtente(app);
    const attaccante = await creaUtente(app);

    await request(app).post('/api/bank-sync/claim-beta')
      .set(attaccante.headers)
      .send({ user_id: vittima.userId, source: 'premium_subscription', feature_key: 'bank_sync' })
      .expect(201);

    // Il diritto è andato a chi ha fatto la richiesta, con l'origine cablata.
    const righe = await UserEntitlement.findAll();
    expect(righe).toHaveLength(1);
    expect(righe[0].user_id).toBe(attaccante.userId);
    expect(righe[0].source).toBe(SOURCE_BETA_25);
    expect((await canUseFeature(vittima.userId, FEATURE_BANK_SYNC)).consentito).toBe(false);
  });

  it('un JWT con claim aggiuntivi non concede nulla', async () => {
    const utente = await creaUtente(app);
    // Un token firmato con il segreto giusto ma con claim inventati: il
    // server non legge né ruoli né permessi dal token.
    const tokenGonfiato = jwt.sign(
      {
        userId: utente.userId,
        ruolo: 'admin',
        premium: true,
        entitlements: ['bank_sync'],
        plan: 'premium',
      },
      process.env.JWT_SECRET,
      { expiresIn: '1h' },
    );
    const headers = { Authorization: `Bearer ${tokenGonfiato}` };

    await request(app).get('/api/admin/riepilogo').set(headers).expect(404);
    const res = await request(app).post('/api/bank-sync/sync').set(headers);
    expect(res.status).toBe(403);
    expect((await canUseFeature(utente.userId, FEATURE_BANK_SYNC)).consentito).toBe(false);
  });

  it('un token firmato con un segreto diverso viene rifiutato', async () => {
    const utente = await creaUtente(app);
    const falso = jwt.sign({ userId: utente.userId }, 'segreto_sbagliato', { expiresIn: '1h' });
    await request(app).get('/api/piano')
      .set({ Authorization: `Bearer ${falso}` })
      .expect(401);
  });

  it('il ruolo amministratore non si ottiene da nessuna rotta applicativa', async () => {
    const utente = await creaUtente(app);
    const tentativi = [
      ['put', '/api/impostazioni/preferenze', { ruolo: 'admin' }],
      ['put', '/api/profilo', { ruolo: 'admin' }],
      ['put', `/api/impostazioni/preferenze`, { ruolo: 'admin', tema: 'dark' }],
    ];
    for (const [metodo, percorso, corpo] of tentativi) {
      await request(app)[metodo](percorso).set(utente.headers).send(corpo);
    }
    const riga = await User.findByPk(utente.userId, { attributes: ['ruolo'] });
    expect(riga.ruolo).toBe('utente');
  });

  it('un utente non può scrivere la configurazione globale', async () => {
    const utente = await creaUtente(app);
    await request(app).put('/api/admin/config')
      .set(utente.headers)
      .send({ chiave: 'bank_sync_beta_limit', valore: 100000 })
      .expect(404);

    expect(await AppConfig.count({ where: { chiave: 'bank_sync_beta_limit' } })).toBe(0);
  });
});

describe('superare i 25 posti', () => {
  beforeEach(() => azzeraConfigurazione());

  it('nemmeno con richieste simultanee: il database non contiene più righe del limite', async () => {
    await impostaLimiteBeta(3);
    const utenti = await Promise.all(Array.from({ length: 15 }, () => creaUtente(app)));

    const esiti = await Promise.all(utenti.map((u) => request(app)
      .post('/api/bank-sync/claim-beta').set(u.headers)));

    const creati = esiti.filter((r) => r.status === 201);
    expect(creati).toHaveLength(3);
    expect(await contaOccupati(FEATURE_BANK_SYNC)).toBe(3);
  });

  it('cambiare il limite dal client non è possibile', async () => {
    await impostaLimiteBeta(1);
    const [primo, secondo] = await Promise.all([creaUtente(app), creaUtente(app)]);
    await request(app).post('/api/bank-sync/claim-beta').set(primo.headers).expect(201);

    // Tentativo: passare il limite nella richiesta.
    const res = await request(app).post('/api/bank-sync/claim-beta')
      .set(secondo.headers)
      .send({ limite: 999, bank_sync_beta_limit: 999 });
    expect(res.status).toBe(409);
    expect(await contaOccupati(FEATURE_BANK_SYNC)).toBe(1);
  });
});

describe('collegare due conti', () => {
  let utente;

  beforeEach(async () => {
    azzeraConfigurazione();
    await abilitaSandbox();
    utente = await creaUtente(app);
    await concediEntitlement(utente.userId, { source: SOURCE_BETA_25 });
    await collegaBanca(app, utente.headers);
  });

  it('nessuna sequenza di richieste produce due connessioni vive', async () => {
    const tentativi = await Promise.all([
      request(app).post('/api/bank-sync/connect').set(utente.headers).send({ institution_id: 'SANDBOX_REVOLUT_IT' }),
      request(app).post('/api/bank-sync/connect').set(utente.headers).send({ institution_id: 'SANDBOX_BANCA_IT' }),
      request(app).post('/api/bank-sync/connect').set(utente.headers).send({ institution_id: 'SANDBOX_REVOLUT_IT' }),
    ]);

    // 409 e non 500 anche quando a fermarli è l'indice del database invece
    // del controllo applicativo: per chi chiama è la stessa situazione.
    tentativi.forEach((r) => {
      expect(r.status).toBe(409);
      expect(r.body.codice).toBe('limite_connessioni_raggiunto');
    });
    const vive = await BankConnection.count({
      where: { user_id: utente.userId, status: [STATO_ATTIVA, STATO_IN_ATTESA] },
    });
    expect(vive).toBe(1);
  });

  it('la scrittura diretta nel database viene respinta dall\'indice parziale', async () => {
    await expect(BankConnection.create({
      user_id: utente.userId,
      provider: 'sandbox',
      institution_id: 'ALTRA',
      status: STATO_IN_ATTESA,
    })).rejects.toThrow();
  });
});

describe('leggere i dati di un altro utente', () => {
  let vittima;
  let attaccante;

  beforeEach(async () => {
    azzeraConfigurazione();
    await abilitaSandbox();
    vittima = await creaUtente(app);
    attaccante = await creaUtente(app);
    await concediEntitlement(vittima.userId, { source: SOURCE_BETA_25 });
    await concediEntitlement(attaccante.userId, { source: SOURCE_BETA_25 });
    await collegaBanca(app, vittima.headers);
    await request(app).post('/api/bank-sync/sync').set(vittima.headers).expect(200);
  });

  it('lo stato dell\'attaccante è vuoto: non vede la connessione della vittima', async () => {
    const res = await request(app).get('/api/bank-sync/status')
      .set(attaccante.headers).expect(200);
    expect(res.body.connessione).toBeNull();
  });

  it('la sincronizzazione dell\'attaccante non trova nulla da sincronizzare', async () => {
    const res = await request(app).post('/api/bank-sync/sync').set(attaccante.headers);
    expect(res.status).toBe(404);
    // E nessun movimento della vittima si è spostato.
    expect(await Movimento.count({ where: { user_id: attaccante.userId } })).toBe(0);
    expect(await Movimento.count({ where: { user_id: vittima.userId } })).toBe(3);
  });

  it('l\'attaccante non può scollegare la banca della vittima', async () => {
    const res = await request(app).post('/api/bank-sync/disconnect').set(attaccante.headers);
    expect(res.status).toBe(404);

    const connessione = await BankConnection.findOne({ where: { user_id: vittima.userId } });
    expect(connessione.status).toBe(STATO_ATTIVA);
  });

  it('l\'attaccante non può cancellare i dati importati della vittima', async () => {
    const { getStepUpToken } = require('./setup');
    const stepUp = await getStepUpToken(app, attaccante.token, attaccante.password);

    await request(app).delete('/api/bank-sync/dati-importati')
      .set(attaccante.headers)
      .set('X-Step-Up-Token', stepUp)
      .expect(200);

    // L'operazione riesce, ma agisce SOLO sui dati di chi la richiede.
    expect(await Movimento.count({ where: { user_id: vittima.userId } })).toBe(3);
  });

  it('uno step-up token di un altro utente non autorizza l\'operazione', async () => {
    const { getStepUpToken } = require('./setup');
    const stepUpVittima = await getStepUpToken(app, vittima.token, vittima.password);

    await request(app).delete('/api/bank-sync/dati-importati')
      .set(attaccante.headers)
      .set('X-Step-Up-Token', stepUpVittima)
      .expect(403);

    expect(await Movimento.count({ where: { user_id: vittima.userId } })).toBe(3);
  });

  it('i movimenti e il conto della vittima non compaiono nelle liste dell\'attaccante', async () => {
    const movimenti = await request(app).get('/api/movimenti').set(attaccante.headers).expect(200);
    const lista = movimenti.body.movimenti ?? [];
    expect(lista).toHaveLength(0);

    const conti = await request(app).get('/api/conti').set(attaccante.headers).expect(200);
    expect(conti.body.conti).toHaveLength(0);
  });
});

describe('manipolare il callback', () => {
  let utente;
  let attaccante;

  beforeEach(async () => {
    azzeraConfigurazione();
    await abilitaSandbox();
    utente = await creaUtente(app);
    attaccante = await creaUtente(app);
    await concediEntitlement(utente.userId, { source: SOURCE_BETA_25 });
    await concediEntitlement(attaccante.userId, { source: SOURCE_BETA_25 });
  });

  it('uno state inventato viene rifiutato, con un messaggio che non rivela nulla', async () => {
    const res = await request(app).post('/api/bank-sync/callback')
      .set(utente.headers)
      .send({ state: 'A'.repeat(43) });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/non valida o scaduta/);
    expect(await BankConnection.count()).toBe(0);
    expect(await Conto.count()).toBe(0);
  });

  it('lo state di un altro utente non collega il conto all\'attaccante', async () => {
    // L'attacco di account linking: l'attaccante intercetta o indovina lo
    // state della vittima e lo presenta con la propria sessione.
    const connect = await request(app).post('/api/bank-sync/connect')
      .set(utente.headers).send({ institution_id: 'SANDBOX_BANCA_IT' }).expect(201);
    const state = estraiState(connect.body.url_autorizzazione);

    const res = await request(app).post('/api/bank-sync/callback')
      .set(attaccante.headers)
      .send({ state });

    expect(res.status).toBe(400);
    expect(await BankConnection.count({ where: { user_id: attaccante.userId } })).toBe(0);
    expect(await Conto.count({ where: { user_id: attaccante.userId } })).toBe(0);

    // Lo state della vittima è ancora valido: il tentativo dell'attaccante
    // non glielo ha consumato.
    const suo = await request(app).post('/api/bank-sync/callback')
      .set(utente.headers).send({ state });
    expect(suo.status).toBe(201);

    // E viene registrato un evento di rifiuto, per poterlo diagnosticare.
    expect(await AuditLog.count({ where: { evento: 'bank_callback_refused' } }))
      .toBeGreaterThanOrEqual(1);
  });

  it('lo state è MONOUSO: riusarlo non crea una seconda connessione', async () => {
    const { callback, state } = await collegaBanca(app, utente.headers);
    expect(callback.status).toBe(201);

    const ripetuto = await request(app).post('/api/bank-sync/callback')
      .set(utente.headers).send({ state }).expect(200);

    // Idempotente: la seconda consegna restituisce la connessione esistente.
    expect(ripetuto.body.ripetuto).toBe(true);
    expect(await BankConnection.count({ where: { user_id: utente.userId } })).toBe(1);
    expect(await Conto.count({ where: { user_id: utente.userId } })).toBe(1);
  });

  it('due callback simultanei con lo stesso state producono UNA connessione', async () => {
    const connect = await request(app).post('/api/bank-sync/connect')
      .set(utente.headers).send({ institution_id: 'SANDBOX_BANCA_IT' }).expect(201);
    const state = estraiState(connect.body.url_autorizzazione);

    await Promise.all([
      request(app).post('/api/bank-sync/callback').set(utente.headers).send({ state }),
      request(app).post('/api/bank-sync/callback').set(utente.headers).send({ state }),
      request(app).post('/api/bank-sync/callback').set(utente.headers).send({ state }),
    ]);

    expect(await Conto.count({ where: { user_id: utente.userId } })).toBe(1);
    expect(await BankConnection.count({
      where: { user_id: utente.userId, status: STATO_ATTIVA },
    })).toBe(1);
  });

  it('uno state scaduto viene rifiutato', async () => {
    const connect = await request(app).post('/api/bank-sync/connect')
      .set(utente.headers).send({ institution_id: 'SANDBOX_BANCA_IT' }).expect(201);
    const state = estraiState(connect.body.url_autorizzazione);

    await BankConnection.update(
      { state_expires_at: new Date(Date.now() - 1000) },
      { where: { user_id: utente.userId } },
    );

    const res = await request(app).post('/api/bank-sync/callback')
      .set(utente.headers).send({ state });
    expect(res.status).toBe(400);
    expect(await Conto.count({ where: { user_id: utente.userId } })).toBe(0);
  });

  it('nel database c\'è solo l\'hash dello state, mai lo state', async () => {
    const connect = await request(app).post('/api/bank-sync/connect')
      .set(utente.headers).send({ institution_id: 'SANDBOX_BANCA_IT' }).expect(201);
    const state = estraiState(connect.body.url_autorizzazione);

    const righe = await BankConnection.findAll({ raw: true });
    const serializzato = JSON.stringify(righe);
    expect(serializzato).not.toContain(state);
    expect(righe[0].state_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('il callback senza autenticazione non funziona, nemmeno con uno state valido', async () => {
    // È la ragione per cui il callback è una POST autenticata della SPA e non
    // una GET che il browser segue: un link costruito da un sito terzo non
    // porta la sessione, quindi non può completare un collegamento.
    const connect = await request(app).post('/api/bank-sync/connect')
      .set(utente.headers).send({ institution_id: 'SANDBOX_BANCA_IT' }).expect(201);
    const state = estraiState(connect.body.url_autorizzazione);

    await request(app).post('/api/bank-sync/callback').send({ state }).expect(401);
    expect(await Conto.count({ where: { user_id: utente.userId } })).toBe(0);
  });
});

describe('accedere ai token e ai segreti del provider', () => {
  it('nessuna risposta API contiene identificatori o segreti del provider', async () => {
    azzeraConfigurazione();
    await abilitaSandbox();
    const utente = await creaUtente(app);
    await concediEntitlement(utente.userId, { source: SOURCE_BETA_25 });
    await collegaBanca(app, utente.headers);
    await request(app).post('/api/bank-sync/sync').set(utente.headers).expect(200);

    const risposte = await Promise.all([
      request(app).get('/api/bank-sync/status').set(utente.headers),
      request(app).get('/api/piano').set(utente.headers),
      request(app).get('/api/conti').set(utente.headers),
      request(app).get('/api/movimenti').set(utente.headers),
    ]);

    const tutto = risposte.map((r) => JSON.stringify(r.body)).join('\n');
    for (const vietato of [
      'sbx-req-', 'sbx-acc-', 'state_hash', 'provider_connection_id',
      'provider_account_id', 'secret', 'access_token',
      'IT60X0542811101000000123456',
    ]) {
      expect(tutto).not.toContain(vietato);
    }
  });

  it('il database non contiene credenziali bancarie in nessuna colonna', async () => {
    azzeraConfigurazione();
    await abilitaSandbox();
    const utente = await creaUtente(app);
    await concediEntitlement(utente.userId, { source: SOURCE_BETA_25 });
    await collegaBanca(app, utente.headers);

    const riga = await BankConnection.findOne({ raw: true });
    const colonne = Object.keys(riga);
    for (const vietata of [
      'password', 'pin', 'cvv', 'access_token', 'refresh_token',
      'secret', 'client_secret', 'iban',
    ]) {
      expect(colonne).not.toContain(vietata);
    }
    // L'unica colonna che somiglia a un IBAN è quella mascherata.
    expect(colonne).toContain('iban_mascherato');
    expect(riga.iban_mascherato).not.toContain('0542811101');
  });

  it('l\'audit log non registra token né importi', async () => {
    azzeraConfigurazione();
    await abilitaSandbox();
    const utente = await creaUtente(app);
    await concediEntitlement(utente.userId, { source: SOURCE_BETA_25 });
    await collegaBanca(app, utente.headers);
    await request(app).post('/api/bank-sync/sync').set(utente.headers).expect(200);

    const eventi = await AuditLog.findAll({ raw: true });
    expect(eventi.length).toBeGreaterThan(0);
    const serializzato = JSON.stringify(eventi);

    // Importi del sandbox: nessuno deve comparire.
    for (const importo of ['2345.67', '1850', '42.5', 'ESSELUNGA', 'NETFLIX']) {
      expect(serializzato).not.toContain(importo);
    }
    expect(serializzato).not.toMatch(/eyJ[A-Za-z0-9_-]+\./);
  });
});

describe('abusare della sincronizzazione', () => {
  it('il rate limit scatta davvero (verificato disattivando il bypass dei test)', async () => {
    // `tests/helpers` normalmente aggira i limiti per-utente, perché gli id
    // utente si ripetono fra i test. Qui il bypass viene disattivato, così il
    // limite è quello di produzione.
    process.env.RATE_LIMIT_NEI_TEST = 'on';
    try {
      azzeraConfigurazione();
      const utente = await creaUtente(app);

      // bankClaimLimiter: 5 tentativi / ora.
      const esiti = [];
      for (let i = 0; i < 8; i += 1) {
        const res = await request(app).post('/api/bank-sync/claim-beta').set(utente.headers);
        esiti.push(res.status);
      }
      expect(esiti).toContain(429);
    } finally {
      delete process.env.RATE_LIMIT_NEI_TEST;
    }
  });

  it('il cooldown impedisce di consumare quota del provider a raffica', async () => {
    azzeraConfigurazione();
    await abilitaSandbox({ cooldown: 300 });
    const utente = await creaUtente(app);
    await concediEntitlement(utente.userId, { source: SOURCE_BETA_25 });
    await collegaBanca(app, utente.headers);

    await request(app).post('/api/bank-sync/sync').set(utente.headers).expect(200);

    const res = await request(app).post('/api/bank-sync/sync').set(utente.headers);
    expect(res.status).toBe(429);
    expect(res.body.codice).toBe('COOLDOWN');
    expect(res.body.dettagli.riprova_fra_secondi).toBeGreaterThan(0);
    // Nessun movimento aggiuntivo, nessun doppione.
    expect(await Movimento.count({ where: { user_id: utente.userId } })).toBe(3);
  });
});

describe('area di amministrazione', () => {
  let amministratore;
  let utente;

  beforeEach(async () => {
    azzeraConfigurazione();
    await abilitaSandbox();
    amministratore = await creaUtente(app);
    await rendiAdmin(amministratore.userId);
    utente = await creaUtente(app);
  });

  it('a un utente normale l\'area non esiste: 404, non 403', async () => {
    // Che esista un\'area di amministrazione non è un'informazione utile a un
    // utente normale.
    const rotte = [
      ['get', '/api/admin/riepilogo'],
      ['get', '/api/admin/utenti'],
      ['get', '/api/admin/config'],
      ['get', '/api/admin/audit'],
      ['post', '/api/admin/entitlements/grant'],
      ['post', '/api/admin/entitlements/revoke'],
      ['put', '/api/admin/config'],
    ];
    for (const [metodo, percorso] of rotte) {
      const res = await request(app)[metodo](percorso).set(utente.headers).send({});
      expect(res.status).toBe(404);
    }
  });

  it('senza autenticazione risponde 401', async () => {
    await request(app).get('/api/admin/riepilogo').expect(401);
  });

  it('l\'amministratore vede il riepilogo, senza dati finanziari altrui', async () => {
    await concediEntitlement(utente.userId, { source: SOURCE_BETA_25 });
    await collegaBanca(app, utente.headers);
    await request(app).post('/api/bank-sync/sync').set(utente.headers).expect(200);

    const res = await request(app).get('/api/admin/riepilogo')
      .set(amministratore.headers).expect(200);

    expect(res.body.utenti_totali).toBe(2);
    expect(res.body.beta).toEqual(expect.objectContaining({ occupati: 1, limite: 25 }));
    expect(res.body.bank_sync.connessioni_attive).toBe(1);
    expect(res.body.ultimi_sync[0].movimenti_importati).toBe(3);

    // Metriche, non dati finanziari: nessun saldo, nessun importo, nessuna
    // descrizione di transazione.
    const serializzato = JSON.stringify(res.body);
    expect(serializzato).not.toContain('2345.67');
    expect(serializzato).not.toContain('ESSELUNGA');
  });

  it('concede e revoca Bank Sync, con audit e senza perdita di dati', async () => {
    await concediEntitlement(utente.userId, { source: SOURCE_BETA_25 });
    await collegaBanca(app, utente.headers);
    await request(app).post('/api/bank-sync/sync').set(utente.headers).expect(200);

    const revoca = await request(app).post('/api/admin/entitlements/revoke')
      .set(amministratore.headers)
      .send({ user_id: utente.userId, feature_key: 'bank_sync', nota: 'test' })
      .expect(200);

    expect(revoca.body.revocato).toBe(true);
    expect(revoca.body.connessioni_sospese).toBe(1);
    expect(revoca.body.movimenti_conservati).toBe(true);

    // Nessuna nuova sincronizzazione...
    await request(app).post('/api/bank-sync/sync').set(utente.headers).expect(403);
    // ...ma i movimenti già importati restano.
    expect(await Movimento.count({ where: { user_id: utente.userId } })).toBe(3);

    // E la concessione li rimette in funzione.
    await request(app).post('/api/admin/entitlements/grant')
      .set(amministratore.headers)
      .send({ user_id: utente.userId, feature_key: 'bank_sync' })
      .expect(200);
    const connessione = await BankConnection.findOne({ where: { user_id: utente.userId } });
    expect(connessione.status).toBe(STATO_ATTIVA);

    const audit = await AuditLog.findAll({
      where: { evento: ['admin_grant', 'admin_revoke'] }, raw: true,
    });
    expect(audit).toHaveLength(2);
    audit.forEach((e) => {
      expect(e.user_id).toBe(utente.userId);
      // La distinzione fra soggetto e attore è il motivo per cui l'audit
      // esiste: senza, non si saprebbe CHI ha concesso.
      expect(e.actor_user_id).toBe(amministratore.userId);
    });
  });

  it('la concessione amministrativa non consuma un posto beta', async () => {
    await impostaLimiteBeta(1);
    const beneficiario = await creaUtente(app);
    await request(app).post('/api/bank-sync/claim-beta').set(utente.headers).expect(201);

    await request(app).post('/api/admin/entitlements/grant')
      .set(amministratore.headers)
      .send({ user_id: beneficiario.userId, feature_key: 'bank_sync' })
      .expect(200);

    expect(await contaOccupati(FEATURE_BANK_SYNC)).toBe(1);
    const riga = await UserEntitlement.findOne({ where: { user_id: beneficiario.userId } });
    expect(riga.source).toBe(SOURCE_ADMIN);
    expect(riga.status).toBe(ENTITLEMENT_ATTIVO);
  });

  it('non può concedere a un utente che non esiste', async () => {
    await request(app).post('/api/admin/entitlements/grant')
      .set(amministratore.headers)
      .send({ user_id: 999999, feature_key: 'bank_sync' })
      .expect(404);
    expect(await UserEntitlement.count()).toBe(0);
  });

  it('non può concedere una feature inventata', async () => {
    await request(app).post('/api/admin/entitlements/grant')
      .set(amministratore.headers)
      .send({ user_id: utente.userId, feature_key: 'tutto_gratis' })
      .expect(400);
    expect(await UserEntitlement.count()).toBe(0);
  });

  it('l\'interruttore d\'emergenza funziona e viene auditato', async () => {
    const res = await request(app).put('/api/admin/config')
      .set(amministratore.headers)
      .send({ chiave: 'bank_sync_enabled', valore: false })
      .expect(200);
    expect(res.body.valore).toBe(false);

    await concediEntitlement(utente.userId, { source: SOURCE_BETA_25 });
    const bloccato = await request(app).post('/api/bank-sync/sync').set(utente.headers);
    expect(bloccato.status).toBe(403);
    expect(bloccato.body.motivo).toBe('feature_disattivata');

    expect(await AuditLog.count({ where: { evento: 'config_changed' } })).toBe(1);
  });

  it('rifiuta un valore di configurazione fuori intervallo o di tipo sbagliato', async () => {
    for (const valore of [-1, 'venticinque', 10 ** 9]) {
      const res = await request(app).put('/api/admin/config')
        .set(amministratore.headers)
        .send({ chiave: 'bank_sync_beta_limit', valore });
      expect(res.status).toBe(400);
    }
    for (const chiave of ['chiave_inventata', 'DROP TABLE users']) {
      const res = await request(app).put('/api/admin/config')
        .set(amministratore.headers)
        .send({ chiave, valore: 1 });
      expect(res.status).toBe(400);
    }
    expect(await AppConfig.count({ where: { chiave: 'bank_sync_beta_limit' } })).toBe(0);
  });

  it('la lista utenti mostra piano e origine del permesso, non i dati finanziari', async () => {
    await concediEntitlement(utente.userId, { source: SOURCE_BETA_25 });
    await collegaBanca(app, utente.headers);

    const res = await request(app).get('/api/admin/utenti?limite=10')
      .set(amministratore.headers).expect(200);

    const riga = res.body.utenti.find((u) => u.id === utente.userId);
    expect(riga.piano).toBe('premium_beta');
    expect(riga.bank_sync.source).toBe(SOURCE_BETA_25);
    expect(riga.banca.stato).toBe(STATO_ATTIVA);
    expect(JSON.stringify(res.body)).not.toContain('iban');
  });

  it('lo stato di un singolo utente non espone il suo IBAN mascherato', async () => {
    await concediEntitlement(utente.userId, { source: SOURCE_BETA_25 });
    await collegaBanca(app, utente.headers);

    const res = await request(app).get(`/api/admin/utenti/${utente.userId}/bank-sync`)
      .set(amministratore.headers).expect(200);

    expect(res.body.permesso_bank_sync.attiva).toBe(true);
    expect(res.body.connessione.iban_mascherato).toBeNull();
  });
});
