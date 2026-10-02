/**
 * Il sistema di entitlement: l'unico punto di verità sui permessi.
 *
 * Il difetto che queste prove esistono per impedire è architetturale, non un
 * bug: un `user.premium = true` sparso nel codice. Qui si verifica che
 * `canUseFeature` sia davvero l'unica porta, che il piano commerciale resti
 * distinto dal permesso, e che nessuna strada permetta a un utente di
 * assegnarsi un diritto.
 */

const request = require('supertest');
const { createApp } = require('../app');
const { User, UserEntitlement, Subscription } = require('../models');
const {
  FEATURE_BANK_SYNC, ENTITLEMENT_ATTIVO, ENTITLEMENT_REVOCATO,
  SOURCE_BETA_25, SOURCE_ADMIN, SOURCE_PROMOTION, SOURCE_PREMIUM_SUBSCRIPTION,
  PIANO_FREE, PIANO_PREMIUM_BETA, PIANO_PREMIUM,
  SUB_ATTIVA, SUB_ANNULLATA, SUB_INSOLUTA,
} = require('../constants/entitlements');
const {
  canUseFeature, grantEntitlement, revokeEntitlement, descriviPiano, MOTIVI,
} = require('../services/entitlements.service');
const {
  allineaEntitlementDaSubscription,
} = require('../services/billing/subscriptionEntitlements.service');
const {
  azzeraConfigurazione, impostaBankSyncAttivo, creaUtente, concediEntitlement,
} = require('./helpers/premium');
const { contaOccupati: contaOccupatiBeta } = require('../services/betaSlots.service');

const app = createApp({ enableRateLimit: false });

describe('canUseFeature — le tre condizioni', () => {
  let utente;

  beforeEach(async () => {
    azzeraConfigurazione();
    utente = await creaUtente(app);
  });

  it('nega una feature che non esiste, invece di accettare una stringa dal client', async () => {
    const esito = await canUseFeature(utente.userId, 'bank_sync_pro');
    expect(esito.consentito).toBe(false);
    expect(esito.motivo).toBe(MOTIVI.FEATURE_SCONOSCIUTA);
  });

  it('nega a un utente senza entitlement', async () => {
    const esito = await canUseFeature(utente.userId, FEATURE_BANK_SYNC);
    expect(esito.consentito).toBe(false);
    expect(esito.motivo).toBe(MOTIVI.NESSUN_ENTITLEMENT);
  });

  it('consente con un entitlement attivo e dice da dove viene', async () => {
    await concediEntitlement(utente.userId, { source: SOURCE_BETA_25 });
    const esito = await canUseFeature(utente.userId, FEATURE_BANK_SYNC);
    expect(esito.consentito).toBe(true);
    expect(esito.source).toBe(SOURCE_BETA_25);
  });

  it('l\'interruttore globale nega anche a chi HA l\'entitlement, senza togliergliela', async () => {
    await concediEntitlement(utente.userId, { source: SOURCE_BETA_25 });
    await impostaBankSyncAttivo(false);

    const esito = await canUseFeature(utente.userId, FEATURE_BANK_SYNC);
    expect(esito.consentito).toBe(false);
    expect(esito.motivo).toBe(MOTIVI.FEATURE_DISATTIVATA);

    // Il diritto non è stato revocato: riaccendendo l'interruttore torna.
    const riga = await UserEntitlement.findOne({ where: { user_id: utente.userId } });
    expect(riga.status).toBe(ENTITLEMENT_ATTIVO);

    await impostaBankSyncAttivo(true);
    expect((await canUseFeature(utente.userId, FEATURE_BANK_SYNC)).consentito).toBe(true);
  });

  it('nega un entitlement revocato', async () => {
    await concediEntitlement(utente.userId, { status: ENTITLEMENT_REVOCATO });
    const esito = await canUseFeature(utente.userId, FEATURE_BANK_SYNC);
    expect(esito.consentito).toBe(false);
    expect(esito.motivo).toBe(MOTIVI.REVOCATO);
  });

  it('nega un entitlement scaduto guardando la DATA, non la colonna status', async () => {
    // La riga dice ancora `active`: è il caso che renderebbe inutile un cron
    // di scadenza, e che una verifica basata sullo stato lascerebbe passare.
    await concediEntitlement(utente.userId, {
      source: SOURCE_PROMOTION,
      status: ENTITLEMENT_ATTIVO,
      expiresAt: new Date(Date.now() - 60 * 1000),
    });

    const esito = await canUseFeature(utente.userId, FEATURE_BANK_SYNC);
    expect(esito.consentito).toBe(false);
    expect(esito.motivo).toBe(MOTIVI.SCADUTO);

    // E lo stato viene allineato, senza che la decisione dipendesse da questo.
    const riga = await UserEntitlement.findOne({ where: { user_id: utente.userId } });
    expect(riga.status).toBe('expired');
  });

  it('consente un entitlement con scadenza futura', async () => {
    await concediEntitlement(utente.userId, {
      source: SOURCE_PROMOTION,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });
    expect((await canUseFeature(utente.userId, FEATURE_BANK_SYNC)).consentito).toBe(true);
  });

  it('gli entitlement sono per-utente: quello di A non autorizza B', async () => {
    const altro = await creaUtente(app);
    await concediEntitlement(utente.userId, { source: SOURCE_BETA_25 });

    expect((await canUseFeature(utente.userId, FEATURE_BANK_SYNC)).consentito).toBe(true);
    expect((await canUseFeature(altro.userId, FEATURE_BANK_SYNC)).consentito).toBe(false);
  });
});

