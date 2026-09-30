const logger = require('../utils/logger');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { User } = require('../models');
const { isOAuthProvider } = require('../services/accountReset.service');

const generateStepUpToken = (userId, authProvider = 'local') => jwt.sign(
  { userId, type: 'step_up', auth_provider: authProvider },
  process.env.JWT_SECRET,
  { expiresIn: '5m' },
);

/**
 * Step-up per utenti con password locale: verifica bcrypt reale contro
 * l'hash in DB. Gli utenti OAuth non hanno una password e NON possono
 * ottenere uno step_up_token da questo endpoint (le vecchie frasi pubbliche
 * CONFERMA/ELIMINA/RESETTA non sono più una prova di identità): devono
 * usare il flusso dedicato POST /api/auth/google/challenge +
 * POST /api/auth/verify-google, che verifica crittograficamente un ID token
 * Google fresco — vedi googleStepUp.controller.js e docs/SECURITY.md.
 */
const verifyPassword = async (req, res) => {
  try {
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({ message: 'Password richiesta' });
    }

    const user = await User.findByPk(req.userId);
    if (!user) {
      return res.status(404).json({ message: 'Utente non trovato' });
    }

    if (isOAuthProvider(user.auth_provider) || !user.password) {
      return res.status(400).json({
        message: 'Gli account Google o Apple richiedono la verifica tramite il provider collegato',
        code: 'oauth_stepup_required',
      });
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(401).json({ message: 'Password non corretta' });
    }

    const stepUpToken = generateStepUpToken(user.id, user.auth_provider);
    return res.json({ step_up_token: stepUpToken });
  } catch (error) {
    logger.error('Errore verifyPassword', { err: error });
    return res.status(500).json({ message: 'Errore nella verifica password' });
  }
};

module.exports = {
  verifyPassword,
  generateStepUpToken,
};
