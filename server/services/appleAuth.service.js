const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { User, ProfiloUtente } = require('../models');
const { findUserByEmail } = require('../utils/findUserByEmail');
const { repairUserProfilo } = require('./onboarding.service');
const EmailService = require('./email/EmailService');
const {
  CHALLENGE_TTL_SECONDS,
  createOAuthChallenge,
  findActiveOAuthChallenge,
  consumeOAuthChallenge,
  matchesOAuthNonce,
} = require('./oauthChallenge.service');

const APPLE_ISSUER = 'https://appleid.apple.com';
const APPLE_KEYS_URL = `${APPLE_ISSUER}/auth/keys`;
const APPLE_TOKEN_URL = `${APPLE_ISSUER}/auth/token`;
const CREDENTIAL_MAX_AGE_SECONDS = 120;
const CLOCK_SKEW_SECONDS = 10;
const JWKS_CACHE_MS = 60 * 60 * 1000;
let appleKeysCache = null;

class AppleAuthError extends Error {
  constructor(message, statusCode = 401, code = 'apple_credential_invalid') {
    super(message);
    this.name = 'AppleAuthError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

const getAppleClientId = (platform) => (platform === 'ios'
  ? process.env.APPLE_CLIENT_ID
  : process.env.APPLE_SERVICE_ID);

const isAppleAuthEnabled = () => Boolean(
  process.env.APPLE_CLIENT_ID
  && process.env.APPLE_SERVICE_ID
  && process.env.APPLE_TEAM_ID
  && process.env.APPLE_KEY_ID
  && process.env.APPLE_PRIVATE_KEY
  && process.env.APPLE_REDIRECT_URI,
);

const createAppleClientSecret = (platform) => {
  const clientId = getAppleClientId(platform);
  const privateKey = process.env.APPLE_PRIVATE_KEY?.replace(/\\n/g, '\n');
  if (!clientId || !process.env.APPLE_TEAM_ID || !process.env.APPLE_KEY_ID || !privateKey) {
    throw new AppleAuthError('Accesso Apple non configurato', 503, 'apple_not_configured');
  }

  return jwt.sign({}, privateKey, {
    algorithm: 'ES256',
    keyid: process.env.APPLE_KEY_ID,
    issuer: process.env.APPLE_TEAM_ID,
    subject: clientId,
    audience: APPLE_ISSUER,
    expiresIn: '5m',
  });
};

const createAppleChallenge = async ({ platform, purpose = 'login', userId = null }) => {
  if (!getAppleClientId(platform)) {
    throw new AppleAuthError('Accesso Apple non configurato', 503, 'apple_not_configured');
  }
  return createOAuthChallenge({ provider: 'apple', purpose, platform, userId });
};

const exchangeAuthorizationCode = async ({ authorizationCode, platform }) => {
  let clientSecret;
  try {
    clientSecret = createAppleClientSecret(platform);
  } catch (error) {
    if (error instanceof AppleAuthError) throw error;
    throw new AppleAuthError('Configurazione Apple non valida', 503, 'apple_not_configured');
  }

  const body = new URLSearchParams({
    client_id: getAppleClientId(platform),
    client_secret: clientSecret,
    code: authorizationCode,
    grant_type: 'authorization_code',
  });
  if (platform === 'web') {
    if (!process.env.APPLE_REDIRECT_URI) {
      throw new AppleAuthError('Indirizzo di ritorno Apple non configurato', 503, 'apple_not_configured');
    }
    body.set('redirect_uri', process.env.APPLE_REDIRECT_URI);
  }

  let response;
  try {
    response = await fetch(APPLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body,
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new AppleAuthError('Impossibile verificare il codice Apple', 503, 'apple_provider_unavailable');
  }

  let result;
  try {
    result = await response.json();
  } catch {
    throw new AppleAuthError('Risposta Apple non valida', 503, 'apple_provider_unavailable');
  }
  if (!response.ok || typeof result.id_token !== 'string') {
    throw new AppleAuthError('Codice Apple non valido o già utilizzato', 401, 'apple_code_invalid');
  }
  return result.id_token;
};

const loadAppleSigningKey = async (kid) => {
  if (appleKeysCache?.expiresAt > Date.now()) {
    const cached = appleKeysCache.keys.find((key) => key.kid === kid);
    if (cached) return cached;
  }

  let response;
  try {
    response = await fetch(APPLE_KEYS_URL, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new AppleAuthError('Impossibile verificare la firma Apple', 503, 'apple_provider_unavailable');
  }
  if (!response.ok) {
    throw new AppleAuthError('Impossibile verificare la firma Apple', 503, 'apple_provider_unavailable');
  }

  let jwks;
  try {
    jwks = await response.json();
  } catch {
    throw new AppleAuthError('Chiavi di firma Apple non valide', 503, 'apple_provider_unavailable');
  }
  if (!Array.isArray(jwks.keys)) {
    throw new AppleAuthError('Chiavi di firma Apple non valide', 503, 'apple_provider_unavailable');
  }
  appleKeysCache = { keys: jwks.keys, expiresAt: Date.now() + JWKS_CACHE_MS };
  const key = jwks.keys.find((candidate) => candidate.kid === kid && candidate.kty === 'RSA' && candidate.use === 'sig');
  if (!key) throw new AppleAuthError('Firma Apple non riconosciuta', 401, 'apple_credential_invalid');
  return key;
};

const verifyAppleIdToken = async ({ credential, platform }) => {
  if (typeof credential !== 'string' || credential.length < 100 || credential.length > 12_000) {
    throw new AppleAuthError('Token Apple non valido');
  }
  const parts = credential.split('.');
  if (parts.length !== 3) throw new AppleAuthError('Token Apple non valido');

  let header;
  try {
    header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
  } catch {
    throw new AppleAuthError('Token Apple non valido');
  }
  if (header.alg !== 'RS256' || typeof header.kid !== 'string') {
    throw new AppleAuthError('Firma Apple non valida');
  }

  const jwk = await loadAppleSigningKey(header.kid);
  let payload;
  try {
    const publicKey = crypto.createPublicKey({ key: jwk, format: 'jwk' });
    payload = jwt.verify(credential, publicKey, {
      algorithms: ['RS256'],
      issuer: APPLE_ISSUER,
      audience: getAppleClientId(platform),
      clockTolerance: CLOCK_SKEW_SECONDS,
    });
  } catch {
    throw new AppleAuthError('Token Apple non valido per questa app o scaduto');
  }

  if (!payload || typeof payload.sub !== 'string' || !payload.sub) {
    throw new AppleAuthError('Identità Apple non valida');
  }
  return payload;
};

const appleNonceMatches = (storedHash, nonce) => {
  if (matchesOAuthNonce(storedHash, nonce)) return true;
  // AuthenticationServices può trasmettere nel claim il digest SHA-256
  // del nonce fornito dal server. Il challenge è comunque monouso e casuale.
  if (typeof nonce !== 'string' || nonce.length !== 64 || !/^[a-f0-9]{64}$/i.test(nonce)) return false;
  const expected = Buffer.from(storedHash || '', 'hex');
  const actual = Buffer.from(nonce, 'hex');
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
};

const verifyAppleCredential = async ({
  credential,
  authorizationCode,
  challenge,
  purpose,
  platform,
  userId = null,
  expectedAppleId = null,
}) => {
  if (typeof authorizationCode !== 'string' || authorizationCode.length < 10 || authorizationCode.length > 2_048) {
    throw new AppleAuthError('Codice Apple mancante o non valido', 400, 'apple_code_invalid');
  }
  if (typeof credential !== 'string' || !credential) {
    throw new AppleAuthError('Credenziale Apple mancante', 400, 'apple_credential_invalid');
  }

  const context = { challenge, provider: 'apple', purpose, platform, userId };
  const storedChallenge = await findActiveOAuthChallenge(context);
  if (!storedChallenge) {
    throw new AppleAuthError('Challenge Apple non valido o scaduto', 403, 'oauth_challenge_invalid');
  }

  const exchangedCredential = await exchangeAuthorizationCode({ authorizationCode, platform });
  const [submittedPayload, exchangedPayload] = await Promise.all([
    verifyAppleIdToken({ credential, platform }),
    verifyAppleIdToken({ credential: exchangedCredential, platform }),
  ]);
  const now = Math.floor(Date.now() / 1000);
  for (const payload of [submittedPayload, exchangedPayload]) {
    if (payload.sub !== exchangedPayload.sub) {
      throw new AppleAuthError('Il codice e il token Apple identificano utenti diversi');
    }
    if (!appleNonceMatches(storedChallenge.nonce_hash, payload.nonce)) {
      throw new AppleAuthError('Nonce Apple non corrispondente');
    }
    if (typeof payload.iat !== 'number'
      || payload.iat < now - CREDENTIAL_MAX_AGE_SECONDS
      || payload.iat > now + CLOCK_SKEW_SECONDS) {
      throw new AppleAuthError('Credenziale Apple non recente');
    }
  }

  if (expectedAppleId && exchangedPayload.sub !== expectedAppleId) {
    throw new AppleAuthError('Identità Apple non corrispondente all’account', 403, 'apple_identity_mismatch');
  }

  const nonceHash = storedChallenge.nonce_hash;
  const consumed = await consumeOAuthChallenge({ ...context, nonceHash });
  if (!consumed) throw new AppleAuthError('Challenge Apple già utilizzato o scaduto', 403, 'oauth_challenge_invalid');

  return exchangedPayload;
};

const emailIsVerified = (value) => value === true || value === 'true';
const acceptedAt = (value) => {
  if (typeof value !== 'string' || !value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime()) || parsed.getTime() > Date.now() + 5 * 60 * 1000) return null;
  return parsed;
};
const getAppleName = (value, email) => {
  if (typeof value === 'string' && value.trim()) return value.trim().slice(0, 100);
  const first = typeof value?.firstName === 'string' ? value.firstName.trim() : '';
  const last = typeof value?.lastName === 'string' ? value.lastName.trim() : '';
  const combined = `${first} ${last}`.trim();
  return (combined || email).slice(0, 100);
};

const resolveAppleUser = async ({ payload, name, privacyAcceptedAt, termsAcceptedAt, useAiCategorization = false }) => {
  let user = await User.findOne({ where: { apple_id: payload.sub } });
  let created = false;

  if (!user) {
    const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : '';
    if (!email || !emailIsVerified(payload.email_verified)) {
      throw new AppleAuthError('Apple non ha fornito un indirizzo email verificato', 401, 'apple_email_unverified');
    }

    const existing = await findUserByEmail(User, email);
    if (existing) {
      throw new AppleAuthError(
        'Esiste già un account con questa email. Accedi con il metodo già collegato.',
        409,
        'apple_account_exists',
      );
    }

    const privacyAt = acceptedAt(privacyAcceptedAt);
    const termsAt = acceptedAt(termsAcceptedAt);
    if (!privacyAt || !termsAt) {
      throw new AppleAuthError('Per creare un account accetta la Privacy Policy e i Termini', 400, 'apple_consent_required');
    }

    user = await User.create({
      nome: getAppleName(name, email),
      email,
      password: null,
      auth_provider: 'apple',
      apple_id: payload.sub,
      privacy_accepted_at: privacyAt,
      terms_accepted_at: termsAt,
      use_ai_categorization: useAiCategorization === true,
      last_login_at: new Date(),
    });
    created = true;
  } else {
    const updates = { last_login_at: new Date() };
    if (useAiCategorization === true && !user.use_ai_categorization) {
      updates.use_ai_categorization = true;
    }
    await user.update(updates);
  }

  await repairUserProfilo(user.id);
  const completeUser = await User.findByPk(user.id, {
    include: [{ model: ProfiloUtente, as: 'profilo' }],
  });
  if (created) await EmailService.sendWelcomeEmail(completeUser);
  return completeUser;
};

const authenticateApple = async (params) => {
  const payload = await verifyAppleCredential({ ...params, purpose: 'login', userId: null });
  return resolveAppleUser({ payload, ...params });
};

module.exports = {
  APPLE_KEYS_URL,
  CHALLENGE_TTL_SECONDS,
  AppleAuthError,
  isAppleAuthEnabled,
  getAppleClientId,
  createAppleChallenge,
  verifyAppleCredential,
  authenticateApple,
  resolveAppleUser,
  resetAppleJwksCache: () => { appleKeysCache = null; },
};