describe('grantEntitlement e revokeEntitlement', () => {
  let utente;

  beforeEach(async () => {
    azzeraConfigurazione();
    utente = await creaUtente(app);
  });

  it('rifiuta di assegnare un posto beta: quella strada passa solo dal lock', async () => {
    // Se questo passasse, esisterebbero DUE modi di occupare un posto a
    // numero chiuso, e uno dei due non conterebbe i posti.
    await expect(grantEntitlement({
      userId: utente.userId,
      featureKey: FEATURE_BANK_SYNC,
      source: SOURCE_BETA_25,
    })).rejects.toThrow(/betaSlots/);

    expect(await UserEntitlement.count({ where: { user_id: utente.userId } })).toBe(0);
  });

  it('rifiuta un\'origine inventata', async () => {
    await expect(grantEntitlement({
      userId: utente.userId,
      featureKey: FEATURE_BANK_SYNC,
      source: 'me_lo_sono_dato_da_solo',
    })).rejects.toThrow(/Origine entitlement non valida/);
  });

  it('è idempotente e NON sovrascrive il source di un entitlement già attivo', async () => {
    // Il caso concreto: un beta tester a cui lo staff concede l'accesso.
    // Sovrascrivere `beta_25` con `admin` libererebbe silenziosamente un
    // posto beta, falsando la quota dei 25.
    await concediEntitlement(utente.userId, { source: SOURCE_BETA_25 });

    const esito = await grantEntitlement({
      userId: utente.userId,
      featureKey: FEATURE_BANK_SYNC,
      source: SOURCE_ADMIN,
    });

    expect(esito.giaAttivo).toBe(true);
    expect(esito.creato).toBe(false);
    const riga = await UserEntitlement.findOne({ where: { user_id: utente.userId } });
    expect(riga.source).toBe(SOURCE_BETA_25);
    expect(await UserEntitlement.count({ where: { user_id: utente.userId } })).toBe(1);
  });

  it('riattiva un entitlement revocato con la nuova origine', async () => {
    await concediEntitlement(utente.userId, {
      source: SOURCE_BETA_25, status: ENTITLEMENT_REVOCATO,
    });

    const esito = await grantEntitlement({
      userId: utente.userId,
      featureKey: FEATURE_BANK_SYNC,
      source: SOURCE_ADMIN,
    });

    expect(esito.giaAttivo).toBe(false);
    const riga = await UserEntitlement.findOne({ where: { user_id: utente.userId } });
    expect(riga.status).toBe(ENTITLEMENT_ATTIVO);
    expect(riga.source).toBe(SOURCE_ADMIN);
    // Una sola riga: la UNIQUE(user_id, feature_key) regge.
    expect(await UserEntitlement.count({ where: { user_id: utente.userId } })).toBe(1);
  });

  it('revoca e segnala se il diritto era attivo', async () => {
    await concediEntitlement(utente.userId, { source: SOURCE_ADMIN });

    const primo = await revokeEntitlement({
      userId: utente.userId, featureKey: FEATURE_BANK_SYNC,
    });
    expect(primo.eraAttivo).toBe(true);

    // Seconda revoca: idempotente, e non mente dicendo che era attivo.
    const secondo = await revokeEntitlement({
      userId: utente.userId, featureKey: FEATURE_BANK_SYNC,
    });
    expect(secondo.eraAttivo).toBe(false);

    expect((await canUseFeature(utente.userId, FEATURE_BANK_SYNC)).consentito).toBe(false);
  });

  it('revocare un entitlement che non esiste non crea nulla', async () => {
    const esito = await revokeEntitlement({
      userId: utente.userId, featureKey: FEATURE_BANK_SYNC,
    });
    expect(esito.eraAttivo).toBe(false);
    expect(esito.entitlement).toBeNull();
    expect(await UserEntitlement.count({ where: { user_id: utente.userId } })).toBe(0);
  });
});

