const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');
const { User } = require('../models');
const { isOAuthProvider } = require('../services/accountReset.service');

/**
 * Richiede uno step_up_token valido (JWT `type: 'step_up'`, 5 minuti,
 * emesso da POST /api/auth/verify-password dopo una verifica bcrypt reale).
 */
const requireStepUp = (req, res, next) => {
  const stepUpToken = req.headers['x-step-up-token'];

  if (!stepUpToken) {
    return res.status(403).json({ message: 'Autenticazione aggiuntiva richiesta' });
  }

  try {
    const decoded = jwt.verify(stepUpToken, process.env.JWT_SECRET);

    if (decoded.type !== 'step_up') {
      return res.status(403).json({ message: 'Autenticazione aggiuntiva richiesta' });
    }

    if (decoded.userId !== req.userId) {
      return res.status(403).json({ message: 'Autenticazione aggiuntiva richiesta' });
    }

    req.stepUpVerified = true;
    return next();
  } catch {
    return res.status(403).json({ message: 'Autenticazione aggiuntiva richiesta' });
  }
};

/**
 * Step-up richiesto SOLO agli account con password locale.
 *
 * Gli account OAuth (Google) non hanno una password da riverificare: dopo la
 * rimozione della ri-autenticazione Google (vedi docs/DECISIONS.md,
 * iterazione 4) per loro non esiste più alcun secondo fattore, quindi lo
 * step-up viene saltato e l'unica barriera resta la conferma testuale
 * ELIMINA/RESETTA validata dai controller. Scelta di prodotto esplicita:
 * il trade-off di sicurezza è documentato in docs/SECURITY.md.
 *
 * Il criterio è "l'utente ha una password locale utilizzabile", non il solo
 * `auth_provider`, così un account Google che in futuro impostasse una
 * password tornerebbe automaticamente sotto step-up reale.
 */
const requireStepUpUnlessOAuth = async (req, res, next) => {
  let user;
  try {
    user = await User.findByPk(req.userId, {
      attributes: ['id', 'password', 'auth_provider'],
    });
  } catch (error) {
    logger.error('Errore requireStepUpUnlessOAuth', { err: error });
    return res.status(500).json({ message: 'Errore nella verifica identità' });
  }

  if (!user) {
    return res.status(401).json({ message: 'Utente non trovato' });
  }

  if (isOAuthProvider(user.auth_provider) || !user.password) {
    req.stepUpSkippedOAuth = true;
    return next();
  }

  return requireStepUp(req, res, next);
};

module.exports = {
  requireStepUp,
  requireStepUpUnlessOAuth,
};
