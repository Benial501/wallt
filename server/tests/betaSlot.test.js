/**
 * I 25 posti della beta gratuita.
 *
 * Il caso critico non è "il 26° viene respinto" — quello lo prende qualunque
 * implementazione — ma la CONCORRENZA: 24 posti occupati, due utenti che
 * attivano nello stesso istante. Con il solo "conta e poi inserisci" a
 * isolamento READ COMMITTED entrambi leggono 24, entrambi inseriscono, e la
 * quota diventa 26/25. Nessuna UNIQUE lo impedisce, perché le due righe sono
 * di utenti diversi e sono entrambe legittime una per una.
 *
 * Il test `più richieste simultanee` è l'unico che misura questo, ed è il
 * motivo per cui l'assegnazione passa da `pg_advisory_xact_lock`.
 */

const request = require('supertest');
const { createApp } = require('../app');
const { UserEntitlement } = require('../models');
const {
  FEATURE_BANK_SYNC, ENTITLEMENT_ATTIVO, ENTITLEMENT_REVOCATO,
  SOURCE_BETA_25, SOURCE_ADMIN,
} = require('../constants/entitlements');
const {
  claimBetaSlot, statoSlot, contaOccupati, ESITI_CLAIM,
} = require('../services/betaSlots.service');
const { canUseFeature, revokeEntitlement } = require('../services/entitlements.service');
const {
  azzeraConfigurazione, impostaLimiteBeta, impostaBetaAttiva, impostaBankSyncAttivo,
  creaUtente, concediEntitlement,
} = require('./helpers/premium');

const app = createApp({ enableRateLimit: false });

/** N utenti registrati in parallelo. */
const creaUtenti = (quanti) => Promise.all(
  Array.from({ length: quanti }, () => creaUtente(app)),
);

