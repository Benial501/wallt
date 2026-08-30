const { getFrontendUrl } = require('./frontendUrl');

const getAllowedOrigins = () => {
  const fromEnv = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean)
    : [];
  const defaults = [
    'http://localhost:5173',
    'http://localhost:4173',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:4173',
  ];
  return [...new Set([...fromEnv, ...defaults])];
};

const isAllowedFrontendOrigin = (origin) => {
  const allowed = getAllowedOrigins();
  if (allowed.includes(origin)) return true;

  try {
    const url = new URL(origin);
    const isLocalHost = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
    if (!isLocalHost) return false;

    return allowed.some((candidate) => {
      try {
        const parsed = new URL(candidate);
        const candidateIsLocal = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
        return candidateIsLocal && parsed.port === url.port;
      } catch {
        return false;
      }
    });
  } catch {
    return false;
  }
};

const resolveOAuthTargetOrigin = (req) => {
  if (req.query.origin && isAllowedFrontendOrigin(req.query.origin)) {
    return req.query.origin;
  }

  if (req.query.state) {
    try {
      const parsed = JSON.parse(Buffer.from(req.query.state, 'base64url').toString('utf8'));
      if (parsed.origin && isAllowedFrontendOrigin(parsed.origin)) {
        return parsed.origin;
      }
    } catch {
      // ignore
    }
  }

  return getFrontendUrl();
};

const parseOAuthState = (state) => {
  if (!state) return {};
  try {
    return JSON.parse(Buffer.from(state, 'base64url').toString('utf8'));
  } catch {
    return {};
  }
};

const encodeOAuthState = (origin, extra = {}) => {
  if (!origin) return undefined;
  return Buffer.from(JSON.stringify({ origin, ...extra }), 'utf8').toString('base64url');
};

const encodePayloadForHash = (payload) => {
  const json = JSON.stringify(payload);
  return encodeURIComponent(Buffer.from(json, 'utf8').toString('base64'));
};

const buildOAuthRedirectHtml = (payload, targetOrigin = getFrontendUrl()) => {
  const encoded = encodePayloadForHash(payload);
  const relayUrl = `${targetOrigin}/oauth-relay.html#wallt=${encoded}`;

  return `<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="utf-8">
  <meta http-equiv="refresh" content="0;url=${relayUrl.replace(/&/g, '&amp;')}">
  <title>WALLT</title>
  <style>html,body{margin:0;padding:0;background:#0f1419}</style>
</head>
<body>
<script>
window.location.replace(${JSON.stringify(relayUrl)});
</script>
</body>
</html>`;
};

const sendOAuthPopupResponse = (res, payload, targetOrigin) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Cross-Origin-Opener-Policy', 'unsafe-none');
  res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'");
  res.status(200).send(buildOAuthRedirectHtml(payload, targetOrigin));
};

const sendOAuthSuccess = (res, { token, onboarding, user }, targetOrigin) => {
  sendOAuthPopupResponse(res, {
    type: 'AUTH_SUCCESS',
    token,
    onboarding,
    user,
  }, targetOrigin);
};

const sendOAuthError = (res, error = 'oauth_failed', targetOrigin) => {
  sendOAuthPopupResponse(res, {
    type: 'AUTH_ERROR',
    error,
  }, targetOrigin);
};

module.exports = {
  sendOAuthSuccess,
  sendOAuthError,
  resolveOAuthTargetOrigin,
  encodeOAuthState,
  parseOAuthState,
};
