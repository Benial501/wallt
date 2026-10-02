/**
 * Utilità condivise dalle suite di WALLT Premium e Bank Sync.
 *
 * Due scelte che contano per la validità dei test:
 *
 *  • il provider è il SANDBOX attivato attraverso `app_config`, non iniettato:
 *    così le suite API attraversano la fabbrica reale (`providers/index.js`),
 *    la lettura della configurazione e il controller, invece di saltare
 *    proprio i pezzi che decidono quale provider si usa;
 *
 *  • la cache della configurazione viene invalidata a ogni test. Il
 *    `beforeEach` globale fa TRUNCATE delle tabelle ma non sa nulla della
 *    cache in memoria: senza questa invalidazione un test che spegne
 *    `bank_sync_enabled` lo lascerebbe spento, dalla cache, per i 15 secondi
 *    successivi — e il test dopo fallirebbe per una ragione che non ha nulla
 *    a che vedere con ciò che verifica.
 */

const request = require('supertest');
const { User, UserEntitlement } = require('../../models');
const {
  FEATURE_BANK_SYNC, ENTITLEMENT_ATTIVO, RUOLO_ADMIN, SOURCE_BETA_25,
} = require('../../constants/entitlements');
const {
  BANK_SYNC_PROVIDER, BANK_SYNC_COOLDOWN_SECONDI, BANK_SYNC_BETA_LIMIT,
  BANK_SYNC_BETA_ENABLED, BANK_SYNC_ENABLED,
} = require('../../constants/appConfig');
const { PROVIDER_SANDBOX } = require('../../constants/bankSync');
const appConfig = require('../../services/appConfig.service');
const { registerUser, authHeader } = require('../setup');

/** Da chiamare nel `beforeEach` di ogni suite che tocca la configurazione. */
const azzeraConfigurazione = () => appConfig.invalidaCache();

/** Attiva il provider finto e azzera il cooldown: i test devono poter
 * sincronizzare due volte di seguito per verificare l'idempotenza. */
const abilitaSandbox = async ({ cooldown = 0 } = {}) => {
  appConfig.invalidaCache();
  await appConfig.setConfig(BANK_SYNC_PROVIDER, PROVIDER_SANDBOX);
  await appConfig.setConfig(BANK_SYNC_COOLDOWN_SECONDI, cooldown);
};

const impostaLimiteBeta = (limite) => appConfig.setConfig(BANK_SYNC_BETA_LIMIT, limite);
const impostaBetaAttiva = (attiva) => appConfig.setConfig(BANK_SYNC_BETA_ENABLED, attiva);
const impostaBankSyncAttivo = (attivo) => appConfig.setConfig(BANK_SYNC_ENABLED, attivo);

/** Un utente registrato, con token e id. */
const creaUtente = async (app, overrides = {}) => {
  const { res, payload } = await registerUser(app, overrides);
  if (!res.body?.token) {
    throw new Error(`Registrazione fallita: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return {
    token: res.body.token,
    userId: res.body.user.id,
    email: payload.email,
    password: payload.password,
    headers: authHeader(res.body.token),
  };
};

const rendiAdmin = (userId) => User.update({ ruolo: RUOLO_ADMIN }, { where: { id: userId } });

/**
 * Entitlement scritto direttamente nel database.
 *
 * Volutamente NON passa dai servizi: serve a preparare lo stato di partenza
 * di un test, e usare `claimBetaSlot` consumerebbe un posto reale falsando le
 * suite sulla quota. Per `beta_25` resta l'unico modo di avere un posto
 * occupato senza esercitare il percorso che si sta misurando.
 */
const concediEntitlement = (userId, {
  featureKey = FEATURE_BANK_SYNC,
  source = SOURCE_BETA_25,
  status = ENTITLEMENT_ATTIVO,
  expiresAt = null,
} = {}) => UserEntitlement.create({
  user_id: userId,
  feature_key: featureKey,
  status,
  source,
  granted_at: new Date(),
  expires_at: expiresAt,
});

/** Lo `state` che il server ha generato, letto dall'URL di autorizzazione. */
const estraiState = (urlAutorizzazione) => new URL(urlAutorizzazione).searchParams.get('state');

/**
 * Collega una banca fino in fondo: connect → callback → riconciliazione.
 *
 * `riconcilia: true` è il default perché la maggior parte dei test vuole una
 * connessione utilizzabile, com'era prima che la riconciliazione esistesse.
 * I test che devono osservare lo stato intermedio passano `false`.
 */
const collegaBanca = async (app, headers, {
  institutionId = 'SANDBOX_BANCA_IT',
  riconcilia = true,
  destinazione = 'nuovo',
} = {}) => {
  const connect = await request(app)
    .post('/api/bank-sync/connect')
    .set(headers)
    .send({ institution_id: institutionId });

  if (connect.status !== 201) {
    throw new Error(`connect fallito: ${connect.status} ${JSON.stringify(connect.body)}`);
  }

  const state = estraiState(connect.body.url_autorizzazione);
  const callback = await request(app)
    .post('/api/bank-sync/callback')
    .set(headers)
    .send({ state });

  if (!riconcilia) return { connect, callback, state, riconciliazione: null };

  const elenco = await request(app).get('/api/bank-sync/riconciliazione').set(headers);
  if (elenco.status !== 200) {
    throw new Error(`riconciliazione (GET) fallita: ${elenco.status}`);
  }

  const riconciliazione = await request(app)
    .post('/api/bank-sync/riconciliazione')
    .set(headers)
    .send({
      provider_account_id: elenco.body.conti_banca[0].provider_account_id,
      destinazione,
    });

  if (riconciliazione.status !== 200 && riconciliazione.status !== 201) {
    throw new Error(`riconciliazione (POST) fallita: ${riconciliazione.status} `
      + JSON.stringify(riconciliazione.body));
  }

  return { connect, callback, state, riconciliazione };
};

module.exports = {
  azzeraConfigurazione,
  abilitaSandbox,
  impostaLimiteBeta,
  impostaBetaAttiva,
  impostaBankSyncAttivo,
  creaUtente,
  rendiAdmin,
  concediEntitlement,
  estraiState,
  collegaBanca,
};