describe('descriviPiano — il piano commerciale non è il permesso', () => {
  beforeEach(() => azzeraConfigurazione());

  it('senza abbonamento né beta è Free', async () => {
    const utente = await creaUtente(app);
    const piano = await descriviPiano(utente.userId);
    expect(piano.piano).toBe(PIANO_FREE);
    expect(piano.gratuito).toBe(true);
    expect(piano.abbonamento).toBeNull();
  });

  it('un posto beta fa Premium Beta, gratuito', async () => {
    const utente = await creaUtente(app);
    await concediEntitlement(utente.userId, { source: SOURCE_BETA_25 });

    const piano = await descriviPiano(utente.userId);
    expect(piano.piano).toBe(PIANO_PREMIUM_BETA);
    expect(piano.gratuito).toBe(true);
  });

  it('una concessione dello staff dà Premium, ma NON un posto beta', async () => {
    // Fino a ottobre 2026 questo caso restava a `free`: letteralmente vero
    // (non paga) ma incomprensibile per chi aveva appena ottenuto l'accesso
    // e continuava a leggere "WALLT Free". Ciò che va protetto non è
    // l'etichetta `free`, è che la concessione NON si confonda con un posto
    // dei 25: quel conteggio deve restare leggibile.
    const utente = await creaUtente(app);
    await concediEntitlement(utente.userId, { source: SOURCE_ADMIN });

    const piano = await descriviPiano(utente.userId);
    expect(piano.piano).toBe(PIANO_PREMIUM);
    expect(piano.piano).not.toBe(PIANO_PREMIUM_BETA);
    // Resta gratuito: "premium" dice cosa ha, non che paghi.
    expect(piano.gratuito).toBe(true);
    expect(piano.abbonamento).toBeNull();
    expect(await contaOccupatiBeta(FEATURE_BANK_SYNC)).toBe(0);
    expect((await canUseFeature(utente.userId, FEATURE_BANK_SYNC)).consentito).toBe(true);
  });

  it('senza nessun diritto attivo il piano resta Free', async () => {
    const utente = await creaUtente(app);
    expect((await descriviPiano(utente.userId)).piano).toBe(PIANO_FREE);
  });

  it('un diritto revocato non tiene in piedi il piano', async () => {
    const utente = await creaUtente(app);
    await concediEntitlement(utente.userId, { source: SOURCE_ADMIN, status: ENTITLEMENT_REVOCATO });
    expect((await descriviPiano(utente.userId)).piano).toBe(PIANO_FREE);
  });

  it('un abbonamento attivo vince sul posto beta e non espone gli id del fornitore', async () => {
    const utente = await creaUtente(app);
    await concediEntitlement(utente.userId, { source: SOURCE_BETA_25 });
    await Subscription.create({
      user_id: utente.userId,
      plan: PIANO_PREMIUM,
      status: SUB_ATTIVA,
      billing_provider: 'stripe',
      provider_customer_id: 'cus_segreto',
      provider_subscription_id: 'sub_segreto',
      current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });

    const piano = await descriviPiano(utente.userId);
    expect(piano.piano).toBe(PIANO_PREMIUM);
    expect(piano.gratuito).toBe(false);
    expect(JSON.stringify(piano)).not.toContain('cus_segreto');
    expect(JSON.stringify(piano)).not.toContain('sub_segreto');
  });

  it('un abbonamento annullato non dà diritti', async () => {
    const utente = await creaUtente(app);
    await Subscription.create({
      user_id: utente.userId, plan: PIANO_PREMIUM, status: SUB_ANNULLATA,
    });
    expect((await descriviPiano(utente.userId)).piano).toBe(PIANO_FREE);
  });

  it('un pagamento in ritardo NON spegne la feature mentre il provider ritenta', async () => {
    const utente = await creaUtente(app);
    await Subscription.create({
      user_id: utente.userId, plan: PIANO_PREMIUM, status: SUB_INSOLUTA,
    });
    expect((await descriviPiano(utente.userId)).piano).toBe(PIANO_PREMIUM);
  });
});

