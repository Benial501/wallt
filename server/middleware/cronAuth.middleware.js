const crypto = require('crypto');

const safeTokenEqual = (provided, expected) => {
  if (typeof provided !== 'string' || typeof expected !== 'string') return false;

  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);
  if (providedBuffer.length !== expectedBuffer.length) return false;

  return crypto.timingSafeEqual(providedBuffer, expectedBuffer);
};

const requireCronSecret = (req, res, next) => {
  const authorization = req.get('authorization') || '';
  const provided = authorization.startsWith('Bearer ')
    ? authorization.slice('Bearer '.length)
    : '';

  if (!safeTokenEqual(provided, process.env.CRON_SECRET)) {
    return res.status(401).json({ error: 'Non autorizzato.' });
  }

  return next();
};

module.exports = { requireCronSecret, safeTokenEqual };
