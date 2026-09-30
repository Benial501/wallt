const jwt = require('jsonwebtoken');

/**
 * Richiede uno step_up_token valido (JWT `type: 'step_up'`, 5 minuti,
 * emesso da una riverifica bcrypt o dal provider OAuth collegato).
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

    if (decoded.userId !== req.userId || decoded.auth_provider !== req.authProvider) {
      return res.status(403).json({ message: 'Autenticazione aggiuntiva richiesta' });
    }

    req.stepUpVerified = true;
    return next();
  } catch {
    return res.status(403).json({ message: 'Autenticazione aggiuntiva richiesta' });
  }
};

/**
 * Compatibilità con eventuali import legacy. Gli account OAuth non vengono
 * esentati: anche questo alias richiede uno step-up provider-verified.
 * Le nuove route devono importare `requireStepUp` direttamente.
 */
const requireStepUpUnlessOAuth = requireStepUp;

module.exports = {
  requireStepUp,
  requireStepUpUnlessOAuth,
};
