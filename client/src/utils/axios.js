import axios from 'axios';
import { getActivePinia } from 'pinia';
import { performLogout } from '@/utils/session';
import { API_BASE_URL } from '@/config/api';

// L'import di un estratto conto inserisce i movimenti uno alla volta in
// transazione: qualche centinaio di righe su Supabase supera tranquillamente i
// 12s buoni per le altre chiamate. Il tetto e' allineato al maxDuration della
// funzione Vercel (60s), oltre il quale sarebbe il server a interrompersi.
export const IMPORT_TIMEOUT = 60000;

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 12000,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('wallt_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      const failedToken = error.config?.headers?.Authorization?.replace(/^Bearer\s+/i, '');
      const currentToken = localStorage.getItem('wallt_token');
      const staleRequest = failedToken && currentToken && failedToken !== currentToken;

      if (!staleRequest) {
        if (getActivePinia()) {
          performLogout(null);
        } else {
          localStorage.removeItem('wallt_token');
          localStorage.removeItem('wallt_user');
          if (window.location.pathname !== '/login' && window.location.pathname !== '/register') {
            window.location.href = '/login';
          }
        }
      }
    }
    return Promise.reject(error);
  }
);

export default api;
