const getFrontendUrl = () => {
  const origins = process.env.CORS_ORIGINS || 'http://localhost:5173';
  return origins.split(',')[0].trim().replace(/\/$/, '');
};

module.exports = {
  getFrontendUrl,
};
