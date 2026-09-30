const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const {
  request, createApp, uniqueEmail, User, authHeader,
} = require('./setup');
const { generateToken } = require('../controllers/auth.controller');
const { resetAppleJwksCache } = require('../services/appleAuth.service');

const APPLE_ISSUER = 'https://appleid.apple.com';
const APPLE_KID = 'apple-signing-key-test';
const APPLE_CLIENT_ID = 'com.wallt.app.test';
const APPLE_SERVICE_ID = 'it.wallt.web.test';
const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const ecPair = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const appleJwk = {
  ...publicKey.export({ format: 'jwk' }),
  kid: APPLE_KID,
  kty: 'RSA',
  use: 'sig',
  alg: 'RS256',
};

const makeIdToken = (overrides = {}, platform = 'ios') => jwt.sign({
  sub: 'apple-user-sub-test',
  nonce: 'unused',
  iat: Math.floor(Date.now() / 1000),
  email: uniqueEmail('apple'),
  email_verified: true,
  ...overrides,
}, privateKey, {
  algorithm: 'RS256',
  keyid: APPLE_KID,
  issuer: APPLE_ISSUER,
  audience: platform === 'ios' ? APPLE_CLIENT_ID : APPLE_SERVICE_ID,
  expiresIn: '2m',
});

let app;
let fetchSpy;
let exchangeToken;

beforeAll(() => {
  process.env.APPLE_CLIENT_ID = APPLE_CLIENT_ID;
  process.env.APPLE_SERVICE_ID = APPLE_SERVICE_ID;
  process.env.APPLE_TEAM_ID = 'TEAMTEST123';
  process.env.APPLE_KEY_ID = 'KEYTEST123';
  process.env.APPLE_PRIVATE_KEY = ecPair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  process.env.APPLE_REDIRECT_URI = 'https://wallt.test/auth/apple/callback';
});

beforeEach(() => {
  app = createApp({ enableRateLimit: false });
  resetAppleJwksCache();
  fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(async (url) => {
    if (String(url).includes('/auth/keys')) {
      return { ok: true, json: async () => ({ keys: [appleJwk] }) };
    }
    return { ok: true, json: async () => ({ id_token: exchangeToken }) };
  });
});

afterEach(() => {
  fetchSpy.mockRestore();
});

