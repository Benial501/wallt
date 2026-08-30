const logger = require('../utils/logger');
const { User } = require('../models');
const { generateStepUpToken } = require('./verifyPassword.controller');
const {
  generateChallenge,
  verifyGoogleStepUp,
  GoogleStepUpError,
} = require('../services/googleStepUp.service');
const { isOAuthProvider } = require('../services/accountReset.service');

/**
 * POST /api/auth/google/challenge — primo passo dello step-up Google: genera
 * un nonce/challenge legato all'utente autenticato, da passare a Google
 * Identity Services lato frontend.
 */
const getGoogleStepUpChallenge = async (req, res) => {
  try {
    const user = await User.findByPk(req.userId);
    if (!user || !isOAuthProvider(user.auth_provider) || !user.google_id) {
      return res.status(400).json({ message: 'Solo per account Google' });
    }

    const { nonce, challenge, expires_in: expiresIn } = generateChallenge(req.userId);
    return res.json({ nonce, challenge, expires_in: expiresIn });
  } catch (error) {
    logger.error('Errore getGoogleStepUpChallenge', { err: error });
    return res.status(500).json({ message: 'Errore nella generazione del challenge' });
  }
};

/**
 * POST /api/auth/verify-google — secondo passo: verifica l'ID token Google
 * ottenuto tramite il pulsante "Continua con Google" contro il challenge, ed
 * emette lo stesso step_up_token usato dal flusso locale.
 */
const verifyGoogleStepUpHandler = async (req, res) => {
  try {
    const { credential, challenge } = req.body;

    const user = await User.findByPk(req.userId);
    if (!user) {
      return res.status(404).json({ message: 'Utente non trovato' });
    }
    if (!isOAuthProvider(user.auth_provider) || !user.google_id) {
      return res.status(400).json({ message: 'Solo per account Google' });
    }

    await verifyGoogleStepUp({
      credential,
      challenge,
      userId: req.userId,
      googleId: user.google_id,
    });

    const stepUpToken = generateStepUpToken(user.id);
    return res.json({ step_up_token: stepUpToken });
  } catch (error) {
    if (error instanceof GoogleStepUpError) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    logger.error('Errore verifyGoogleStepUpHandler', { err: error });
    return res.status(500).json({ message: 'Errore nella verifica Google' });
  }
};

module.exports = {
  getGoogleStepUpChallenge,
  verifyGoogleStepUp: verifyGoogleStepUpHandler,
};
