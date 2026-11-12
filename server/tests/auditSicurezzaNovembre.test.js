/**
 * Regressioni dell'audit di sicurezza di novembre 2026.
 *
 * Ogni blocco riproduce l'attacco descritto nel rapporto e verifica che non
 * riesca più. I numeri fra parentesi sono quelli del rapporto.
 */
const {
  request, createApp, registerUser, authHeader, getStepUpToken, createGoogleUser,
  User, Conto, Movimento, uniqueEmail,
} = require('./setup');
const { resolveGoogleUser, GoogleAccountLinkingError } = require('../services/googleAuth.service');
const { endpointPushAmmesso, salvaSubscription } = require('../services/notifiche/PushService');
const { buildPasswordResetHtml } = require('../services/email/templates/PasswordResetTemplate');
const { claimBetaSlot, ESITI_CLAIM } = require('../services/betaSlots.service');
const { revokeEntitlement } = require('../services/entitlements.service');
const { FEATURE_BANK_SYNC } = require('../constants/entitlements');
const { azzeraConfigurazione, creaUtente } = require('./helpers/premium');

describe('audit di sicurezza novembre 2026', () => {
  let app;

  beforeEach(() => {
    app = createApp({ enableRateLimit: false });
  });

  describe('(1) login Google con email presa da un altro account', () => {
    it('non entra in un account già legato a un google_id diverso', async () => {
      const attaccante = await createGoogleUser();
      const emailVittima = uniqueEmail('vittima');
      await attaccante.update({ email: emailVittima });

      const profiloVittima = {
        id: 'google-id-della-vittima',
        displayName: 'Vittima',
        emails: [{ value: emailVittima }],
        photos: [],
      };

      await expect(resolveGoogleUser(profiloVittima)).rejects.toThrow(GoogleAccountLinkingError);
      const riletto = await User.findByPk(attaccante.id);
      expect(riletto.google_id).not.toBe('google-id-della-vittima');
    });
  });

  describe('(2) cambio email', () => {
    it('senza step-up risponde 403 e non cambia nulla', async () => {
      const { res, payload } = await registerUser(app);
      const nuova = uniqueEmail('ladro');

      const risposta = await request(app)
        .put('/api/impostazioni/profilo')
        .set(authHeader(res.body.token))
        .send({ email: nuova });

      expect(risposta.status).toBe(403);
      const utente = await User.findOne({ where: { email: payload.email } });
      expect(utente).not.toBeNull();
    });

    it('con lo step-up valido la cambia', async () => {
      const { res, payload } = await registerUser(app);
      const stepUp = await getStepUpToken(app, res.body.token, payload.password);
      const nuova = uniqueEmail('nuova');

      const risposta = await request(app)
        .put('/api/impostazioni/profilo')
        .set(authHeader(res.body.token))
        .set('X-Step-Up-Token', stepUp)
        .send({ email: nuova });

      expect(risposta.status).toBe(200);
      expect(risposta.body.user.email).toBe(nuova);
    });

    it('il solo cambio nome non chiede lo step-up', async () => {
      const { res } = await registerUser(app);
      const risposta = await request(app)
        .put('/api/impostazioni/profilo')
        .set(authHeader(res.body.token))
        .send({ nome: 'Nuovo nome' });
      expect(risposta.status).toBe(200);
    });
  });

  describe('(6) endpoint push', () => {
    it('accetta solo i servizi push dei browser', () => {
      expect(endpointPushAmmesso('https://fcm.googleapis.com/fcm/send/abc')).toBe(true);
      expect(endpointPushAmmesso('https://web.push.apple.com/xyz')).toBe(true);
      expect(endpointPushAmmesso('https://wns2-par02p.notify.windows.com/w/?token=1')).toBe(true);
      expect(endpointPushAmmesso('https://10.0.0.1/sub')).toBe(false);
      expect(endpointPushAmmesso('https://169.254.169.254/latest')).toBe(false);
      expect(endpointPushAmmesso('https://fcm.googleapis.com:8443/x')).toBe(false);
      expect(endpointPushAmmesso('https://fcm.googleapis.com.evil.example/x')).toBe(false);
      expect(endpointPushAmmesso('http://fcm.googleapis.com/x')).toBe(false);
    });

    it('non salva una sottoscrizione verso un endpoint interno', async () => {
      const { res } = await registerUser(app);
      const esito = await salvaSubscription(res.body.user.id, {
        endpoint: 'https://127.0.0.1:6543/x', keys: { p256dh: 'a', auth: 'b' },
      });
      expect(esito).toEqual({ ok: false, motivo: 'endpoint_non_ammesso' });
    });
  });

  describe('(10) revoca dello staff e claim-beta', () => {
    beforeEach(() => azzeraConfigurazione());

    it('una revoca decisa dallo staff non si annulla con claim-beta', async () => {
      const admin = await creaUtente(app);
      const utente = await creaUtente(app);
      await claimBetaSlot(utente.userId);
      await revokeEntitlement({
        userId: utente.userId, featureKey: FEATURE_BANK_SYNC, actorUserId: admin.userId,
      });

      const esito = await claimBetaSlot(utente.userId);
      expect(esito.esito).toBe(ESITI_CLAIM.REVOCATO_DALLO_STAFF);
    });
  });

  describe('(11) email di reset', () => {
    it('escapa il nome scelto in registrazione', () => {
      const html = buildPasswordResetHtml({
        resetUrl: 'https://wallt.app/reset?t=1&x=2',
        userName: '<a href="https://evil.example">Clicca</a>',
      });
      expect(html).not.toContain('<a href="https://evil.example">');
      expect(html).toContain('&lt;a href=');
    });
  });

  describe('trasferimenti (12, 13)', () => {
    const preparaConti = async () => {
      const { res } = await registerUser(app);
      const token = res.body.token;
      const userId = res.body.user.id;
      const a = await Conto.create({ user_id: userId, nome: 'A', tipo: 'banca', saldo: 100, attivo: true });
      const b = await Conto.create({ user_id: userId, nome: 'B', tipo: 'banca', saldo: 100, attivo: true });
      return { token, a, b };
    };

    it('(12) lo stesso conto scritto come 1 e "1" è rifiutato', async () => {
      const { token, a } = await preparaConti();
      const risposta = await request(app)
        .post('/api/conti/trasferimento')
        .set(authHeader(token))
        .send({
          conto_origine_id: a.id, conto_destinazione_id: String(a.id), importo: 50, data: '2026-11-01',
        });
      expect(risposta.status).toBe(400);
      await a.reload();
      expect(Number(a.saldo)).toBe(100);
    });

    it('(13) un importo negativo è rifiutato', async () => {
      const { token, a, b } = await preparaConti();
      const risposta = await request(app)
        .post('/api/conti/trasferimento')
        .set(authHeader(token))
        .send({
          conto_origine_id: a.id, conto_destinazione_id: b.id, importo: -500, data: '2026-11-01',
        });
      expect(risposta.status).toBe(400);
      await a.reload();
      await b.reload();
      expect(Number(a.saldo)).toBe(100);
      expect(Number(b.saldo)).toBe(100);
    });
  });

  describe('(14) ricorrente come stringa', () => {
    it('"false" non storna il saldo senza riapplicarlo', async () => {
      const { res } = await registerUser(app);
      const token = res.body.token;
      const userId = res.body.user.id;
      const conto = await Conto.create({ user_id: userId, nome: 'C', tipo: 'banca', saldo: 100, attivo: true });

      const creato = await request(app)
        .post('/api/movimenti')
        .set(authHeader(token))
        .send({
          conto_id: conto.id, tipo: 'uscita', importo: 10, categoria: 'altro_uscita',
          descrizione: 'Spesa', data: '2026-11-01',
        });
      expect(creato.status).toBe(201);
      await conto.reload();
      expect(Number(conto.saldo)).toBe(90);

      const id = creato.body.movimento?.id ?? creato.body.id;
      for (let i = 0; i < 2; i += 1) {
        // eslint-disable-next-line no-await-in-loop
        const agg = await request(app)
          .put(`/api/movimenti/${id}`)
          .set(authHeader(token))
          .send({ ricorrente: 'false' });
        expect(agg.status).toBe(200);
      }

      await conto.reload();
      expect(Number(conto.saldo)).toBe(90);
      const mov = await Movimento.findByPk(id);
      expect(mov.ricorrente).toBe(false);
    });
  });
});
