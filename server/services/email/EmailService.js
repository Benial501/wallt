const { Resend } = require('resend');
const logger = require('../../utils/logger');
const { areGmailEquivalent } = require('../../utils/gmailAddress');
const {
  buildPasswordResetHtml,
  buildPasswordResetText,
} = require('./templates/PasswordResetTemplate');

let resendClient = null;
let isReady = false;

const isResendSandboxFrom = () => (
  String(process.env.EMAIL_FROM || '').includes('resend.dev')
);

/**
 * In sandbox Resend accetta solo l'email esatta dell'account.
 * Gmail ignora i punti, quindi reindirizziamo alias equivalenti.
 */
const resolveResendRecipient = (to) => {
  const sandboxEmail = process.env.RESEND_SANDBOX_EMAIL;
  if (!sandboxEmail || !isResendSandboxFrom()) {
    return to;
  }

  if (to === sandboxEmail) {
    return to;
  }

  if (areGmailEquivalent(to, sandboxEmail)) {
    logger.info('[email] Sandbox Resend: reindirizzo destinatario Gmail equivalente', {
      requested: to,
      resolved: sandboxEmail,
    });
    return sandboxEmail;
  }

  return to;
};

const initEmailService = () => {
  const apiKey = process.env.RESEND_API_KEY;
  const emailFrom = process.env.EMAIL_FROM;

  if (!apiKey) {
    logger.error(
      '[email] RESEND_API_KEY non configurata — servizio email disabilitato. '
      + 'Imposta RESEND_API_KEY in server/.env',
    );
    resendClient = null;
    isReady = false;
    return { ok: false, reason: 'missing_api_key' };
  }

  if (!emailFrom) {
    logger.error(
      '[email] EMAIL_FROM non configurato — servizio email disabilitato. '
      + 'Imposta EMAIL_FROM in server/.env (es. "WALLT <noreply@tuodominio.com>")',
    );
    resendClient = null;
    isReady = false;
    return { ok: false, reason: 'missing_email_from' };
  }

  resendClient = new Resend(apiKey);
  isReady = true;
  logger.info('[email] Servizio Resend inizializzato');
  return { ok: true };
};

const isEmailServiceReady = () => isReady;

const sendEmail = async ({ to, subject, html, text }) => {
  if (!to || !subject) {
    logger.warn('[email] Parametri mancanti (to/subject), invio saltato');
    return { ok: false, skipped: true, reason: 'missing_params' };
  }

  if (!isReady || !resendClient) {
    logger.warn('[email] Servizio email non disponibile, invio saltato', { to, subject });
    return { ok: false, skipped: true, reason: 'email_service_not_ready' };
  }

  const recipient = resolveResendRecipient(to);

  try {
    const { data, error } = await resendClient.emails.send({
      from: process.env.EMAIL_FROM,
      to: [recipient],
      subject,
      html,
      text: text || undefined,
    });

    if (error) {
      logger.error('[email] Errore Resend', { to: recipient, subject, err: error });
      return { ok: false, error: error.message || 'resend_error' };
    }

    return { ok: true, messageId: data?.id };
  } catch (error) {
    logger.error('[email] Errore invio email', { to: recipient, subject, err: error });
    return { ok: false, error: error.message };
  }
};

const sendPasswordResetEmail = async ({ to, resetUrl, userName }) => {
  const subject = 'WALLT — Reimposta la tua password';

  return sendEmail({
    to,
    subject,
    html: buildPasswordResetHtml({ resetUrl, userName }),
    text: buildPasswordResetText({ resetUrl, userName }),
  });
};

module.exports = {
  initEmailService,
  isEmailServiceReady,
  sendEmail,
  sendPasswordResetEmail,
  resolveResendRecipient,
};
