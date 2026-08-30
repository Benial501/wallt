import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import api from '@/utils/axios';
import { performLogout } from '@/utils/session';
import { isOnboardingComplete } from '@/utils/onboarding';
import { canShowScommesse, canShowInvestimenti, canAccessScommesse, canAccessInvestimenti } from '@/utils/featureAccess';

const toBool = (value, defaultValue = true) => {
  if (value === undefined || value === null) return defaultValue;
  if (value === false || value === 0 || value === '0') return false;
  return true;
};

const normalizeUser = (raw) => {
  if (!raw) return null;
  const profilo = raw.profilo
    ? {
      ...raw.profilo,
      onboarding_completato: isOnboardingComplete(raw.profilo),
    }
    : null;

  return {
    ...raw,
    profilo,
    mostra_scommesse: toBool(raw.mostra_scommesse, true),
    mostra_investimenti: toBool(raw.mostra_investimenti, true),
    reminder: toBool(raw.reminder, true),
    use_ai_categorization: toBool(raw.use_ai_categorization, false),
  };
};

const readStoredUser = () => {
  try {
    const saved = localStorage.getItem('wallt_user');
    if (!saved) return null;
    return normalizeUser(JSON.parse(saved));
  } catch {
    localStorage.removeItem('wallt_user');
    return null;
  }
};

export const useAuthStore = defineStore('auth', () => {
  const user = ref(readStoredUser());
  const token = ref(localStorage.getItem('wallt_token') || null);
  const loading = ref(false);
  const error = ref(null);

  const isAuthenticated = computed(() => !!token.value && !!user.value);

  const mostraScommesse = computed(() => canShowScommesse(user.value));
  const mostraInvestimenti = computed(() => canShowInvestimenti(user.value));
  const canAccessScommesseFeature = computed(() => canAccessScommesse(user.value));
  const canAccessInvestimentiFeature = computed(() => canAccessInvestimenti(user.value));

  const persistUser = (data) => {
    const normalized = normalizeUser(data);
    user.value = normalized;
    if (normalized) {
      localStorage.setItem('wallt_user', JSON.stringify(normalized));
    }
    return normalized;
  };

  const setSession = (newToken, newUser) => {
    fetchMePromise = null;
    token.value = newToken;
    localStorage.setItem('wallt_token', newToken);
    persistUser(newUser);
  };

  const clearSession = () => {
    token.value = null;
    user.value = null;
    localStorage.removeItem('wallt_token');
    localStorage.removeItem('wallt_user');
  };

  const init = async () => {
    user.value = readStoredUser();
    if (token.value) {
      await fetchMe();
    }
  };

  const login = async (email, password) => {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.post('/auth/login', { email, password });
      setSession(data.token, data.user);
      return data;
    } catch (err) {
      error.value = err.response?.data?.message || err.response?.data?.error || 'Errore durante il login';
      throw err;
    } finally {
      loading.value = false;
    }
  };

  const requestPasswordReset = async (email) => {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.post('/auth/forgot-password', { email });
      return data;
    } catch (err) {
      error.value = err.response?.data?.error
        || err.response?.data?.message
        || 'Errore durante la richiesta di reset';
      throw err;
    } finally {
      loading.value = false;
    }
  };

  const resetPassword = async (tokenValue, newPassword) => {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.post('/auth/reset-password', {
        token: tokenValue,
        newPassword,
      });
      clearSession();
      return data.message;
    } catch (err) {
      const dettagli = err.response?.data?.dettagli;
      if (Array.isArray(dettagli) && dettagli.length > 0) {
        error.value = dettagli.map((d) => d.messaggio).join('. ');
      } else {
        error.value = err.response?.data?.message
          || err.response?.data?.error
          || 'Link non valido o scaduto. Richiedi un nuovo reset password.';
      }
      throw err;
    } finally {
      loading.value = false;
    }
  };

  const register = async ({
    nome,
    email,
    password,
    privacyAcceptedAt,
    termsAcceptedAt,
    useAiCategorization = false,
  }) => {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.post('/auth/register', {
        nome,
        email,
        password,
        privacy_accepted_at: privacyAcceptedAt,
        terms_accepted_at: termsAcceptedAt,
        use_ai_categorization: useAiCategorization,
      });
      setSession(data.token, data.user);
      return data;
    } catch (err) {
      const dettagli = err.response?.data?.dettagli;
      if (Array.isArray(dettagli) && dettagli.length > 0) {
        error.value = dettagli.map((d) => d.messaggio).join('. ');
      } else {
        error.value = err.response?.data?.message || err.response?.data?.error || 'Errore durante la registrazione';
      }
      throw err;
    } finally {
      loading.value = false;
    }
  };

  let fetchMePromise = null;

  const fetchMe = async () => {
    if (!token.value) return null;

    const tokenAtStart = token.value;

    if (fetchMePromise) {
      return fetchMePromise;
    }

    fetchMePromise = (async () => {
      try {
        const { data } = await api.get('/auth/me');
        if (token.value !== tokenAtStart) {
          return user.value;
        }
        return persistUser(data.user);
      } catch (err) {
        if (token.value === tokenAtStart && err.response?.status === 401) {
          clearSession();
        }
        return user.value ?? null;
      } finally {
        fetchMePromise = null;
      }
    })();

    return fetchMePromise;
  };

  const logout = () => {
    clearSession();
  };

  const logoutAndReset = async (router) => {
    await performLogout(router);
  };

  const updateUser = (partial) => {
    if (!user.value) return;
    persistUser({ ...user.value, ...partial });
  };

  const updatePreferenze = async (dati) => {
    const { data } = await api.put('/impostazioni/preferenze', dati);
    return persistUser(data.user);
  };

  const completeOAuthLogin = async (newToken, userData = null) => {
    fetchMePromise = null;
    token.value = newToken;
    localStorage.setItem('wallt_token', newToken);
    if (userData) {
      return persistUser(userData);
    }
    return fetchMe();
  };

  return {
    user,
    token,
    loading,
    error,
    isAuthenticated,
    mostraScommesse,
    mostraInvestimenti,
    canAccessScommesseFeature,
    canAccessInvestimentiFeature,
    init,
    login,
    register,
    requestPasswordReset,
    resetPassword,
    fetchMe,
    completeOAuthLogin,
    logout,
    logoutAndReset,
    updateUser,
    updatePreferenze,
  };
});
