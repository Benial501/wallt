const logger = require('../utils/logger');
const {
  requestPasswordReset,
  resetPasswordWithToken,
  findValidTokenRecord,
} = require('../services/passwordReset.service');

const FORGOT_PASSWORD_MESSAGE = 'Se l\'email esiste, riceverai un link di reset entro pochi minuti.';
const FORGOT_PASSWORD_OAUTH_MESSAGE = {
  google: 'Questo account usa Google. Accedi con "Continua con Google".',
  apple: 'Questo account usa Apple. Accedi con "Continua con Apple".',
};
const FORGOT_PASSWORD_EMAIL_ERROR = 'Impossibile inviare l\'email di reset. Riprova più tardi.';
const RESET_PASSWORD_ERROR = 'Link non valido o scaduto. Richiedi un nuovo reset password.';

const maskEmail = (email) => {
  if (!email || !email.includes('@')) {
    return null;
  }

  const [local, domain] = email.split('@');
  const visible = local.slice(0, 2) || '*';
  return `${visible}***@${domain}`;
};

const verifyResetToken = async (req, res) => {
  try {
    const { token } = req.body;
    const record = await findValidTokenRecord(token);

    if (!record) {
      return res.status(400).json({ valid: false, message: RESET_PASSWORD_ERROR });
    }

    const { User } = require('../models');
    const user = await User.findByPk(record.user_id, { attributes: ['email', 'nome'] });

    if (!user) {
      return res.status(400).json({ valid: false, message: RESET_PASSWORD_ERROR });
    }

    return res.json({
      valid: true,
      emailHint: maskEmail(user.email),
      nome: user.nome,
    });
  } catch (error) {
    logger.error('[passwordReset] Errore verifyResetToken', { err: error });
    return res.status(400).json({ valid: false, message: RESET_PASSWORD_ERROR });
  }
};

const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    const result = await requestPasswordReset(email);

    if (result.reason === 'email_service_not_ready') {
      logger.error('[passwordReset] Servizio email non disponibile');
      return res.status(503).json({ message: FORGOT_PASSWORD_EMAIL_ERROR });
    }

    if (result.reason === 'oauth_account') {
      const providerMessage = FORGOT_PASSWORD_OAUTH_MESSAGE[result.provider]
        || 'Questo account usa un accesso social. Usa lo stesso metodo con cui ti sei registrato.';
      return res.json({ message: providerMessage, code: 'oauth_account' });
    }

    if (!result.emailed && result.reason === 'email_failed') {
      logger.warn('[passwordReset] Email non inviata', { email, reason: result.reason });
      return res.status(503).json({ message: FORGOT_PASSWORD_EMAIL_ERROR });
    }

    if (!result.emailed && result.reason !== 'user_not_found') {
      logger.warn('[passwordReset] Richiesta non completata', { email, reason: result.reason });
    }

    return res.json({ message: FORGOT_PASSWORD_MESSAGE });
  } catch (error) {
    logger.error('[passwordReset] Errore forgotPassword', { err: error });
    return res.json({ message: FORGOT_PASSWORD_MESSAGE });
  }
};

const resetPassword = async (req, res) => {
  try {
    const { token, newPassword } = req.body;
    const result = await resetPasswordWithToken(token, newPassword);

    if (!result.ok) {
      return res.status(400).json({ message: RESET_PASSWORD_ERROR });
    }

    return res.json({ message: 'Password aggiornata con successo.' });
  } catch (error) {
    logger.error('[passwordReset] Errore resetPassword', { err: error });
    return res.status(400).json({ message: RESET_PASSWORD_ERROR });
  }
};

module.exports = {
  forgotPassword,
  resetPassword,
  verifyResetToken,
  FORGOT_PASSWORD_MESSAGE,
  RESET_PASSWORD_ERROR,
};
