import { onUnmounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth.store';
import { isOnboardingComplete } from '@/utils/onboarding';
import { authenticateApple, isNativeIOS, loadAppleSignInSDK } from '@/utils/nativeOAuth';
import api from '@/utils/axios';

export function useAppleAuth() {
  const router = useRouter();
  const authStore = useAuthStore();
  const loading = ref(false);
  const error = ref('');
  let preparedChallenge = null;
  let refreshTimer = null;
  let pendingPreparation = null;

  const platform = () => (isNativeIOS() ? 'ios' : 'web');
  const prepare = async () => {
    if (pendingPreparation) return pendingPreparation;
    pendingPreparation = (async () => {
      if (!isNativeIOS()) await loadAppleSignInSDK();
      const { data } = await api.post('/auth/apple/challenge', { platform: platform() });
      return data;
    })()
      .then((data) => {
        preparedChallenge = { ...data, platform: platform(), createdAt: Date.now() };
        if (!refreshTimer) refreshTimer = setInterval(() => { prepare().catch(() => {}); }, 105_000);
        return preparedChallenge;
      })
      .finally(() => { pendingPreparation = null; });
    return pendingPreparation;
  };

  const signIn = async (options = {}) => {
    loading.value = true;
    error.value = '';
    try {
      const challenge = preparedChallenge;
      const isFresh = challenge && challenge.platform === platform() && Date.now() - challenge.createdAt < 105_000;
      if (!isFresh) await prepare();
      const data = await authenticateApple({
        ...options,
        apiClient: api,
        platform: platform(),
        challengeData: preparedChallenge,
      });
      preparedChallenge = null;
      const user = await authStore.completeOAuthLogin(data.token, data.user);
      await router.replace(isOnboardingComplete(user?.profilo) ? '/dashboard' : '/onboarding');
      return user;
    } catch (err) {
      error.value = err.response?.data?.code || err.code || err.message || 'apple';
      throw err;
    } finally {
      loading.value = false;
    }
  };

  onUnmounted(() => {
    if (refreshTimer) clearInterval(refreshTimer);
  });

  return { signIn, prepare, loading, error };
}
