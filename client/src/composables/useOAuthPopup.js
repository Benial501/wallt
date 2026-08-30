import { onUnmounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth.store';
import { isOnboardingComplete } from '@/utils/onboarding';
import { API_BASE_URL } from '@/config/api';

const FRONTEND_ORIGIN = window.location.origin;
const OAUTH_STORAGE_KEY = 'wallt_oauth_result';

const POPUP_FEATURES = 'width=480,height=640,scrollbars=yes';

export function useOAuthPopup() {
  const router = useRouter();
  const authStore = useAuthStore();
  const oauthLoading = ref(false);

  let popup = null;
  let messageHandler = null;
  let storageHandler = null;
  let pollInterval = null;
  let popupCheckInterval = null;
  let popupClosedGraceTimer = null;
  let oauthCompleted = false;
  let errorHandler = null;

  const closePopupWindow = () => {
    if (popup && !popup.closed) {
      try {
        popup.close();
      } catch {
        // ignore
      }
    }
  };

  const stopListeners = () => {
    if (messageHandler) {
      window.removeEventListener('message', messageHandler);
      messageHandler = null;
    }
    if (storageHandler) {
      window.removeEventListener('storage', storageHandler);
      storageHandler = null;
    }
    if (pollInterval) {
      clearInterval(pollInterval);
      pollInterval = null;
    }
    if (popupCheckInterval) {
      clearInterval(popupCheckInterval);
      popupCheckInterval = null;
    }
    if (popupClosedGraceTimer) {
      clearTimeout(popupClosedGraceTimer);
      popupClosedGraceTimer = null;
    }
  };

  const cleanup = () => {
    closePopupWindow();
    stopListeners();
    popup = null;
    errorHandler = null;
    oauthLoading.value = false;
  };

  const reportError = (key = 'google') => {
    errorHandler?.(key);
  };

  const readStorageFallback = () => {
    try {
      const raw = localStorage.getItem(OAUTH_STORAGE_KEY);
      if (!raw) return null;

      const payload = JSON.parse(raw);
      if (!payload?.at || Date.now() - payload.at > 120000) {
        localStorage.removeItem(OAUTH_STORAGE_KEY);
        return null;
      }
      return {
        type: payload.type,
        token: payload.token,
        onboarding: payload.onboarding,
        user: payload.user,
        error: payload.error,
      };
    } catch {
      localStorage.removeItem(OAUTH_STORAGE_KEY);
      return null;
    }
  };

  const consumeStorageFallback = () => {
    const payload = readStorageFallback();
    if (payload) {
      localStorage.removeItem(OAUTH_STORAGE_KEY);
    }
    return payload;
  };

  const finishOAuth = async (payload) => {
    if (oauthCompleted || !payload) return;
    oauthCompleted = true;
    closePopupWindow();
    stopListeners();

    if (payload.type === 'AUTH_ERROR') {
      cleanup();
      reportError(payload.error || 'google');
      return;
    }

    if (payload.type !== 'AUTH_SUCCESS' || !payload.token) {
      cleanup();
      reportError('google');
      return;
    }

    try {
      const user = await authStore.completeOAuthLogin(payload.token, payload.user ?? null);
      cleanup();

      if (!user) {
        reportError('google');
        return;
      }

      const destination = isOnboardingComplete(user.profilo) ? '/dashboard' : '/onboarding';
      await router.replace(destination);
    } catch {
      cleanup();
      reportError('google');
    }
  };

  const tryConsumeOAuthResult = () => {
    if (oauthCompleted) return;
    const payload = consumeStorageFallback();
    if (payload) {
      finishOAuth(payload);
    }
  };

  const handleOAuthMessage = (event) => {
    if (event.origin !== FRONTEND_ORIGIN) return;

    const { data } = event;
    if (!data || typeof data !== 'object') return;
    if (data.type !== 'AUTH_SUCCESS' && data.type !== 'AUTH_ERROR') return;

    localStorage.removeItem(OAUTH_STORAGE_KEY);
    finishOAuth(data);
  };

  const handleStorageEvent = (event) => {
    if (event.key !== OAUTH_STORAGE_KEY) return;
    tryConsumeOAuthResult();
  };

  const openOAuthPopup = (provider = 'google', onError, options = {}) => {
    cleanup();
    oauthCompleted = false;
    oauthLoading.value = true;
    errorHandler = onError;

    try {
      localStorage.removeItem(OAUTH_STORAGE_KEY);
    } catch {
      // ignore
    }

    messageHandler = handleOAuthMessage;
    storageHandler = handleStorageEvent;
    window.addEventListener('message', messageHandler);
    window.addEventListener('storage', storageHandler);

    pollInterval = setInterval(tryConsumeOAuthResult, 150);

    const left = window.screenX + Math.max(0, (window.outerWidth - 480) / 2);
    const top = window.screenY + Math.max(0, (window.outerHeight - 640) / 2);
    const features = `${POPUP_FEATURES},left=${left},top=${top}`;

    const params = new URLSearchParams({
      origin: window.location.origin,
    });
    if (options.privacyAcceptedAt) {
      params.set('privacy_accepted_at', options.privacyAcceptedAt);
    }
    if (options.termsAcceptedAt) {
      params.set('terms_accepted_at', options.termsAcceptedAt);
    }
    if (options.useAiCategorization) {
      params.set('use_ai_categorization', '1');
    }

    popup = window.open(
      `${API_BASE_URL}/auth/${provider}?${params.toString()}`,
      'wallt-oauth',
      features,
    );

    if (!popup) {
      cleanup();
      reportError('popup_blocked');
      return;
    }

    popupCheckInterval = setInterval(() => {
      if (popup?.closed) {
        clearInterval(popupCheckInterval);
        popupCheckInterval = null;

        tryConsumeOAuthResult();

        popupClosedGraceTimer = setTimeout(() => {
          tryConsumeOAuthResult();
          if (!oauthCompleted) {
            cleanup();
            reportError('google');
          }
        }, 3500);
      }
    }, 200);
  };

  onUnmounted(cleanup);

  return {
    oauthLoading,
    openOAuthPopup,
    cleanup,
  };
}