describe('assegnazione dei posti beta', () => {
  beforeEach(() => azzeraConfigurazione());

  it('la sorgente di verità è il COUNT delle righe, non un contatore', async () => {
    const utenti = await creaUtenti(3);
    expect((await statoSlot(FEATURE_BANK_SYNC)).occupati).toBe(0);

    await claimBetaSlot(utenti[0].userId);
    await claimBetaSlot(utenti[1].userId);

    const stato = await statoSlot(FEATURE_BANK_SYNC);
    expect(stato.occupati).toBe(2);
    expect(stato.disponibili).toBe(23);
    expect(await contaOccupati(FEATURE_BANK_SYNC)).toBe(2);
  });

  it('i primi N ottengono il posto, il successivo viene bloccato', async () => {
    await impostaLimiteBeta(3);
    const utenti = await creaUtenti(4);

    const esiti = [];
    for (const u of utenti) {
      // In serie: qui si misura il limite, non la concorrenza.
      esiti.push((await claimBetaSlot(u.userId)).esito);
    }

    expect(esiti.slice(0, 3)).toEqual([
      ESITI_CLAIM.ASSEGNATO, ESITI_CLAIM.ASSEGNATO, ESITI_CLAIM.ASSEGNATO,
    ]);
    expect(esiti[3]).toBe(ESITI_CLAIM.POSTI_ESAURITI);

    expect(await contaOccupati(FEATURE_BANK_SYNC)).toBe(3);
    expect((await canUseFeature(utenti[3].userId, FEATURE_BANK_SYNC)).consentito).toBe(false);
  });

  it('più richieste simultanee non possono sfondare il limite', async () => {
    // Il caso critico del brief, con numeri piccoli perché il rapporto fra
    // richiedenti e posti sia quello che conta: 12 utenti, 2 posti.
    await impostaLimiteBeta(2);
    const utenti = await creaUtenti(12);

    const esiti = await Promise.all(utenti.map((u) => claimBetaSlot(u.userId)));

    const assegnati = esiti.filter((e) => e.esito === ESITI_CLAIM.ASSEGNATO);
    const esauriti = esiti.filter((e) => e.esito === ESITI_CLAIM.POSTI_ESAURITI);

    expect(assegnati).toHaveLength(2);
    expect(esauriti).toHaveLength(10);

    // La verifica che conta: il database non contiene più righe del limite.
    expect(await contaOccupati(FEATURE_BANK_SYNC)).toBe(2);
    const righe = await UserEntitlement.count({
      where: { feature_key: FEATURE_BANK_SYNC, status: ENTITLEMENT_ATTIVO, source: SOURCE_BETA_25 },
    });
    expect(righe).toBe(2);
  });

  it('l\'ULTIMO posto non viene assegnato due volte', async () => {
    // Variante più stretta: un solo posto libero e dieci richiedenti
    // contemporanei. È lo scenario 24/25 del brief, ridotto all'osso.
    await impostaLimiteBeta(1);
    const utenti = await creaUtenti(10);

    const esiti = await Promise.all(utenti.map((u) => claimBetaSlot(u.userId)));

    expect(esiti.filter((e) => e.esito === ESITI_CLAIM.ASSEGNATO)).toHaveLength(1);
    expect(await contaOccupati(FEATURE_BANK_SYNC)).toBe(1);
  });

  it('lo stesso utente che clicca due volte non consuma due posti', async () => {
    await impostaLimiteBeta(5);
    const utente = await creaUtente(app);

    const esiti = await Promise.all([
      claimBetaSlot(utente.userId),
      claimBetaSlot(utente.userId),
      claimBetaSlot(utente.userId),
    ]);

    const assegnati = esiti.filter((e) => e.esito === ESITI_CLAIM.ASSEGNATO);
    const giaAttivi = esiti.filter((e) => e.esito === ESITI_CLAIM.GIA_ATTIVO);

    expect(assegnati.length + giaAttivi.length).toBe(3);
    expect(assegnati.length).toBeLessThanOrEqual(1);
    // UNIQUE(user_id, feature_key): una riga sola, quindi un posto solo.
    expect(await UserEntitlement.count({ where: { user_id: utente.userId } })).toBe(1);
    expect(await contaOccupati(FEATURE_BANK_SYNC)).toBe(1);
  });

  it('una concessione amministrativa NON consuma un posto beta', async () => {
    // Le due origini restano separate: l'amministratore può dare accesso
    // anche dopo i 25 senza falsare quanti posti sono stati distribuiti.
    await impostaLimiteBeta(1);
    const [conBeta, conAdmin] = await creaUtenti(2);

    await claimBetaSlot(conBeta.userId);
    await concediEntitlement(conAdmin.userId, { source: SOURCE_ADMIN });

    expect(await contaOccupati(FEATURE_BANK_SYNC)).toBe(1);
    expect((await canUseFeature(conAdmin.userId, FEATURE_BANK_SYNC)).consentito).toBe(true);
    expect((await statoSlot(FEATURE_BANK_SYNC)).disponibili).toBe(0);
  });

  it('a chi ha già accesso per un\'altra via non viene assegnato un posto', async () => {
    await impostaLimiteBeta(5);
    const utente = await creaUtente(app);
    await concediEntitlement(utente.userId, { source: SOURCE_ADMIN });

    const esito = await claimBetaSlot(utente.userId);
    expect(esito.esito).toBe(ESITI_CLAIM.GIA_ATTIVO);
    expect(await contaOccupati(FEATURE_BANK_SYNC)).toBe(0);

    // E il source non è stato riscritto.
    const riga = await UserEntitlement.findOne({ where: { user_id: utente.userId } });
    expect(riga.source).toBe(SOURCE_ADMIN);
  });

  it('revocare un posto lo rimette a disposizione', async () => {
    await impostaLimiteBeta(1);
    const [primo, secondo] = await creaUtenti(2);

    await claimBetaSlot(primo.userId);
    expect((await claimBetaSlot(secondo.userId)).esito).toBe(ESITI_CLAIM.POSTI_ESAURITI);

    await revokeEntitlement({ userId: primo.userId, featureKey: FEATURE_BANK_SYNC });
    expect(await contaOccupati(FEATURE_BANK_SYNC)).toBe(0);

    expect((await claimBetaSlot(secondo.userId)).esito).toBe(ESITI_CLAIM.ASSEGNATO);
    // La riga revocata del primo utente resta: lo storico non si perde.
    const riga = await UserEntitlement.findOne({ where: { user_id: primo.userId } });
    expect(riga.status).toBe(ENTITLEMENT_REVOCATO);
  });

  it('con la beta chiusa non si assegna nulla, e la feature resta accesa per chi ce l\'ha', async () => {
    const [giaDentro, nuovo] = await creaUtenti(2);
    await claimBetaSlot(giaDentro.userId);

    await impostaBetaAttiva(false);

    expect((await claimBetaSlot(nuovo.userId)).esito).toBe(ESITI_CLAIM.BETA_CHIUSA);
    expect(await contaOccupati(FEATURE_BANK_SYNC)).toBe(1);
    // I due interruttori sono indipendenti: chiudere le attivazioni non
    // spegne la sincronizzazione a chi l'ha già.
    expect((await canUseFeature(giaDentro.userId, FEATURE_BANK_SYNC)).consentito).toBe(true);
  });

  it('con Bank Sync globalmente spento non si distribuiscono diritti inutilizzabili', async () => {
    const utente = await creaUtente(app);
    await impostaBankSyncAttivo(false);

    expect((await claimBetaSlot(utente.userId)).esito).toBe(ESITI_CLAIM.FEATURE_DISATTIVATA);
    expect(await UserEntitlement.count({ where: { user_id: utente.userId } })).toBe(0);
  });

  it('un limite portato a 0 blocca le attivazioni senza togliere quelle fatte', async () => {
    const [dentro, fuori] = await creaUtenti(2);
    await claimBetaSlot(dentro.userId);
    await impostaLimiteBeta(0);

    expect((await claimBetaSlot(fuori.userId)).esito).toBe(ESITI_CLAIM.POSTI_ESAURITI);
    expect((await canUseFeature(dentro.userId, FEATURE_BANK_SYNC)).consentito).toBe(true);
  });
});

