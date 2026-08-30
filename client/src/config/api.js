import { normalizeApiUrl } from './normalizeApiUrl';

export const API_BASE_URL = normalizeApiUrl(import.meta.env.VITE_API_URL, {
  isProduction: import.meta.env.PROD,
});
