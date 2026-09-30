const mockVerifyIdToken = jest.fn();

jest.mock('google-auth-library', () => ({
  OAuth2Client: jest.fn().mockImplementation(() => ({ verifyIdToken: mockVerifyIdToken })),
}));

const { OAuthChallenge, User } = require('../models');
const {
  createOAuthChallenge,
  consumeOAuthChallenge,
} = require('../services/oauthChallenge.service');
const {
  request,
  createApp,
  createGoogleUser,
  uniqueEmail,
} = require('./setup');

describe('challenge OAuth persistenti', () => {
  const issue = (overrides = {}) => createOAuthChallenge({
    provider: 'google',
    purpose: 'login',
    platform: 'ios',
    ...overrides,
  });

  it('conserva solo digest del challenge e del nonce', async () => {
    const issued = await issue();
    const stored = await OAuthChallenge.findOne();

    expect(issued.challenge).toBeTruthy();
    expect(issued.nonce).toBeTruthy();
    expect(issued.expires_in).toBe(120);
    expect(stored.challenge_hash).not.toBe(issued.challenge);
    expect(stored.nonce_hash).not.toBe(issued.nonce);
    expect(JSON.stringify(stored.toJSON())).not.toContain(issued.challenge);
    expect(JSON.stringify(stored.toJSON())).not.toContain(issued.nonce);
  });

  it('non consuma challenge di provider, scopo, piattaforma o utente diversi', async () => {
    const user = await createGoogleUser();
    const issued = await issue({ userId: user.id, purpose: 'step_up' });

    await expect(consumeOAuthChallenge({
      challenge: issued.challenge,
      provider: 'apple',
      purpose: 'step_up',
      platform: 'ios',
      userId: user.id,
    })).resolves.toBe(false);
    await expect(consumeOAuthChallenge({
      challenge: issued.challenge,
      provider: 'google',
      purpose: 'login',
      platform: 'ios',
      userId: user.id,
    })).resolves.toBe(false);
    await expect(consumeOAuthChallenge({
      challenge: issued.challenge,
      provider: 'google',
      purpose: 'step_up',
      platform: 'web',
      userId: user.id,
    })).resolves.toBe(false);
    await expect(consumeOAuthChallenge({
      challenge: issued.challenge,
      provider: 'google',
      purpose: 'step_up',
      platform: 'ios',
      userId: user.id + 1,
    })).resolves.toBe(false);
  });

  it('rifiuta un challenge scaduto e il suo riuso', async () => {
    const expired = await issue();
    await OAuthChallenge.update(
      { expires_at: new Date(Date.now() - 1_000) },
      { where: { challenge_hash: require('crypto').createHash('sha256').update(expired.challenge).digest('hex') } },
    );
    await expect(consumeOAuthChallenge({
      challenge: expired.challenge,
      provider: 'google',
      purpose: 'login',
      platform: 'ios',
      userId: null,
    })).resolves.toBe(false);

    const active = await issue();
    const context = {
      challenge: active.challenge,
      provider: 'google',
      purpose: 'login',
      platform: 'ios',
      userId: null,
    };
    await expect(consumeOAuthChallenge(context)).resolves.toBe(true);
    await expect(consumeOAuthChallenge(context)).resolves.toBe(false);
  });

  it('consuma una sola volta anche con due richieste concorrenti', async () => {
    const issued = await issue();
    const context = {
      challenge: issued.challenge,
      provider: 'google',
      purpose: 'login',
      platform: 'ios',
      userId: null,
    };

    const results = await Promise.all([
      consumeOAuthChallenge(context),
      consumeOAuthChallenge(context),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
  });
});

describe('accesso Google nativo', () => {
  let app;

  beforeEach(() => {
    app = createApp({ enableRateLimit: false });
    mockVerifyIdToken.mockReset();
  });

  const getChallenge = () => request(app).post('/api/auth/google/native/challenge');
  const setPayload = (payload) => mockVerifyIdToken.mockResolvedValue({ getPayload: () => payload });

  it('verifica il token Google e crea una sessione WALLT', async () => {
    const challengeResponse = await getChallenge();
    expect(challengeResponse.status).toBe(200);
    const { challenge, nonce } = challengeResponse.body;
    const email = uniqueEmail('native-google');
    setPayload({
      sub: 'google-native-sub',
      email,
      email_verified: true,
      name: 'Utente Google nativo',
      picture: 'https://example.test/avatar.png',
      nonce,
      iat: Math.floor(Date.now() / 1000),
    });

    const response = await request(app)
      .post('/api/auth/google/native/verify')
      .send({ credential: 'id-token-firmato', challenge });

    expect(response.status).toBe(200);
    expect(response.body.token).toBeTruthy();
    expect(response.body.user).toEqual(expect.objectContaining({
      email,
      auth_provider: 'google',
      google_id: 'google-native-sub',
    }));
    expect(response.body.onboarding).toBe('new');
  });

  it('mantiene il rifiuto di collegare Google a un account locale esistente', async () => {
    const email = uniqueEmail('collisione-google');
    await User.create({
      nome: 'Account locale',
      email,
      password: 'hash-password-locale',
      auth_provider: 'local',
    });
    const challengeResponse = await getChallenge();
    const { challenge, nonce } = challengeResponse.body;
    setPayload({
      sub: 'google-collision-sub',
      email,
      email_verified: true,
      name: 'Nome Google',
      nonce,
      iat: Math.floor(Date.now() / 1000),
    });

    const response = await request(app)
      .post('/api/auth/google/native/verify')
      .send({ credential: 'id-token-firmato', challenge });

    expect(response.status).toBe(409);
    expect(response.body.code).toBe('google_account_exists_local');
  });

  it('rifiuta un token Google con nonce errato o email non verificata', async () => {
    const challengeResponse = await getChallenge();
    const { challenge, nonce } = challengeResponse.body;
    setPayload({
      sub: 'google-native-sub',
      email: uniqueEmail('native-google'),
      email_verified: true,
      nonce: `${nonce}-errato`,
      iat: Math.floor(Date.now() / 1000),
    });
    const nonceResponse = await request(app)
      .post('/api/auth/google/native/verify')
      .send({ credential: 'id-token-firmato', challenge });
    expect(nonceResponse.status).toBe(401);

    const secondChallenge = await getChallenge();
    setPayload({
      sub: 'google-native-sub',
      email: uniqueEmail('native-google'),
      email_verified: false,
      nonce: secondChallenge.body.nonce,
      iat: Math.floor(Date.now() / 1000),
    });
    const emailResponse = await request(app)
      .post('/api/auth/google/native/verify')
      .send({ credential: 'id-token-firmato', challenge: secondChallenge.body.challenge });
    expect(emailResponse.status).toBe(401);
  });
});
