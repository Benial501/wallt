const logger = require('../utils/logger');
const { User } = require('../models');
const { generateStepUpToken } = require('./verifyPassword.controller');
const { AppleAuthError, createAppleChallenge, verifyAppleCredential } = require('../services/appleAuth.service');

const getAppleStepUpChallenge = async (req, res) => {
  const user = await User.findByPk(req.userId);
  if (!user || user.auth_provider !== 'apple' || !user.apple_id) {
    return res.status(400).json({ message: 'Solo gli account Apple possono usare questa verifica' });
  }
  try {
    const challenge = await createAppleChallenge({
      platform: req.body.platform,
      purpose: 'step_up',
      userId: req.userId,
    });
    return res.json(challenge);
  } catch (error) {
    if (error instanceof AppleAuthError) {
      return res.status(error.statusCode).json({ message: error.message, code: error.code });
    }
    logger.error('Errore generazione challenge step-up Apple', { err: error });
    return res.status(500).json({ message: 'Errore nella generazione del challenge' });
  }
};

const verifyAppleStepUp = async (req, res) => {
  const user = await User.findByPk(req.userId);
  if (!user || user.auth_provider !== 'apple' || !user.apple_id) {
    return res.status(400).json({ message: 'Solo gli account Apple possono usare questa verifica' });
  }
  try {
    await verifyAppleCredential({
      credential: req.body.credential,
      authorizationCode: req.body.authorization_code,
      challenge: req.body.challenge,
      purpose: 'step_up',
      platform: req.body.platform,
      userId: req.userId,
      expectedAppleId: user.apple_id,
    });
    return res.json({ step_up_token: generateStepUpToken(user.id, user.auth_provider) });
  } catch (error) {
    if (error instanceof AppleAuthError) {
      return res.status(error.statusCode).json({ message: error.message, code: error.code });
    }
    logger.error('Errore verifica step-up Apple', { err: error });
    return res.status(500).json({ message: 'Errore durante la verifica Apple' });
  }
};

module.exports = { getAppleStepUpChallenge, verifyAppleStepUp };
