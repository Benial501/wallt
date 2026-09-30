const logger = require('../utils/logger');
const { generateToken, formatUser } = require('./auth.controller');
const { isOnboardingComplete } = require('../utils/onboarding');
const {
  CHALLENGE_TTL_SECONDS,
  GoogleNativeAuthError,
  createGoogleNativeChallenge,
  authenticateNativeGoogle,
} = require('../services/googleNativeAuth.service');
const { GoogleAccountLinkingError } = require('../services/googleAuth.service');
const {
  AppleAuthError,
  createAppleChallenge,
  authenticateApple,
  isAppleAuthEnabled,
} = require('../services/appleAuth.service');

const getGoogleNativeChallenge = async (_req, res) => {
  if (!process.env.GOOGLE_CLIENT_ID) {
    return res.status(503).json({ message: 'Accesso Google non configurato', code: 'google_not_configured' });
  }

  try {
    const challenge = await createGoogleNativeChallenge();
    return res.json({ ...challenge, expires_in: CHALLENGE_TTL_SECONDS });
  } catch (error) {
    logger.error('Errore generazione challenge Google nativo', { err: error });
    return res.status(500).json({ message: 'Errore nella generazione del challenge' });
  }
};

const verifyGoogleNative = async (req, res) => {
  if (!process.env.GOOGLE_CLIENT_ID) {
    return res.status(503).json({ message: 'Accesso Google non configurato', code: 'google_not_configured' });
  }

  try {
    const user = await authenticateNativeGoogle({
      credential: req.body.credential,
      challenge: req.body.challenge,
      useAiCategorization: req.body.use_ai_categorization === true,
    });
    const onboarding = isOnboardingComplete(user.profilo) ? 'done' : 'new';
    return res.json({
      token: generateToken(user),
      onboarding,
      user: formatUser(user),
    });
  } catch (error) {
    if (error instanceof GoogleNativeAuthError) {
      return res.status(error.statusCode).json({ message: error.message, code: error.code });
    }
    if (error instanceof GoogleAccountLinkingError) {
      return res.status(409).json({ message: error.message, code: error.code });
    }
    logger.error('Errore verifica accesso Google nativo', { err: error });
    return res.status(500).json({ message: 'Errore durante l’accesso con Google' });
  }
};

const getAppleLoginChallenge = async (req, res) => {
  if (!isAppleAuthEnabled()) {
    return res.status(503).json({ message: 'Accesso Apple non configurato', code: 'apple_not_configured' });
  }
  try {
    const challenge = await createAppleChallenge({ platform: req.body.platform });
    return res.json({ ...challenge, expires_in: CHALLENGE_TTL_SECONDS });
  } catch (error) {
    if (error instanceof AppleAuthError) {
      return res.status(error.statusCode).json({ message: error.message, code: error.code });
    }
    logger.error('Errore generazione challenge Apple', { err: error });
    return res.status(500).json({ message: 'Errore nella generazione del challenge' });
  }
};

const verifyAppleLogin = async (req, res) => {
  if (!isAppleAuthEnabled()) {
    return res.status(503).json({ message: 'Accesso Apple non configurato', code: 'apple_not_configured' });
  }
  try {
    const user = await authenticateApple({
      credential: req.body.credential,
      authorizationCode: req.body.authorization_code,
      challenge: req.body.challenge,
      platform: req.body.platform,
      name: req.body.name,
      privacyAcceptedAt: req.body.privacy_accepted_at,
      termsAcceptedAt: req.body.terms_accepted_at,
      useAiCategorization: req.body.use_ai_categorization === true,
    });
    const onboarding = isOnboardingComplete(user.profilo) ? 'done' : 'new';
    return res.json({ token: generateToken(user), onboarding, user: formatUser(user) });
  } catch (error) {
    if (error instanceof AppleAuthError) {
      return res.status(error.statusCode).json({ message: error.message, code: error.code });
    }
    logger.error('Errore verifica accesso Apple', { err: error });
    return res.status(500).json({ message: 'Errore durante l’accesso con Apple' });
  }
};

module.exports = {
  getGoogleNativeChallenge,
  verifyGoogleNative,
  getAppleLoginChallenge,
  verifyAppleLogin,
};