describe('POST /api/bank-sync/claim-beta', () => {
  beforeEach(() => azzeraConfigurazione());

  it('richiede autenticazione', async () => {
    await request(app).post('/api/bank-sync/claim-beta').expect(401);
  });

  it('assegna il posto solo dopo un click esplicito, e non legge nulla dal corpo', async () => {
    const utente = await creaUtente(app);

    // Il client tenta di dettare feature e origine: vengono ignorate, perché
    // il servizio le ha cablate.
    const res = await request(app)
      .post('/api/bank-sync/claim-beta')
      .set(utente.headers)
      .send({ feature_key: 'bank_sync', source: 'admin', user_id: 99999 })
      .expect(201);

    expect(res.body.attivato).toBe(true);
    const riga = await UserEntitlement.findOne({ where: { user_id: utente.userId } });
    expect(riga.source).toBe(SOURCE_BETA_25);
    expect(riga.user_id).toBe(utente.userId);
    // Nessun entitlement è stato creato per l'id suggerito dal client.
    expect(await UserEntitlement.count({ where: { user_id: 99999 } })).toBe(0);
  });

  it('leggere lo stato del piano NON assegna un posto', async () => {
    // Il brief è esplicito: la beta non si attiva aprendo una pagina.
    const utente = await creaUtente(app);
    await request(app).get('/api/piano').set(utente.headers).expect(200);
    await request(app).get('/api/bank-sync/status').set(utente.headers).expect(200);
    await request(app).get('/api/bank-sync/beta').set(utente.headers).expect(200);

    expect(await contaOccupati(FEATURE_BANK_SYNC)).toBe(0);
    expect((await canUseFeature(utente.userId, FEATURE_BANK_SYNC)).consentito).toBe(false);
  });

  it('a posti esauriti risponde 409 con il motivo, non un errore generico', async () => {
    await impostaLimiteBeta(1);
    const [primo, secondo] = await creaUtenti(2);
    await claimBetaSlot(primo.userId);

    const res = await request(app)
      .post('/api/bank-sync/claim-beta')
      .set(secondo.headers)
      .expect(409);

    expect(res.body.esito).toBe(ESITI_CLAIM.POSTI_ESAURITI);
    expect(res.body.attivato).toBe(false);
    // Il messaggio deve poter portare l'utente alla schermata Premium.
    expect(res.body.message).toMatch(/Premium/);
  });

  it('richiamarlo quando si ha già accesso risponde 200 e non duplica', async () => {
    const utente = await creaUtente(app);
    await request(app).post('/api/bank-sync/claim-beta').set(utente.headers).expect(201);
    const res = await request(app)
      .post('/api/bank-sync/claim-beta').set(utente.headers).expect(200);

    expect(res.body.esito).toBe(ESITI_CLAIM.GIA_ATTIVO);
    expect(await UserEntitlement.count({ where: { user_id: utente.userId } })).toBe(1);
  });
});
