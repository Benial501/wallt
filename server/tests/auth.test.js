const sinon = require('sinon');
const passport = require('../config/passport');
const EmailService = require('../services/email/EmailService');
const {
  request,
  createApp,
  registerUser,
  loginUser,
  authHeader,
  getStepUpToken,
  createGoogleUser,
  User,
} = require('./setup');

describe('Auth API', () => {
  let app;
  let emailStub;
  let emailReadyStub;

  beforeEach(() => {
    app = createApp({ enableRateLimit: false });
    emailReadyStub = sinon.stub(EmailService, 'isEmailServiceReady').returns(true);
    emailStub = sinon.stub(EmailService, 'sendPasswordResetEmail').resolves({ ok: true });
  });

  afterEach(() => {
    sinon.restore();
  });

  describe('Registrazione', () => {
    it('registra utente con consenso privacy e termini', async () => {
      const { res, payload } = await registerUser(app);

      expect(res.status).toBe(201);
      expect(res.body.token).toBeDefined();
      expect(res.body.user.email).toBe(payload.email);
      expect(res.body.user.use_ai_categorization).toBe(false);
    });

    it('registra utente con consenso AI opzionale', async () => {
      const { res } = await registerUser(app, { use_ai_categorization: true });

      expect(res.status).toBe(201);
      expect(res.body.user.use_ai_categorization).toBe(true);
    });

    it('rifiuta registrazione senza consenso privacy/termini', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          nome: 'No Consent',
          email: `no-consent-${Date.now()}@test.local`,
          password: 'Password1!',
        });

      expect(res.status).toBe(400);
      expect(res.body.errori || res.body.error).toBeDefined();
    });
  });

  describe('Login', () => {
    it('effettua login con credenziali corrette', async () => {
      const { payload } = await registerUser(app);
      const res = await loginUser(app, payload.email, payload.password);

      expect(res.status).toBe(200);
      expect(res.body.token).toBeDefined();
      expect(res.body.user.email).toBe(payload.email);
    });

    it('rifiuta login con password errata', async () => {
      const { payload } = await registerUser(app);
      const res = await loginUser(app, payload.email, 'PasswordSbagliata1');

      expect(res.status).toBe(401);
      expect(res.body.message).toMatch(/credenziali/i);
    });
  });

  describe('Password reset', () => {
    it('completa il flusso forgot-password → reset-password → login', async () => {
      let resetToken;
      emailStub.callsFake(async ({ resetUrl }) => {
        resetToken = new URL(resetUrl).searchParams.get('token');
        return { ok: true };
      });

      const { payload } = await registerUser(app);

      const forgotRes = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: payload.email });

      expect(forgotRes.status).toBe(200);
      expect(forgotRes.body.message).toMatch(/riceverai un link/i);
      expect(resetToken).toBeDefined();
      expect(resetToken).toHaveLength(64);

      const newPassword = 'NuovaPass1!';

      const resetRes = await request(app)
        .post('/api/auth/reset-password')
        .send({ token: resetToken, newPassword });

      expect(resetRes.status).toBe(200);

      const oldLogin = await loginUser(app, payload.email, payload.password);
      expect(oldLogin.status).toBe(401);

      const newLogin = await loginUser(app, payload.email, newPassword);
      expect(newLogin.status).toBe(200);
      expect(newLogin.body.token).toBeDefined();
    });

    it('rifiuta reset con token invalido', async () => {
      const res = await request(app)
        .post('/api/auth/reset-password')
        .send({ token: 'token-invalido', newPassword: 'NuovaPass1!' });

      expect(res.status).toBe(400);
    });

    it('non rivela se l\'email esiste', async () => {
      const res = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: 'inesistente@test.local' });

      expect(res.status).toBe(200);
      expect(res.body.message).toMatch(/riceverai un link/i);
      expect(emailStub.called).toBe(false);
    });

    it('mostra messaggio dedicato per account Google senza password', async () => {
      const googleUser = await createGoogleUser();

      const res = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: googleUser.email });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe('oauth_account');
      expect(res.body.message).toMatch(/Google/i);
      expect(emailStub.called).toBe(false);
    });

    it('NON collega automaticamente Google a un account locale esistente con la stessa email (previene account pre-hijacking)', async () => {
      // Un login Google non deve mai unirsi silenziosamente a un account
      // locale già esistente: chiunque potrebbe pre-registrare un account
      // locale con l'email di una vittima e ottenerne l'accesso quando la
      // vittima prova "Accedi con Google" la prima volta (l'attaccante
      // conoscerebbe comunque la password dell'account "unito"). L'email è
      // verificata da Google ma la registrazione locale di WALLT non
      // richiede verifica email, quindi il solo match sull'indirizzo non è
      // prova sufficiente di proprietà dell'account esistente.
      const { payload, res: regRes } = await registerUser(app, {
        email: `link-${Date.now()}@gmail.com`,
      });
      expect(regRes.status).toBe(201);
      const localUserId = regRes.body.user.id;

      const profile = {
        id: `google-${Date.now()}`,
        displayName: 'Linked User',
        emails: [{ value: payload.email }],
        photos: [{ value: 'https://example.com/avatar.jpg' }],
      };

      const { resolveGoogleUser, GoogleAccountLinkingError } = require('../services/googleAuth.service');
      await expect(resolveGoogleUser(profile)).rejects.toThrow(GoogleAccountLinkingError);

      // L'account locale non deve essere stato toccato: nessun google_id
      // collegato, password originale ancora valida.
      const untouched = await User.findByPk(localUserId);
      expect(untouched.google_id).toBeNull();

      const loginRes = await loginUser(app, payload.email, payload.password);
      expect(loginRes.status).toBe(200);
    });

    it('collega Google a un account già creato da un precedente login Google con la stessa email (nessuna password locale)', async () => {
      const email = `google-only-${Date.now()}@gmail.com`;
      const profile1 = {
        id: `google-a-${Date.now()}`,
        displayName: 'Google User',
        emails: [{ value: email }],
        photos: [{ value: 'https://example.com/avatar.jpg' }],
      };

      const { resolveGoogleUser } = require('../services/googleAuth.service');
      const firstLogin = await resolveGoogleUser(profile1);
      expect(firstLogin.google_id).toBe(profile1.id);

      // Stesso google_id, secondo login: deve solo riusare l'account, non crearne un altro.
      const secondLogin = await resolveGoogleUser(profile1);
      expect(secondLogin.id).toBe(firstLogin.id);
    });

    it('restituisce 503 se il servizio email non è pronto', async () => {
      emailReadyStub.returns(false);

      const { payload } = await registerUser(app);

      const res = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: payload.email });

      expect(res.status).toBe(503);
      expect(emailStub.called).toBe(false);
    });
  });

  describe('OAuth login (mock)', () => {
    it('genera token JWT al callback Google con utente mockato', async () => {
      const googleUser = await createGoogleUser();
      await User.findByPk(googleUser.id, {
        include: [{ association: 'profilo' }],
      });

      const authenticateStub = sinon.stub(passport, 'authenticate').callsFake((_strategy, _opts, callback) => (req, res, next) => {
        if (callback) {
          return callback(null, googleUser);
        }
        return next();
      });

      const res = await request(app)
        .get('/api/auth/google/callback')
        .query({ state: Buffer.from(JSON.stringify({ origin: 'http://localhost:5173' }), 'utf8').toString('base64url') });

      expect(res.status).toBe(200);
      expect(res.text).toContain('wallt=');
      authenticateStub.restore();
    });
  });

  describe('Step-up authentication', () => {
    it('emette step_up_token con password corretta', async () => {
      const { res: reg, payload } = await registerUser(app);
      const token = reg.body.token;

      const verifyRes = await request(app)
        .post('/api/auth/verify-password')
        .set(authHeader(token))
        .send({ password: payload.password });

      expect(verifyRes.status).toBe(200);
      expect(verifyRes.body.step_up_token).toBeDefined();
    });

    it('rifiuta step-up con password errata', async () => {
      const { res: reg, payload } = await registerUser(app);

      const verifyRes = await request(app)
        .post('/api/auth/verify-password')
        .set(authHeader(reg.body.token))
        .send({ password: 'PasswordSbagliata1' });

      expect(verifyRes.status).toBe(401);
    });

    it('consente export dati solo con step-up token valido', async () => {
      const { res: reg, payload } = await registerUser(app);
      const token = reg.body.token;

      const withoutStepUp = await request(app)
        .post('/api/impostazioni/esporta')
        .set(authHeader(token));

      expect(withoutStepUp.status).toBe(403);

      const stepUpToken = await getStepUpToken(app, token, payload.password);

      const withStepUp = await request(app)
        .post('/api/impostazioni/esporta')
        .set({
          ...authHeader(token),
          'X-Step-Up-Token': stepUpToken,
        });

      expect(withStepUp.status).toBe(200);
    });
  });
});
