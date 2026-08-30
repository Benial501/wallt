const logger = require('../utils/logger');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const { Op } = require('sequelize');
const { PasswordResetToken, User } = require('../models');
const EmailService = require('./email/EmailService');
const { findUserByEmail } = require('../utils/findUserByEmail');

const TOKEN_TTL_MS = 30 * 60 * 1000;
const BCRYPT_ROUNDS = 10;
const OAUTH_PROVIDERS = new Set(['google', 'apple']);

const hashToken = (token) => (
  crypto.createHash('sha256').update(token).digest('hex')
);

const getResetUrl = () => {
  if (process.env.PASSWORD_RESET_URL) {
    return process.env.PASSWORD_RESET_URL.replace(/\/$/, '');
  }

  const origins = process.env.CORS_ORIGINS || 'http://localhost:5173';
  return `${origins.split(',')[0].trim().replace(/\/$/, '')}/reset-password`;
};

const buildPasswordResetLink = (token) => (
  `${getResetUrl()}?token=${encodeURIComponent(token)}`
);

const isOAuthOnlyAccount = (user) => (
  !user.password && OAUTH_PROVIDERS.has(user.auth_provider)
);

const invalidateActiveTokens = async (userId, transaction) => {
  await PasswordResetToken.update(
    { used_at: new Date() },
    {
      where: {
        user_id: userId,
        used_at: null,
        expires_at: { [Op.gt]: new Date() },
      },
      transaction,
    },
  );
};

const createPasswordResetToken = async (userId) => {
  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);

  await invalidateActiveTokens(userId);

  await PasswordResetToken.create({
    user_id: userId,
    token_hash: tokenHash,
    expires_at: expiresAt,
  });

  return token;
};

const findValidTokenRecord = async (plainToken) => {
  if (!plainToken) {
    return null;
  }

  const tokenHash = hashToken(plainToken);

  return PasswordResetToken.findOne({
    where: {
      token_hash: tokenHash,
      used_at: null,
      expires_at: { [Op.gt]: new Date() },
    },
  });
};

const requestPasswordReset = async (email) => {
  if (!EmailService.isEmailServiceReady()) {
    return {
      processed: false,
      emailed: false,
      reason: 'email_service_not_ready',
    };
  }

  const user = await findUserByEmail(User, email);

  if (!user) {
    return { processed: true, emailed: false, reason: 'user_not_found' };
  }

  if (isOAuthOnlyAccount(user)) {
    return {
      processed: true,
      emailed: false,
      reason: 'oauth_account',
      provider: user.auth_provider,
    };
  }

  const token = await createPasswordResetToken(user.id);
  const resetLink = buildPasswordResetLink(token);

  const emailResult = await EmailService.sendPasswordResetEmail({
    to: user.email,
    resetUrl: resetLink,
    userName: user.nome,
  });

  if (emailResult.ok !== true) {
    logger.error('[passwordReset] Invio email fallito', {
      reason: emailResult.reason || 'email_failed',
      err: emailResult.error,
    });

    return {
      processed: true,
      emailed: false,
      reason: 'email_failed',
    };
  }

  return {
    processed: true,
    emailed: true,
    reason: 'sent',
  };
};

const resetPasswordWithToken = async (token, newPassword) => {
  if (!token || !newPassword) {
    return { ok: false, reason: 'invalid_input' };
  }

  const record = await findValidTokenRecord(token);
  if (!record) {
    return { ok: false, reason: 'invalid_token' };
  }

  const user = await User.findByPk(record.user_id);
  if (!user) {
    return { ok: false, reason: 'user_not_found' };
  }

  const hashedPassword = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
  const now = new Date();

  await User.sequelize.transaction(async (transaction) => {
    await user.update(
      {
        password: hashedPassword,
        password_changed_at: now,
      },
      { transaction },
    );
    await record.update({ used_at: now }, { transaction });
    await invalidateActiveTokens(user.id, transaction);
  });

  return { ok: true };
};

module.exports = {
  requestPasswordReset,
  resetPasswordWithToken,
  findValidTokenRecord,
  hashToken,
  isOAuthOnlyAccount,
};