describe('accesso Apple', () => {
  const getChallenge = (platform = 'ios') => request(app)
    .post('/api/auth/apple/challenge')
    .send({ platform });

  it('verifica code, firma, audience e nonce e crea la sessione WALLT', async () => {
    const challengeRes = await getChallenge();
    expect(challengeRes.status).toBe(200);
    const { challenge, nonce } = challengeRes.body;
    const email = uniqueEmail('apple-first');
    exchangeToken = makeIdToken({ sub: 'apple-sub-first', nonce, email, email_verified: true });

    const response = await request(app)
      .post('/api/auth/apple/verify')
      .send({
        platform: 'ios',
        credential: exchangeToken,
        authorization_code: 'authorization-code-valido-apple',
        challenge,
        name: { firstName: 'Ada', lastName: 'Rossi' },
        privacy_accepted_at: new Date().toISOString(),
        terms_accepted_at: new Date().toISOString(),
      });

    expect(response.status).toBe(200);
    expect(response.body.token).toBeTruthy();
    expect(response.body.user).toEqual(expect.objectContaining({
      email,
      apple_id: 'apple-sub-first',
      auth_provider: 'apple',
      nome: 'Ada Rossi',
    }));
    expect(response.body.onboarding).toBe('new');
  });

  it('non collega automaticamente un account con la stessa email', async () => {
    const email = uniqueEmail('apple-collision');
    await User.create({ nome: 'Account esistente', email, password: 'hash-password' });
    const challengeRes = await getChallenge();
    const { challenge, nonce } = challengeRes.body;
    exchangeToken = makeIdToken({ sub: 'apple-sub-collision', nonce, email, email_verified: true });

    const response = await request(app)
      .post('/api/auth/apple/verify')
      .send({
        platform: 'ios',
        credential: exchangeToken,
        authorization_code: 'authorization-code-valido-collision',
        challenge,
        privacy_accepted_at: new Date().toISOString(),
        terms_accepted_at: new Date().toISOString(),
      });

    expect(response.status).toBe(409);
    expect(response.body.code).toBe('apple_account_exists');
  });

  it('consente il ritorno di un account Apple esistente senza richiedere di nuovo nome o email', async () => {
    const email = uniqueEmail('apple-returning');
    const user = await User.create({
      nome: 'Account Apple', email, password: null, auth_provider: 'apple', apple_id: 'apple-returning-sub',
      privacy_accepted_at: new Date(), terms_accepted_at: new Date(),
    });
    const challengeRes = await getChallenge();
    const { challenge, nonce } = challengeRes.body;
    exchangeToken = makeIdToken({ sub: user.apple_id, nonce, email: undefined, email_verified: undefined });

    const response = await request(app)
      .post('/api/auth/apple/verify')
      .send({
        platform: 'ios',
        credential: exchangeToken,
        authorization_code: 'authorization-code-valido-returning',
        challenge,
      });

    expect(response.status).toBe(200);
    expect(response.body.user.apple_id).toBe(user.apple_id);
  });

  it('rifiuta audience, nonce e consenso errati', async () => {
    const badAudience = await getChallenge();
    exchangeToken = makeIdToken({ sub: 'apple-wrong-audience', nonce: badAudience.body.nonce }, 'web');
    const audienceResponse = await request(app)
      .post('/api/auth/apple/verify')
      .send({ platform: 'ios', credential: exchangeToken, authorization_code: 'authorization-code-audience', challenge: badAudience.body.challenge });
    expect(audienceResponse.status).toBe(401);

    const badNonce = await getChallenge();
    exchangeToken = makeIdToken({ sub: 'apple-wrong-nonce', nonce: 'x'.repeat(43) });
    const nonceResponse = await request(app)
      .post('/api/auth/apple/verify')
      .send({ platform: 'ios', credential: exchangeToken, authorization_code: 'authorization-code-nonce', challenge: badNonce.body.challenge });
    expect(nonceResponse.status).toBe(401);

    const noConsent = await getChallenge();
    exchangeToken = makeIdToken({ sub: 'apple-no-consent', nonce: noConsent.body.nonce, email: uniqueEmail('apple-no-consent') });
    const consentResponse = await request(app)
      .post('/api/auth/apple/verify')
      .send({ platform: 'ios', credential: exchangeToken, authorization_code: 'authorization-code-consent', challenge: noConsent.body.challenge });
    expect(consentResponse.status).toBe(400);
    expect(consentResponse.body.code).toBe('apple_consent_required');
  });

  it('applica challenge step-up Apple e vincola il token allo stesso provider di sessione', async () => {
    const email = uniqueEmail('apple-step-up');
    const user = await User.create({
      nome: 'Account Apple', email, password: null, auth_provider: 'apple', apple_id: 'apple-step-up-sub',
      privacy_accepted_at: new Date(), terms_accepted_at: new Date(),
    });
    const accessToken = generateToken(user);
    const challengeRes = await request(app)
      .post('/api/auth/apple/step-up/challenge')
      .set(authHeader(accessToken))
      .send({ platform: 'ios' });
    const { challenge, nonce } = challengeRes.body;
    exchangeToken = makeIdToken({ sub: user.apple_id, nonce, email }, 'ios');

    const response = await request(app)
      .post('/api/auth/apple/step-up/verify')
      .set(authHeader(accessToken))
      .send({
        platform: 'ios',
        credential: exchangeToken,
        authorization_code: 'authorization-code-step-up',
        challenge,
      });

    expect(response.status).toBe(200);
    const protectedResponse = await request(app)
      .post('/api/impostazioni/reset-account')
      .set(authHeader(accessToken))
      .set('X-Step-Up-Token', response.body.step_up_token)
      .send({ conferma: 'RESETTA' });
    expect(protectedResponse.status).toBe(200);
  });

  it('rifiuta lo step-up se il token appartiene a un altro account Apple', async () => {
    const user = await User.create({
      nome: 'Account Apple', email: uniqueEmail('apple-step-up-other'), password: null,
      auth_provider: 'apple', apple_id: 'apple-step-up-bound-sub',
      privacy_accepted_at: new Date(), terms_accepted_at: new Date(),
    });
    const accessToken = generateToken(user);
    const challengeRes = await request(app)
      .post('/api/auth/apple/step-up/challenge')
      .set(authHeader(accessToken))
      .send({ platform: 'ios' });
    const { challenge, nonce } = challengeRes.body;
    exchangeToken = makeIdToken({ sub: 'apple-another-account-sub', nonce }, 'ios');

    const response = await request(app)
      .post('/api/auth/apple/step-up/verify')
      .set(authHeader(accessToken))
      .send({
        platform: 'ios',
        credential: exchangeToken,
        authorization_code: 'authorization-code-step-up-other',
        challenge,
      });

    expect(response.status).toBe(403);
    expect(response.body.code).toBe('apple_identity_mismatch');
  });
});
