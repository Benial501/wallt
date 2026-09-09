const { Resend } = require('resend');
const logger = require('../../utils/logger');
const { areGmailEquivalent } = require('../../utils/gmailAddress');
const {
  buildPasswordResetHtml,
  buildPasswordResetText,
} = require('./templates/PasswordResetTemplate');
const { buildWelcomeEmail } = require('./templates/WelcomeTemplate');

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

const sendEmail = async ({ to, subject, html, text, idempotencyKey }) => {
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
    }, idempotencyKey ? { idempotencyKey } : undefined);

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

// Chiamato solo dal backend dopo la creazione riuscita dell'utente.
// Attendere l'invio prima della risposta mantiene il lavoro vivo su Vercel.
const sendWelcomeEmail = async (user) => {
  try {
    if (!user?.id || !user.email) return { ok: false, reason: 'missing_user' };
    const appUrl = new URL(process.env.APP_URL || 'https://wallt.it');
    if (appUrl.protocol !== 'https:' || appUrl.username || appUrl.password) {
      return { ok: false, reason: 'invalid_app_url' };
    }
    const content = buildWelcomeEmail({ userName: user.nome, appUrl: appUrl.href });
    return await sendEmail({
      to: user.email,
      subject: 'Benvenuto su Wallt 👋',
      ...content,
      idempotencyKey: `welcome-user-${user.id}`,
    });
  } catch {
    logger.warn('[email] Email di benvenuto non inviata', { userId: user?.id });
    return { ok: false, reason: 'welcome_email_failed' };
  }
};

module.exports = {
  initEmailService,
  isEmailServiceReady,
  sendEmail,
  sendPasswordResetEmail,
  sendWelcomeEmail,
  resolveResendRecipient,
};
