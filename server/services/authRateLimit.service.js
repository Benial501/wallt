const crypto = require('crypto');
const { QueryTypes } = require('sequelize');
const AuthRateLimit = require('../models/AuthRateLimit');

const hashKey = (key, route) => crypto
  .createHash('sha256')
  .update(`${route}\0${key}`)
  .digest('hex');

const getWindow = (windowMs, now = Date.now()) => {
  const startMs = Math.floor(now / windowMs) * windowMs;
  return {
    windowStart: new Date(startMs),
    resetTime: new Date(startMs + windowMs),
  };
};

const consumeAuthRateLimit = async ({ key, route, windowMs }) => {
  const keyHash = hashKey(key, route);
  const { windowStart, resetTime } = getWindow(windowMs);

  const rows = await AuthRateLimit.sequelize.query(`
    WITH cleanup AS (
      DELETE FROM auth_rate_limits
      WHERE window_start < :windowStart
    ), upserted AS (
      INSERT INTO auth_rate_limits
        (key_hash, route, window_start, hit_count, created_at, updated_at)
      VALUES
        (:keyHash, :route, :windowStart, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT (key_hash, route, window_start)
      DO UPDATE SET
        hit_count = auth_rate_limits.hit_count + 1,
        updated_at = CURRENT_TIMESTAMP
      RETURNING hit_count
    )
    SELECT hit_count FROM upserted
  `, {
    replacements: { keyHash, route, windowStart },
    type: QueryTypes.SELECT,
  });

  return {
    totalHits: Number(rows[0].hit_count),
    resetTime,
  };
};

const decrementAuthRateLimit = async ({ key, route, windowMs }) => {
  const keyHash = hashKey(key, route);
  const { windowStart } = getWindow(windowMs);
  await AuthRateLimit.update(
    { hit_count: AuthRateLimit.sequelize.literal('GREATEST(hit_count - 1, 0)') },
    { where: { key_hash: keyHash, route, window_start: windowStart } },
  );
};

const resetAuthRateLimit = async ({ key, route }) => {
  await AuthRateLimit.destroy({
    where: { key_hash: hashKey(key, route), route },
  });
};

module.exports = {
  consumeAuthRateLimit,
  decrementAuthRateLimit,
  resetAuthRateLimit,
  hashKey,
  getWindow,
};