describe('subscription → entitlement (il ponte verso i pagamenti futuri)', () => {
  beforeEach(() => azzeraConfigurazione());

  it('un abbonamento attivo produce l\'entitlement, e la sua revoca lo toglie', async () => {
    const utente = await creaUtente(app);
    const sub = await Subscription.create({
      user_id: utente.userId, plan: PIANO_PREMIUM, status: SUB_ATTIVA,
    });

    const concessione = await allineaEntitlementDaSubscription(utente.userId);
    expect(concessione.concesse).toContain(FEATURE_BANK_SYNC);
    expect((await canUseFeature(utente.userId, FEATURE_BANK_SYNC)).source)
      .toBe(SOURCE_PREMIUM_SUBSCRIPTION);

    await sub.update({ status: SUB_ANNULLATA });
    const revoca = await allineaEntitlementDaSubscription(utente.userId);
    expect(revoca.revocate).toContain(FEATURE_BANK_SYNC);
    expect((await canUseFeature(utente.userId, FEATURE_BANK_SYNC)).consentito).toBe(false);
  });

  it('è idempotente: lo stesso evento consegnato due volte non raddoppia nulla', async () => {
    const utente = await creaUtente(app);
    await Subscription.create({
      user_id: utente.userId, plan: PIANO_PREMIUM, status: SUB_ATTIVA,
    });

    await allineaEntitlementDaSubscription(utente.userId);
    await allineaEntitlementDaSubscription(utente.userId);

    expect(await UserEntitlement.count({ where: { user_id: utente.userId } })).toBe(1);
    expect((await canUseFeature(utente.userId, FEATURE_BANK_SYNC)).consentito).toBe(true);
  });

  it('la perdita dell\'abbonamento NON cancella un posto beta né una concessione admin', async () => {
    // Le origini sono indipendenti: si revoca solo ciò che si era concesso.
    const beta = await creaUtente(app);
    await concediEntitlement(beta.userId, { source: SOURCE_BETA_25 });
    await Subscription.create({
      user_id: beta.userId, plan: PIANO_PREMIUM, status: SUB_ANNULLATA,
    });

    await allineaEntitlementDaSubscription(beta.userId);

    const riga = await UserEntitlement.findOne({ where: { user_id: beta.userId } });
    expect(riga.status).toBe(ENTITLEMENT_ATTIVO);
    expect(riga.source).toBe(SOURCE_BETA_25);
    expect((await canUseFeature(beta.userId, FEATURE_BANK_SYNC)).consentito).toBe(true);
  });
});

