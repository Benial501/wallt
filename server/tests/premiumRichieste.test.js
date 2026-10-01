/**
 * Richieste di accesso a Premium: ciclo di vita, permessi e audit.
 *
 * Due domande guidano questa suite.
 *
 * La prima è funzionale: il pannello amministrativo deve poter distinguere
 * «tutti gli utenti» da «chi ha davvero chiesto Premium», e quella
 * distinzione deve sopravvivere al caso in cui i posti beta si esauriscono
 * a metà strada — chi arriva prima si attiva da solo e risulta
 * `auto_approved_beta`, chi arriva dopo resta `pending` e NON ottiene
 * nessun entitlement.
 *
 * La seconda è di sicurezza, e ogni test qui sotto è un tentativo che DEVE
 * fallire: approvarsi da soli, approvare per conto di un altro, leggere le
 * richieste altrui, far scrivere al server un `user_id` o uno `status`
 * arrivato dal client, entrare nell'area di amministrazione con un JWT
 * gonfiato di claim.
 *
 * Il principio che tutti verificano è uno solo: una richiesta NON è un
 * permesso. Nessuna riga di questa tabella autorizza alcunché — autorizza
 * `canUseFeature`, che guarda solo `user_entitlements`.
 */

const request = require('supertest');
const jwt = require('jsonwebtoken');
const { createApp } = require('../app');
const {
  PremiumAccessRequest, UserEntitlement, AuditLog,
} = require('../models');
const {
  FEATURE_BANK_SYNC,
  ENTITLEMENT_ATTIVO,
  SOURCE_BETA_25,
  SOURCE_ADMIN,
  SOURCE_PROMOTION,
  RICHIESTA_PENDING,
  RICHIESTA_APPROVED,
  RICHIESTA_REJECTED,
  RICHIESTA_CANCELLED,
  RICHIESTA_AUTO_APPROVED_BETA,
} = require('../constants/entitlements');
const { EVENTI } = require('../services/auditLog.service');
const { canUseFeature } = require('../services/entitlements.service');
const { contaOccupati, claimBetaSlot } = require('../services/betaSlots.service');
const {
  azzeraConfigurazione, creaUtente, rendiAdmin, concediEntitlement, impostaLimiteBeta,
} = require('./helpers/premium');

const app = createApp({ enableRateLimit: false });

/** Un amministratore vero: ruolo scritto nel database, come in produzione. */
const creaAdmin = async () => {
  const admin = await creaUtente(app);
  await rendiAdmin(admin.userId);
  return admin;
};

const richiestaDi = (userId) => PremiumAccessRequest.findOne({
  where: { user_id: userId, requested_feature: FEATURE_BANK_SYNC },
});

const eventiDi = (evento) => AuditLog.findAll({ where: { evento } });

// ═══════════════════════════════════════════════════════════════════════════
//  Chi può entrare nell'area di amministrazione
// ═══════════════════════════════════════════════════════════════════════════

