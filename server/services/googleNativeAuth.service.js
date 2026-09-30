const {
  createOAuthChallenge,
  findActiveOAuthChallenge,
  matchesOAuthNonce,
  consumeOAuthChallenge,
} = require('./oauthChallenge.service');
const { resolveGoogleUser } = require('./googleAuth.service');

const CHALLENGE_TTL_SECONDS = 120;
const CREDENTIAL_MAX_AGE_SECONDS = 120;
const CLOCK_SKEW_SECONDS = 10;

let googleClient = null;
const getGoogleClient = () => {
  if (!googleClient) {
    const { OAuth2Client } = require('google-auth-library');
    googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
  }
  return googleClient;
};

class GoogleNativeAuthError extends Error {
  constructor(message, statusCode = 401, code = 'google_credential_invalid') {
    super(message);
    this.name = 'GoogleNativeAuthError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

const createGoogleNativeChallenge = () => createOAuthChallenge({
  provider: 'google',
  purpose: 'login',
  platform: 'ios',
});

/**
 * Verifica un ID token Google e consuma il challenge condiviso solo dopo tutti
 * i controlli. L'audience resta il client OAuth web server-side, usato da
 * GoogleSignIn iOS tramite `serverClientID` e dal client GIS nel browser.
 */
const verifyGoogleCredential = async ({
  credential,
  challenge,
  purpose,
  platform,
  userId = null,
  googleId = null,
  requireEmail = purpose === 'login',
}) => {
  if (typeof credential !== 'string' || !credential || typeof challenge !== 'string' || !challenge) {
    throw new GoogleNativeAuthError('Credenziale o challenge mancante', 400, 'google_challenge_invalid');
  }

  const context = { challenge, provider: 'google', purpose, platform, userId };
  const storedChallenge = await findActiveOAuthChallenge(context);
  if (!storedChallenge) {
    throw new GoogleNativeAuthError('Challenge non valido o scaduto', 403, 'oauth_challenge_invalid');
  }

  let ticket;
  try {
    ticket = await getGoogleClient().verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
  } catch {
    throw new GoogleNativeAuthError('Credenziale Google non valida o scaduta');
  }

  const payload = ticket?.getPayload?.();
  if (!payload || typeof payload.sub !== 'string' || !payload.sub) {
    throw new GoogleNativeAuthError('Credenziale Google non valida');
  }

  if (!matchesOAuthNonce(storedChallenge.nonce_hash, payload.nonce)) {
    throw new GoogleNativeAuthError('Nonce Google non corrispondente');
  }

  const now = Math.floor(Date.now() / 1000);
  if (
    typeof payload.iat !== 'number'
    || payload.iat < now - CREDENTIAL_MAX_AGE_SECONDS
    || payload.iat > now + CLOCK_SKEW_SECONDS
  ) {
    throw new GoogleNativeAuthError('Credenziale Google non recente');
  }

  if (googleId && payload.sub !== googleId) {
    throw new GoogleNativeAuthError('Identità Google non corrispondente', 403, 'google_identity_mismatch');
  }

  if (requireEmail && (typeof payload.email !== 'string' || !payload.email || payload.email_verified !== true)) {
    throw new GoogleNativeAuthError('Google non ha verificato l’indirizzo email', 401, 'google_email_unverified');
  }

  const consumed = await consumeOAuthChallenge({ ...context, nonce: payload.nonce });
  if (!consumed) {
    throw new GoogleNativeAuthError('Challenge già utilizzato o scaduto', 403, 'oauth_challenge_invalid');
  }

  return payload;
};

const authenticateNativeGoogle = async ({ credential, challenge, useAiCategorization = false }) => {
  const payload = await verifyGoogleCredential({
    credential,
    challenge,
    purpose: 'login',
    platform: 'ios',
    userId: null,
    requireEmail: true,
  });

  const profile = {
    id: payload.sub,
    displayName: payload.name || payload.email,
    emails: [{ value: payload.email }],
    photos: payload.picture ? [{ value: payload.picture }] : [],
  };

  return resolveGoogleUser(profile, { useAiCategorization });
};

module.exports = {
  CHALLENGE_TTL_SECONDS,
  GoogleNativeAuthError,
  createGoogleNativeChallenge,
  verifyGoogleCredential,
  authenticateNativeGoogle,
};
