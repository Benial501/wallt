const DEFAULT_API_URL = 'http://localhost:3000/api';
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

export const normalizeApiUrl = (rawValue, { isProduction = false } = {}) => {
  const value = String(rawValue || '').trim() || DEFAULT_API_URL;
  let parsed;

  try {
    parsed = new URL(value);
  } catch {
    throw new Error('VITE_API_URL non è un URL valido.');
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('VITE_API_URL deve usare HTTP o HTTPS.');
  }
  if (parsed.username || parsed.password) {
    throw new Error('VITE_API_URL non deve contenere credenziali.');
  }
  if (parsed.search || parsed.hash) {
    throw new Error('VITE_API_URL non deve contenere query string o frammenti.');
  }
  if (isProduction && parsed.protocol !== 'https:' && !LOCAL_HOSTS.has(parsed.hostname)) {
    throw new Error('VITE_API_URL deve usare HTTPS in produzione.');
  }

  const normalizedPath = parsed.pathname.replace(/\/+$/, '');
  return `${parsed.origin}${normalizedPath}`;
};

export { DEFAULT_API_URL };
