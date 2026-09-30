const crypto = require('crypto');
const { Op } = require('sequelize');
const sequelize = require('../config/sequelize');
const { OAuthChallenge } = require('../models');

const CHALLENGE_TTL_SECONDS = 120;
const ALLOWED_PROVIDERS = new Set(['google', 'apple']);
const ALLOWED_PURPOSES = new Set(['login', 'step_up']);
const ALLOWED_PLATFORMS = new Set(['ios', 'web']);

const hashSecret = (value) => crypto.createHash('sha256').update(value).digest('hex');

const isValidContext = ({ provider, purpose, platform, userId }) => (
  ALLOWED_PROVIDERS.has(provider)
  && ALLOWED_PURPOSES.has(purpose)
  && ALLOWED_PLATFORMS.has(platform)
  && (userId === null || (Number.isInteger(userId) && userId > 0))
);

const createOAuthChallenge = async ({
  provider,
  purpose,
  platform,
  userId = null,
}) => {
  const context = { provider, purpose, platform, userId };
  if (!isValidContext(context)) throw new TypeError('Contesto challenge OAuth non valido');

  const challenge = crypto.randomBytes(32).toString('base64url');
  const nonce = crypto.randomBytes(32).toString('base64url');
  const now = new Date();
  const expiresAt = new Date(now.getTime() + CHALLENGE_TTL_SECONDS * 1000);

  await sequelize.transaction(async (transaction) => {
    await OAuthChallenge.destroy({
      where: { expires_at: { [Op.lte]: now } },
      transaction,
    });
    await OAuthChallenge.create({
      challenge_hash: hashSecret(challenge),
      nonce_hash: hashSecret(nonce),
      provider,
      purpose,
      platform,
      user_id: userId,
      expires_at: expiresAt,
    }, { transaction });
  });

  return {
    nonce,
    challenge,
    expires_in: CHALLENGE_TTL_SECONDS,
  };
};

const findActiveOAuthChallenge = async ({
  challenge,
  provider,
  purpose,
  platform,
  userId = null,
  now = new Date(),
}) => {
  if (typeof challenge !== 'string' || challenge.length < 32 || challenge.length > 128) return null;
  if (!isValidContext({ provider, purpose, platform, userId })) return null;

  return OAuthChallenge.findOne({
    where: {
      challenge_hash: hashSecret(challenge),
      provider,
      purpose,
      platform,
      user_id: userId,
      expires_at: { [Op.gt]: now },
      consumed_at: null,
    },
  });
};

const matchesOAuthNonce = (storedHash, nonce) => {
  if (typeof nonce !== 'string' || nonce.length < 32 || nonce.length > 128) return false;
  const expected = Buffer.from(storedHash || '', 'hex');
  const actual = Buffer.from(hashSecret(nonce), 'hex');
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
};

const consumeOAuthChallenge = async ({
  challenge,
  provider,
  purpose,
  platform,
  userId = null,
  nonce,
  nonceHash,
  now = new Date(),
}) => {
  if (typeof challenge !== 'string' || challenge.length < 32 || challenge.length > 128) return false;
  if (!isValidContext({ provider, purpose, platform, userId })) return false;

  const where = {
    challenge_hash: hashSecret(challenge),
    provider,
    purpose,
    platform,
    user_id: userId,
    expires_at: { [Op.gt]: now },
    consumed_at: null,
  };
  if (nonce !== undefined) where.nonce_hash = hashSecret(nonce);
  if (nonceHash !== undefined) where.nonce_hash = nonceHash;

  return sequelize.transaction(async (transaction) => {
    const [updated] = await OAuthChallenge.update(
      { consumed_at: now },
      { where, transaction },
    );
    return updated === 1;
  });
};

module.exports = {
  CHALLENGE_TTL_SECONDS,
  createOAuthChallenge,
  findActiveOAuthChallenge,
  matchesOAuthNonce,
  consumeOAuthChallenge,
};
