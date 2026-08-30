const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const CHALLENGE_TYPE = 'google_stepup_challenge';
const CHALLENGE_TTL_SECONDS = 120;
const CREDENTIAL_MAX_AGE_SECONDS = 120;
const CLOCK_SKEW_SECONDS = 10;

// OAuth2Client viene caricato in modo lazy: se venisse richiesto (require) a
// livello di modulo, verrebbe importato prima che un eventuale jest.mock()
// nei test abbia effetto (setupFilesAfterEach carica app.js prima che il
// singolo file di test venga eseguito).
let googleClient = null;
const getGoogleClient = () => {
  if (!googleClient) {
    const { OAuth2Client } = require('google-auth-library');
    googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
  }
  return googleClient;
};

// Tracking single-use dei nonce già consumati: in-memory, coerente con lo
// store già usato da express-rate-limit in questo progetto. Non sopravvive a
// un riavvio del server né si condivide tra istanze multiple (accettabile su
// un singolo processo — vedi docs/SECURITY.md). Pulizia periodica per non
// crescere indefinitamente.
const consumedNonces = new Map(); // nonce -> expiresAtMs

const pruneConsumedNonces = () => {
  const now = Date.now();
  for (const [nonce, expiresAt] of consumedNonces) {
    if (expiresAt <= now) consumedNonces.delete(nonce);
  }
};

class GoogleStepUpError extends Error {
  constructor(message, statusCode = 403) {
    super(message);
    this.name = 'GoogleStepUpError';
    this.statusCode = statusCode;
  }
}

/**
 * Genera un challenge per lo step-up Google: un nonce casuale (192 bit)
 * incapsulato in un JWT firmato, legato a userId, valido 2 minuti.
 */
const generateChallenge = (userId) => {
  const nonce = crypto.randomBytes(24).toString('base64url');
  const challenge = jwt.sign(
    { userId, nonce, type: CHALLENGE_TYPE },
    process.env.JWT_SECRET,
    { expiresIn: `${CHALLENGE_TTL_SECONDS}s` },
  );
  return { nonce, challenge, expires_in: CHALLENGE_TTL_SECONDS };
};

const decodeChallenge = (challenge, userId) => {
  let decoded;
  try {
    decoded = jwt.verify(challenge, process.env.JWT_SECRET);
  } catch {
    throw new GoogleStepUpError('Challenge non valido o scaduto');
  }

  if (decoded.type !== CHALLENGE_TYPE) {
    throw new GoogleStepUpError('Challenge non valido');
  }
  if (decoded.userId !== userId) {
    throw new GoogleStepUpError('Challenge non valido');
  }
  return decoded;
};

/**
 * Verifica lo step-up Google: challenge (legato a userId, non scaduto,
 * nonce non ancora consumato) + ID token Google (firma, audience, issuer,
 * scadenza — verificati da google-auth-library) + nonce combaciante +
 * freschezza + sub === google_id dell'utente autenticato (mai da valori
 * inviati nel body).
 *
 * @param {{ credential: string, challenge: string, userId: number, googleId: string }} params
 * @returns {Promise<void>} risolve se la verifica ha successo, altrimenti lancia GoogleStepUpError.
 */
const verifyGoogleStepUp = async ({
  credential, challenge, userId, googleId,
}) => {
  if (!credential || !challenge) {
    throw new GoogleStepUpError('Credenziale o challenge mancante', 400);
  }
  if (!googleId) {
    throw new GoogleStepUpError('Account non collegato a Google', 400);
  }

  const { nonce } = decodeChallenge(challenge, userId);

  pruneConsumedNonces();
  if (consumedNonces.has(nonce)) {
    throw new GoogleStepUpError('Challenge già utilizzato');
  }

  let ticket;
  try {
    ticket = await getGoogleClient().verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
  } catch {
    throw new GoogleStepUpError('Credenziale Google non valida o scaduta', 401);
  }

  const payload = ticket.getPayload();
  if (!payload) {
    throw new GoogleStepUpError('Credenziale Google non valida', 401);
  }

  if (payload.nonce !== nonce) {
    throw new GoogleStepUpError('Nonce non corrispondente', 401);
  }

  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.iat !== 'number' || payload.iat < now - CREDENTIAL_MAX_AGE_SECONDS || payload.iat > now + CLOCK_SKEW_SECONDS) {
    throw new GoogleStepUpError('Credenziale Google non recente', 401);
  }

  if (payload.sub !== googleId) {
    throw new GoogleStepUpError('Identità Google non corrispondente', 403);
  }

  // Consumo del nonce solo dopo che tutti i controlli sono passati.
  consumedNonces.set(nonce, Date.now() + CHALLENGE_TTL_SECONDS * 1000);
};

module.exports = {
  generateChallenge,
  verifyGoogleStepUp,
  GoogleStepUpError,
};