describe('accesso all\'area di amministrazione', () => {
  beforeEach(() => azzeraConfigurazione());

  it('un account con ruolo admin nel database entra in tutte le rotte', async () => {
    const admin = await creaAdmin();

    // Le stesse rotte che la Dashboard Admin chiama all'apertura.
    for (const percorso of [
      '/api/admin/riepilogo',
      '/api/admin/utenti',
      '/api/admin/richieste-premium',
      '/api/admin/config',
      '/api/admin/audit',
    ]) {
      const res = await request(app).get(percorso).set(admin.headers);
      expect([percorso, res.status]).toEqual([percorso, 200]);
    }
  });

  it('un utente normale riceve 404 da ogni rotta amministrativa', async () => {
    const utente = await creaUtente(app);

    for (const percorso of [
      '/api/admin/riepilogo',
      '/api/admin/utenti',
      '/api/admin/richieste-premium',
    ]) {
      await request(app).get(percorso).set(utente.headers).expect(404);
    }
    // 404 e non 403: l'esistenza dell'area non è un'informazione utile a
    // chi non ci deve entrare.
    await request(app).post('/api/admin/richieste-premium/1/approva')
      .set(utente.headers).expect(404);
  });

  it('un JWT firmato correttamente ma con ruolo: admin non apre niente', async () => {
    // Il ruolo si legge dal DATABASE a ogni richiesta, mai dal token: se lo
    // leggesse dal token, chiunque riuscisse a farsene emettere uno con un
    // claim in più diventerebbe amministratore, e revocare un admin non
    // avrebbe effetto fino alla scadenza del suo token.
    const utente = await creaUtente(app);
    const gonfiato = jwt.sign(
      { userId: utente.userId, ruolo: 'admin', isAdmin: true, premium: true },
      process.env.JWT_SECRET,
      { expiresIn: '1h' },
    );
    const headers = { Authorization: `Bearer ${gonfiato}` };

    await request(app).get('/api/admin/richieste-premium').set(headers).expect(404);
    await request(app).post('/api/admin/richieste-premium/1/approva').set(headers).expect(404);
  });

  it('senza autenticazione ogni rotta risponde 401', async () => {
    await request(app).get('/api/admin/richieste-premium').expect(401);
    await request(app).post('/api/admin/richieste-premium/1/approva').expect(401);
    await request(app).get('/api/premium/richieste').expect(401);
    await request(app).post('/api/premium/request').expect(401);
  });

  it('revocare il ruolo chiude l\'accesso alla richiesta successiva', async () => {
    const admin = await creaAdmin();
    await request(app).get('/api/admin/riepilogo').set(admin.headers).expect(200);

    const { User } = require('../models');
    await User.update({ ruolo: 'utente' }, { where: { id: admin.userId } });

    // Stesso token di prima: il ruolo non ci è dentro, quindi la revoca ha
    // effetto immediato.
    await request(app).get('/api/admin/riepilogo').set(admin.headers).expect(404);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  L'utente crea la propria richiesta
// ═══════════════════════════════════════════════════════════════════════════

describe('creazione della richiesta', () => {
  beforeEach(() => azzeraConfigurazione());

  it('un utente può creare la propria richiesta e la ritrova', async () => {
    const utente = await creaUtente(app);

    const res = await request(app).post('/api/premium/request')
      .set(utente.headers).send({}).expect(201);

    expect(res.body.richiesta.status).toBe(RICHIESTA_PENDING);
    expect(res.body.richiesta.requested_feature).toBe(FEATURE_BANK_SYNC);
    expect(res.body.message).toMatch(/Richiesta inviata/i);

    const lettura = await request(app).get('/api/premium/richieste')
      .set(utente.headers).expect(200);
    expect(lettura.body.richiesta.id).toBe(res.body.richiesta.id);
  });

  it('la richiesta NON concede nessun entitlement', async () => {
    // È il punto dell'intera architettura: chiedere non è ottenere.
    const utente = await creaUtente(app);
    await request(app).post('/api/premium/request').set(utente.headers).expect(201);

    expect(await UserEntitlement.count()).toBe(0);
    expect((await canUseFeature(utente.userId, FEATURE_BANK_SYNC)).consentito).toBe(false);
    await request(app).post('/api/bank-sync/sync').set(utente.headers).expect(403);
  });

  it('il server ignora user_id, status e reviewed_by arrivati dal client', async () => {
    const vittima = await creaUtente(app);
    const attaccante = await creaUtente(app);

    await request(app).post('/api/premium/request')
      .set(attaccante.headers)
      .send({
        user_id: vittima.userId,
        status: RICHIESTA_APPROVED,
        reviewed_by: vittima.userId,
        reviewed_at: new Date().toISOString(),
        requested_at: '2000-01-01T00:00:00.000Z',
        decision_reason: 'me la approvo da solo',
      })
      .expect(201);

    const righe = await PremiumAccessRequest.findAll();
    expect(righe).toHaveLength(1);
    expect(righe[0].user_id).toBe(attaccante.userId);
    expect(righe[0].status).toBe(RICHIESTA_PENDING);
    expect(righe[0].reviewed_by).toBeNull();
    expect(righe[0].decision_reason).toBeNull();
    // La data è quella del server, non quella suggerita dal client.
    expect(new Date(righe[0].requested_at).getFullYear()).toBeGreaterThan(2020);
    // E la vittima non ha nessuna richiesta a suo nome.
    expect(await richiestaDi(vittima.userId)).toBeNull();
  });

  it('una feature inventata viene rifiutata', async () => {
    const utente = await creaUtente(app);
    await request(app).post('/api/premium/request')
      .set(utente.headers)
      .send({ requested_feature: 'tutto_gratis' })
      .expect(400);
    expect(await PremiumAccessRequest.count()).toBe(0);
  });

  it('due richieste non creano due righe', async () => {
    const utente = await creaUtente(app);

    const prima = await request(app).post('/api/premium/request')
      .set(utente.headers).expect(201);
    const seconda = await request(app).post('/api/premium/request')
      .set(utente.headers).expect(200);

    expect(seconda.body.gia_inviata).toBe(true);
    expect(seconda.body.message).toMatch(/gi[àa] inviata/i);
    expect(seconda.body.richiesta.id).toBe(prima.body.richiesta.id);
    expect(await PremiumAccessRequest.count()).toBe(1);
  });

  it('due richieste SIMULTANEE non creano due righe', async () => {
    // Il vincolo è nel database (`UNIQUE(user_id, requested_feature)`), non
    // nel servizio: "controlla e poi inserisci" non è atomico, e due POST
    // nello stesso istante passerebbero entrambe il controllo applicativo.
    const utente = await creaUtente(app);

    const esiti = await Promise.all(
      Array.from({ length: 5 }, () => request(app).post('/api/premium/request').set(utente.headers)),
    );

    esiti.forEach((res) => expect([200, 201]).toContain(res.status));
    expect(await PremiumAccessRequest.count()).toBe(1);
    expect(esiti.filter((r) => r.status === 201)).toHaveLength(1);
  });

  it('una richiesta annullata può essere ripresentata, una rifiutata no', async () => {
    const admin = await creaAdmin();
    const utente = await creaUtente(app);

    const creata = await request(app).post('/api/premium/request')
      .set(utente.headers).expect(201);
    const id = creata.body.richiesta.id;

    // Annullare è un'azione dell'utente: ripresentarsi è legittimo.
    await request(app).delete(`/api/premium/richieste/${id}`)
      .set(utente.headers).expect(200);
    expect((await richiestaDi(utente.userId)).status).toBe(RICHIESTA_CANCELLED);

    const riaperta = await request(app).post('/api/premium/request')
      .set(utente.headers).expect(201);
    expect(riaperta.body.richiesta.id).toBe(id);
    expect(riaperta.body.richiesta.status).toBe(RICHIESTA_PENDING);
    expect(await PremiumAccessRequest.count()).toBe(1);

    // Rifiutare è una decisione dello staff: NON si aggira ripresentandosi.
    await request(app).post(`/api/admin/richieste-premium/${id}/rifiuta`)
      .set(admin.headers).send({ motivo: 'beta chiusa' }).expect(200);

    const dopoRifiuto = await request(app).post('/api/premium/request')
      .set(utente.headers).expect(200);
    expect(dopoRifiuto.body.richiesta.status).toBe(RICHIESTA_REJECTED);
    expect((await richiestaDi(utente.userId)).status).toBe(RICHIESTA_REJECTED);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  Isolamento fra utenti
// ═══════════════════════════════════════════════════════════════════════════

describe('isolamento delle richieste', () => {
  beforeEach(() => azzeraConfigurazione());

  it('un utente non vede le richieste di un altro', async () => {
    const primo = await creaUtente(app);
    const secondo = await creaUtente(app);

    await request(app).post('/api/premium/request').set(primo.headers).expect(201);

    const res = await request(app).get('/api/premium/richieste')
      .set(secondo.headers).expect(200);
    expect(res.body.richieste).toHaveLength(0);
    expect(res.body.richiesta).toBeNull();
  });

  it('un utente non può annullare la richiesta di un altro', async () => {
    const vittima = await creaUtente(app);
    const attaccante = await creaUtente(app);

    const creata = await request(app).post('/api/premium/request')
      .set(vittima.headers).expect(201);

    // 404 e non 403: con il filtro su `user_id` nella query la riga altrui
    // non viene nemmeno letta, quindi per questo utente non esiste.
    await request(app).delete(`/api/premium/richieste/${creata.body.richiesta.id}`)
      .set(attaccante.headers).expect(404);

    expect((await richiestaDi(vittima.userId)).status).toBe(RICHIESTA_PENDING);
  });

  it('un utente non può approvarsi né rifiutare nessuno', async () => {
    const utente = await creaUtente(app);
    const creata = await request(app).post('/api/premium/request')
      .set(utente.headers).expect(201);
    const id = creata.body.richiesta.id;

    // L'area amministrativa risponde 404 a chi non è admin.
    await request(app).post(`/api/admin/richieste-premium/${id}/approva`)
      .set(utente.headers).expect(404);
    await request(app).post(`/api/admin/richieste-premium/${id}/rifiuta`)
      .set(utente.headers).expect(404);

    // E nessuna rotta alternativa esiste.
    for (const [metodo, percorso] of [
      ['post', `/api/premium/richieste/${id}/approva`],
      ['put', `/api/premium/richieste/${id}`],
      ['patch', `/api/premium/richieste/${id}`],
      ['post', '/api/premium/approva'],
    ]) {
      const res = await request(app)[metodo](percorso).set(utente.headers).send({
        status: RICHIESTA_APPROVED,
      });
      expect(res.status).toBeGreaterThanOrEqual(400);
    }

    expect((await richiestaDi(utente.userId)).status).toBe(RICHIESTA_PENDING);
    expect(await UserEntitlement.count()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  Approvazione e rifiuto
// ═══════════════════════════════════════════════════════════════════════════

describe('decisioni amministrative', () => {
  beforeEach(() => azzeraConfigurazione());

  it('l\'admin approva e l\'utente ottiene Bank Sync con source admin', async () => {
    const admin = await creaAdmin();
    const utente = await creaUtente(app);
    const creata = await request(app).post('/api/premium/request')
      .set(utente.headers).expect(201);

    const res = await request(app)
      .post(`/api/admin/richieste-premium/${creata.body.richiesta.id}/approva`)
      .set(admin.headers).send({ motivo: 'primo beta tester esterno' })
      .expect(200);

    expect(res.body.approvata).toBe(true);
    expect(res.body.richiesta.status).toBe(RICHIESTA_APPROVED);

    const entitlement = await UserEntitlement.findOne({ where: { user_id: utente.userId } });
    expect(entitlement.source).toBe(SOURCE_ADMIN);
    expect(entitlement.status).toBe(ENTITLEMENT_ATTIVO);
    expect(entitlement.actor_user_id).toBe(admin.userId);
    expect((await canUseFeature(utente.userId, FEATURE_BANK_SYNC)).consentito).toBe(true);
  });

  it('approvare NON consuma uno dei posti beta', async () => {
    // È la proprietà che rende sensato il conteggio: lo staff può far
    // entrare qualcuno anche a posti esauriti senza falsare quanti posti
    // gratuiti sono stati davvero distribuiti.
    await impostaLimiteBeta(2);
    const admin = await creaAdmin();
    const [primo, secondo, terzo] = await Promise.all([
      creaUtente(app), creaUtente(app), creaUtente(app),
    ]);

    await claimBetaSlot(primo.userId);
    await claimBetaSlot(secondo.userId);
    expect(await contaOccupati(FEATURE_BANK_SYNC)).toBe(2);

    const creata = await request(app).post('/api/premium/request')
      .set(terzo.headers).expect(201);
    const res = await request(app)
      .post(`/api/admin/richieste-premium/${creata.body.richiesta.id}/approva`)
      .set(admin.headers).expect(200);

    expect(res.body.posto_beta_consumato).toBe(false);
    // I posti occupati non sono cambiati, pur essendo ora tre gli utenti
    // con Bank Sync.
    expect(await contaOccupati(FEATURE_BANK_SYNC)).toBe(2);
    expect(await UserEntitlement.count({
      where: { feature_key: FEATURE_BANK_SYNC, status: ENTITLEMENT_ATTIVO },
    })).toBe(3);
  });

  it('l\'admin rifiuta, la richiesta resta come storico e nessun diritto cambia', async () => {
    const admin = await creaAdmin();
    const utente = await creaUtente(app);
    const creata = await request(app).post('/api/premium/request')
      .set(utente.headers).expect(201);

    const res = await request(app)
      .post(`/api/admin/richieste-premium/${creata.body.richiesta.id}/rifiuta`)
      .set(admin.headers).send({ motivo: 'posti esauriti' })
      .expect(200);

    expect(res.body.rifiutata).toBe(true);

    // La riga NON è stata eliminata: resta la decisione, con chi e quando.
    const riga = await richiestaDi(utente.userId);
    expect(riga).not.toBeNull();
    expect(riga.status).toBe(RICHIESTA_REJECTED);
    expect(riga.reviewed_by).toBe(admin.userId);
    expect(riga.reviewed_at).not.toBeNull();
    expect(riga.decision_reason).toBe('posti esauriti');
    expect(await UserEntitlement.count()).toBe(0);
  });

  it('rifiutare NON revoca un entitlement ottenuto per altra via', async () => {
    // Brief, punto 10: rifiutare una domanda e togliere un diritto sono due
    // operazioni diverse. Un utente che ha Bank Sync per una promozione non
    // deve perderlo perché una sua richiesta è stata respinta.
    const admin = await creaAdmin();
    const utente = await creaUtente(app);
    await concediEntitlement(utente.userId, { source: SOURCE_PROMOTION });

    const creata = await request(app).post('/api/premium/request')
      .set(utente.headers).expect(201);
    const res = await request(app)
      .post(`/api/admin/richieste-premium/${creata.body.richiesta.id}/rifiuta`)
      .set(admin.headers).expect(200);

    expect(res.body.entitlement_invariati).toBe(true);
    const entitlement = await UserEntitlement.findOne({ where: { user_id: utente.userId } });
    expect(entitlement.status).toBe(ENTITLEMENT_ATTIVO);
    expect(entitlement.source).toBe(SOURCE_PROMOTION);
    expect((await canUseFeature(utente.userId, FEATURE_BANK_SYNC)).consentito).toBe(true);
  });

  it('revoca e rifiuto restano due eventi distinti e ricostruibili', async () => {
    // Una richiesta approvata può avere, dopo, l'entitlement revocato:
    // l'audit deve raccontare entrambe le cose separatamente.
    const admin = await creaAdmin();
    const utente = await creaUtente(app);
    const creata = await request(app).post('/api/premium/request')
      .set(utente.headers).expect(201);

    await request(app).post(`/api/admin/richieste-premium/${creata.body.richiesta.id}/approva`)
      .set(admin.headers).expect(200);
    await request(app).post('/api/admin/entitlements/revoke')
      .set(admin.headers)
      .send({ user_id: utente.userId, feature_key: FEATURE_BANK_SYNC })
      .expect(200);

    expect(await eventiDi(EVENTI.RICHIESTA_APPROVATA)).toHaveLength(1);
    expect(await eventiDi(EVENTI.ADMIN_REVOCA)).toHaveLength(1);
    // La richiesta resta approvata: è la storia di cosa fu deciso allora,
    // non lo stato attuale del permesso.
    expect((await richiestaDi(utente.userId)).status).toBe(RICHIESTA_APPROVED);
    expect((await canUseFeature(utente.userId, FEATURE_BANK_SYNC)).consentito).toBe(false);
  });

  it('approvare due volte la stessa richiesta non è un errore silenzioso', async () => {
    const admin = await creaAdmin();
    const utente = await creaUtente(app);
    const creata = await request(app).post('/api/premium/request')
      .set(utente.headers).expect(201);
    const id = creata.body.richiesta.id;

    await request(app).post(`/api/admin/richieste-premium/${id}/approva`)
      .set(admin.headers).expect(200);
    await request(app).post(`/api/admin/richieste-premium/${id}/approva`)
      .set(admin.headers).expect(409);

    expect(await UserEntitlement.count()).toBe(1);
  });

  it('una richiesta inesistente risponde 404 anche all\'admin', async () => {
    const admin = await creaAdmin();
    await request(app).post('/api/admin/richieste-premium/999999/approva')
      .set(admin.headers).expect(404);
    await request(app).post('/api/admin/richieste-premium/999999/rifiuta')
      .set(admin.headers).expect(404);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  Convivenza con i posti beta
// ═══════════════════════════════════════════════════════════════════════════

describe('beta e richieste', () => {
  beforeEach(() => azzeraConfigurazione());

  it('finché ci sono posti il claim continua ad attivarsi da solo', async () => {
    await impostaLimiteBeta(3);
    const utente = await creaUtente(app);

    const res = await request(app).post('/api/bank-sync/claim-beta')
      .set(utente.headers).expect(201);

    expect(res.body.attivato).toBe(true);
    const entitlement = await UserEntitlement.findOne({ where: { user_id: utente.userId } });
    expect(entitlement.source).toBe(SOURCE_BETA_25);
    expect((await canUseFeature(utente.userId, FEATURE_BANK_SYNC)).consentito).toBe(true);
  });

  it('il claim riuscito registra la richiesta come auto_approved_beta', async () => {
    await impostaLimiteBeta(3);
    const utente = await creaUtente(app);

    await request(app).post('/api/bank-sync/claim-beta').set(utente.headers).expect(201);

    const riga = await richiestaDi(utente.userId);
    expect(riga).not.toBeNull();
    expect(riga.status).toBe(RICHIESTA_AUTO_APPROVED_BETA);
    // Nessun revisore: non ha deciso una persona, ha deciso la quota.
    expect(riga.reviewed_by).toBeNull();
    expect(riga.reviewed_at).not.toBeNull();
    expect(await eventiDi(EVENTI.RICHIESTA_BETA_AUTO)).toHaveLength(1);
  });

  it('una richiesta pending diventa auto_approved_beta se poi l\'utente attiva', async () => {
    await impostaLimiteBeta(3);
    const utente = await creaUtente(app);

    await request(app).post('/api/premium/request').set(utente.headers).expect(201);
    expect((await richiestaDi(utente.userId)).status).toBe(RICHIESTA_PENDING);

    await request(app).post('/api/bank-sync/claim-beta').set(utente.headers).expect(201);

    expect((await richiestaDi(utente.userId)).status).toBe(RICHIESTA_AUTO_APPROVED_BETA);
    expect(await PremiumAccessRequest.count()).toBe(1);
  });

  it('oltre il limite il claim non attiva nulla e la richiesta resta pending', async () => {
    await impostaLimiteBeta(2);
    const [primo, secondo, tardivo] = await Promise.all([
      creaUtente(app), creaUtente(app), creaUtente(app),
    ]);

    await request(app).post('/api/bank-sync/claim-beta').set(primo.headers).expect(201);
    await request(app).post('/api/bank-sync/claim-beta').set(secondo.headers).expect(201);

    // Il terzo: posti esauriti.
    const claim = await request(app).post('/api/bank-sync/claim-beta')
      .set(tardivo.headers).expect(409);
    expect(claim.body.attivato).toBe(false);

    // Chiede l'accesso e resta in attesa, SENZA entitlement.
    const richiesta = await request(app).post('/api/premium/request')
      .set(tardivo.headers).expect(201);
    expect(richiesta.body.richiesta.status).toBe(RICHIESTA_PENDING);

    expect(await UserEntitlement.count()).toBe(2);
    expect((await canUseFeature(tardivo.userId, FEATURE_BANK_SYNC)).consentito).toBe(false);
    await request(app).post('/api/bank-sync/sync').set(tardivo.headers).expect(403);
  });

  it('chiedere accesso non assegna un posto beta nemmeno se ce ne sono', async () => {
    // I posti si prendono solo dal claim, che è l'unico punto che può
    // scrivere `beta_25` e lo fa dentro un lock. Una seconda strada verso
    // una quota a numero chiuso la renderebbe incontabile.
    await impostaLimiteBeta(5);
    const utente = await creaUtente(app);

    await request(app).post('/api/premium/request').set(utente.headers).expect(201);

    expect(await contaOccupati(FEATURE_BANK_SYNC)).toBe(0);
    expect(await UserEntitlement.count()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  Il pannello amministrativo
// ═══════════════════════════════════════════════════════════════════════════

describe('elenco e contatori per lo staff', () => {
  beforeEach(() => azzeraConfigurazione());

  it('l\'elenco distingue gli stati e li conta tutti, anche a zero', async () => {
    await impostaLimiteBeta(1);
    const admin = await creaAdmin();
    const [beta, inAttesa, daRifiutare] = await Promise.all([
      creaUtente(app), creaUtente(app), creaUtente(app),
    ]);

    await request(app).post('/api/bank-sync/claim-beta').set(beta.headers).expect(201);
    await request(app).post('/api/premium/request').set(inAttesa.headers).expect(201);
    const terza = await request(app).post('/api/premium/request')
      .set(daRifiutare.headers).expect(201);
    await request(app).post(`/api/admin/richieste-premium/${terza.body.richiesta.id}/rifiuta`)
      .set(admin.headers).expect(200);

    const res = await request(app).get('/api/admin/richieste-premium')
      .set(admin.headers).expect(200);

    expect(res.body.richieste).toHaveLength(3);
    expect(res.body.contatori).toMatchObject({
      [RICHIESTA_PENDING]: 1,
      [RICHIESTA_REJECTED]: 1,
      [RICHIESTA_AUTO_APPROVED_BETA]: 1,
      [RICHIESTA_APPROVED]: 0,
      [RICHIESTA_CANCELLED]: 0,
      totale: 3,
    });

    // Ogni riga porta con sé chi è l'utente e che permesso ha: sono i dati
    // su cui lo staff decide.
    const riga = res.body.richieste.find((r) => r.user_id === beta.userId);
    expect(riga.email).toBe(beta.email);
    expect(riga.bank_sync).toMatchObject({ source: SOURCE_BETA_25, attivo: true });
  });

  it('il filtro per stato restituisce solo quello stato', async () => {
    const admin = await creaAdmin();
    const [uno, due] = await Promise.all([creaUtente(app), creaUtente(app)]);

    await request(app).post('/api/premium/request').set(uno.headers).expect(201);
    const seconda = await request(app).post('/api/premium/request')
      .set(due.headers).expect(201);
    await request(app).post(`/api/admin/richieste-premium/${seconda.body.richiesta.id}/approva`)
      .set(admin.headers).expect(200);

    const pending = await request(app).get('/api/admin/richieste-premium?stato=pending')
      .set(admin.headers).expect(200);
    expect(pending.body.richieste).toHaveLength(1);
    expect(pending.body.richieste[0].user_id).toBe(uno.userId);

    await request(app).get('/api/admin/richieste-premium?stato=inventato')
      .set(admin.headers).expect(400);
  });

  it('il riepilogo riporta le richieste accanto a utenti e posti beta', async () => {
    const admin = await creaAdmin();
    const utente = await creaUtente(app);
    await request(app).post('/api/premium/request').set(utente.headers).expect(201);

    const res = await request(app).get('/api/admin/riepilogo')
      .set(admin.headers).expect(200);

    expect(res.body.richieste_premium[RICHIESTA_PENDING]).toBe(1);
    expect(res.body.utenti_totali).toBeGreaterThanOrEqual(2);
    expect(res.body.utenti_free).toBeGreaterThanOrEqual(2);
    expect(res.body.beta).toHaveProperty('limite');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  Audit
// ═══════════════════════════════════════════════════════════════════════════

describe('tracciabilità', () => {
  beforeEach(() => azzeraConfigurazione());

  it('ogni passaggio di stato lascia un evento con soggetto e attore giusti', async () => {
    const admin = await creaAdmin();
    const utente = await creaUtente(app);

    const creata = await request(app).post('/api/premium/request')
      .set(utente.headers).expect(201);
    const id = creata.body.richiesta.id;

    const creazione = (await eventiDi(EVENTI.RICHIESTA_CREATA))[0];
    expect(creazione.user_id).toBe(utente.userId);
    // Nessun attore: l'ha fatto l'utente stesso, non qualcuno per lui.
    expect(creazione.actor_user_id).toBeNull();
    expect(creazione.entita).toBe('premium_request');

    await request(app).delete(`/api/premium/richieste/${id}`)
      .set(utente.headers).expect(200);
    const annullamento = (await eventiDi(EVENTI.RICHIESTA_ANNULLATA))[0];
    expect(annullamento.user_id).toBe(utente.userId);
    expect(annullamento.actor_user_id).toBeNull();

    await request(app).post('/api/premium/request').set(utente.headers).expect(201);
    await request(app).post(`/api/admin/richieste-premium/${id}/approva`)
      .set(admin.headers).expect(200);

    const approvazione = (await eventiDi(EVENTI.RICHIESTA_APPROVATA))[0];
    // Qui soggetto e attore sono due persone diverse: è la distinzione per
    // cui l'audit esiste.
    expect(approvazione.user_id).toBe(utente.userId);
    expect(approvazione.actor_user_id).toBe(admin.userId);
    expect(approvazione.metadata.source).toBe(SOURCE_ADMIN);
  });

  it('l\'audit non registra il motivo scritto dallo staff, solo che c\'era', async () => {
    // `metadata` passa dal sanitizzatore del logger e non è il posto dove
    // mettere testo libero su una persona: il motivo resta nella riga della
    // richiesta, che è il suo posto.
    const admin = await creaAdmin();
    const utente = await creaUtente(app);
    const creata = await request(app).post('/api/premium/request')
      .set(utente.headers).expect(201);

    await request(app).post(`/api/admin/richieste-premium/${creata.body.richiesta.id}/rifiuta`)
      .set(admin.headers).send({ motivo: 'non ci piace la sua faccia' })
      .expect(200);

    const evento = (await eventiDi(EVENTI.RICHIESTA_RIFIUTATA))[0];
    expect(JSON.stringify(evento.metadata)).not.toMatch(/faccia/i);
    expect(evento.metadata.con_motivo).toBe(true);
  });

  it('l\'audit delle richieste è leggibile solo dall\'area amministrativa', async () => {
    const utente = await creaUtente(app);
    await request(app).post('/api/premium/request').set(utente.headers).expect(201);

    // Nemmeno il soggetto dell'evento può leggere l'audit: le azioni dello
    // staff non sono un dato dell'utente.
    await request(app).get('/api/admin/audit').set(utente.headers).expect(404);
  });
});
