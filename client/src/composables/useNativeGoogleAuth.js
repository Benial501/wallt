import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth.store';
import { isOnboardingComplete } from '@/utils/onboarding';
import { authenticateNativeGoogle } from '@/utils/nativeOAuth';
import api from '@/utils/axios';

export function useNativeGoogleAuth() {
  const router = useRouter();
  const authStore = useAuthStore();
  const loading = ref(false);
  const error = ref('');

  const signIn = async ({ useAiCategorization = false } = {}) => {
    loading.value = true;
    error.value = '';
    try {
      const data = await authenticateNativeGoogle({ apiClient: api, useAiCategorization });
      const user = await authStore.completeOAuthLogin(data.token, data.user);
      await router.replace(isOnboardingComplete(user?.profilo) ? '/dashboard' : '/onboarding');
      return user;
    } catch (err) {
      error.value = err.response?.data?.code || err.code || err.message || 'google';
      throw err;
    } finally {
      loading.value = false;
    }
  };

  return { signIn, loading, error };
}
