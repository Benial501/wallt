import axios from 'axios';
import { getActivePinia } from 'pinia';
import { performLogout } from '@/utils/session';
import { API_BASE_URL } from '@/config/api';

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