describe('GET /api/piano', () => {
  beforeEach(() => azzeraConfigurazione());

  it('richiede autenticazione', async () => {
    await request(app).get('/api/piano').expect(401);
  });

  it('descrive piano, permessi e posti beta in una risposta coerente', async () => {
    const utente = await creaUtente(app);
    const res = await request(app).get('/api/piano').set(utente.headers).expect(200);

    expect(res.body.piano).toBe(PIANO_FREE);
    expect(res.body.piano_etichetta).toBe('WALLT Free');
    expect(res.body.bank_sync).toEqual(expect.objectContaining({ attiva: false }));
    expect(res.body.beta).toEqual(expect.objectContaining({
      attiva: true, limite: 25, rivendicabile: true,
    }));
    // Nessun pagamento implementato: la UI deve mostrare "prossimamente",
    // non un pulsante che finge un acquisto.
    expect(res.body.pagamenti_disponibili).toBe(false);
  });

  it('a chi ha già il permesso non propone di rivendicare un posto', async () => {
    const utente = await creaUtente(app);
    await concediEntitlement(utente.userId, { source: SOURCE_BETA_25 });

    const res = await request(app).get('/api/piano').set(utente.headers).expect(200);
    expect(res.body.bank_sync.attiva).toBe(true);
    expect(res.body.beta.rivendicabile).toBe(false);
  });

  it('non esiste nessuna rotta con cui un utente possa cambiarsi il piano', async () => {
    const utente = await creaUtente(app);
    for (const metodo of ['post', 'put', 'patch', 'delete']) {
      const res = await request(app)[metodo]('/api/piano')
        .set(utente.headers)
        .send({ piano: 'premium' });
      expect(res.status).toBe(404);
    }
    expect((await descriviPiano(utente.userId)).piano).toBe(PIANO_FREE);
  });

  it('il ruolo amministratore non è scrivibile dalle rotte applicative', async () => {
    const utente = await creaUtente(app);
    // Il tentativo più ovvio: passarlo fra le preferenze.
    await request(app)
      .put('/api/impostazioni/preferenze')
      .set(utente.headers)
      .send({ ruolo: 'admin', tema: 'light' });

    const riga = await User.findByPk(utente.userId, { attributes: ['ruolo'] });
    expect(riga.ruolo).toBe('utente');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  Il piano dello staff
// ═══════════════════════════════════════════════════════════════════════════

describe('piano staff', () => {
  const { PIANO_STAFF, PIANO_FREE, PIANO_PREMIUM_BETA, RUOLO_ADMIN } = require('../constants/entitlements');
  const { descriviPiano, descriviPianiBatch, derivaPiano } = require('../services/entitlements.service');
  const { contaOccupati } = require('../services/betaSlots.service');

  it('un amministratore legge "staff", un utente normale "free"', async () => {
    const admin = await creaUtente(app);
    const normale = await creaUtente(app);
    await User.update({ ruolo: RUOLO_ADMIN }, { where: { id: admin.userId } });

    expect((await descriviPiano(admin.userId)).piano).toBe(PIANO_STAFF);
    expect((await descriviPiano(normale.userId)).piano).toBe(PIANO_FREE);
  });

  it('il piano staff NON include nessuna feature: il permesso resta una concessione', async () => {
    // È il punto: un amministratore senza concessione non deve leggere
    // "inclusa" una funzione che non ha.
    const admin = await creaUtente(app);
    await User.update({ ruolo: RUOLO_ADMIN }, { where: { id: admin.userId } });

    const piano = await descriviPiano(admin.userId);
    expect(piano.piano).toBe(PIANO_STAFF);
    expect(piano.feature_incluse_nel_piano).toEqual([]);
    expect((await canUseFeature(admin.userId, FEATURE_BANK_SYNC)).consentito).toBe(false);
  });

  it('lo staff non occupa un posto beta', async () => {
    // La ragione per cui questo piano esiste invece di assegnare `beta_25`
    // all'amministratore.
    const admin = await creaUtente(app);
    await User.update({ ruolo: RUOLO_ADMIN }, { where: { id: admin.userId } });
    await concediEntitlement(admin.userId, { source: SOURCE_ADMIN });

    expect((await descriviPiano(admin.userId)).piano).toBe(PIANO_STAFF);
    expect(await contaOccupati(FEATURE_BANK_SYNC)).toBe(0);
  });

  it('un abbonamento reale vince sul ruolo', async () => {
    // Un amministratore che paga davvero è un cliente pagante.
    expect(derivaPiano({ plan: 'premium' }, [], { ruolo: RUOLO_ADMIN })).toBe('premium');
  });

  it('un posto beta resta premium_beta per chi non è staff', async () => {
    expect(derivaPiano(null, [{ source: SOURCE_BETA_25, status: ENTITLEMENT_ATTIVO }], { ruolo: 'utente' }))
      .toBe(PIANO_PREMIUM_BETA);
  });

  it('la lista amministrativa deriva lo stesso piano della scheda singola', async () => {
    // Una lista che mostrasse un piano diverso da quello della pagina del
    // singolo utente sarebbe peggio di una lista lenta.
    const admin = await creaUtente(app);
    const normale = await creaUtente(app);
    await User.update({ ruolo: RUOLO_ADMIN }, { where: { id: admin.userId } });

    const batch = await descriviPianiBatch([admin.userId, normale.userId]);
    expect(batch.get(admin.userId).piano).toBe((await descriviPiano(admin.userId)).piano);
    expect(batch.get(normale.userId).piano).toBe((await descriviPiano(normale.userId)).piano);
    expect(batch.get(admin.userId).piano).toBe(PIANO_STAFF);
  });
});
