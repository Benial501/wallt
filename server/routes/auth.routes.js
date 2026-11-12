const logger = require('../utils/logger');
const express = require('express');
const passport = require('../config/passport');
const { isGoogleAuthEnabled } = require('../config/passport');
const { isOnboardingComplete } = require('../utils/onboarding');
const {
  sendOAuthSuccess,
  sendOAuthError,
  resolveOAuthTargetOrigin,
  encodeOAuthState,
  parseOAuthState,
} = require('../utils/oauthPopup');
const {
  register,
  login,
  me,
  generateToken,
  formatUser,
} = require('../controllers/auth.controller');
const authMiddleware = require('../middleware/auth.middleware');
const {
  validateRegister,
  validateLogin,
  validateVerifyPassword,
  validateGoogleStepUpVerify,
} = require('../middleware/validation.middleware');
const passwordResetRoutes = require('./passwordReset.routes');
const { verifyPassword } = require('../controllers/verifyPassword.controller');
const {
  getGoogleStepUpChallenge,
  verifyGoogleStepUp,
} = require('../controllers/googleStepUp.controller');

const router = express.Router();

const getProviders = (_req, res) => {
  res.json({
    google: isGoogleAuthEnabled(),
    apple: false,
  });
};

router.get('/providers', getProviders);

router.post('/register', validateRegister, register);
router.post('/login', validateLogin, login);
router.use('/', passwordResetRoutes);
router.post('/verify-password', authMiddleware, validateVerifyPassword, verifyPassword);
router.post('/google/challenge', authMiddleware, getGoogleStepUpChallenge);
router.post('/verify-google', authMiddleware, validateGoogleStepUpVerify, verifyGoogleStepUp);
router.get('/me', authMiddleware, me);

router.get('/google', (req, res, next) => {
  const targetOrigin = resolveOAuthTargetOrigin(req);

  if (!isGoogleAuthEnabled()) {
    return sendOAuthError(res, 'google_not_configured', targetOrigin);
  }

  const privacyAcceptedAt = req.query.privacy_accepted_at;
  const termsAcceptedAt = req.query.terms_accepted_at;
  const useAiCategorization = req.query.use_ai_categorization === '1';
  // Nonce generato dalla finestra che ha aperto il popup: torna nel payload
  // e il client accetta solo un token col SUO nonce, così un link con un
  // token altrui (login CSRF) non installa nessuna sessione.
  const nonce = typeof req.query.nonce === 'string' && /^[A-Za-z0-9-]{16,64}$/.test(req.query.nonce)
    ? req.query.nonce
    : undefined;

  return passport.authenticate('google', {
    scope: ['profile', 'email'],
    session: false,
    state: encodeOAuthState(targetOrigin, {
      privacyAcceptedAt,
      termsAcceptedAt,
      useAiCategorization,
      nonce,
    }),
  })(req, res, next);
});

router.get('/google/callback', (req, res, next) => {
  const targetOrigin = resolveOAuthTargetOrigin(req);

  if (!isGoogleAuthEnabled()) {
    return sendOAuthError(res, 'google_not_configured', targetOrigin);
  }

  const { nonce } = parseOAuthState(req.query.state);

  return passport.authenticate('google', { session: false }, (err, user) => {
    if (err) {
      if (err.code === 'google_account_exists_local') {
        // Non un errore di sistema: rifiuto intenzionale per evitare
        // l'auto-collegamento a un account locale (vedi googleAuth.service.js).
        logger.warn('Google OAuth: rifiutato auto-link su account locale esistente', { message: err.message });
        return sendOAuthError(res, 'google_account_exists_local', targetOrigin);
      }
      logger.error('Errore callback Google OAuth', { err: err });
      return sendOAuthError(res, 'google', targetOrigin);
    }

    if (!user) {
      return sendOAuthError(res, 'google', targetOrigin);
    }

    try {
      const token = generateToken(user);
      const onboarding = isOnboardingComplete(user.profilo) ? 'done' : 'new';
      return sendOAuthSuccess(res, {
        token,
        onboarding,
        user: formatUser(user),
        nonce,
      }, targetOrigin);
    } catch (error) {
      logger.error('Errore generazione token OAuth', { err: error });
      return sendOAuthError(res, 'google', targetOrigin);
    }
  })(req, res, next);
});

module.exports = router;
