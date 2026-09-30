import { onUnmounted, ref } from 'vue';
import { authenticateAppleStepUp, isNativeIOS, loadAppleSignInSDK } from '@/utils/nativeOAuth';
import api from '@/utils/axios';

export function useAppleStepUp() {
  const verifying = ref(false);
  const error = ref('');
  let preparedChallenge = null;
  let refreshTimer = null;
  let pendingPreparation = null;

  const platform = () => (isNativeIOS() ? 'ios' : 'web');
  const prepareAppleStepUp = async () => {
    if (pendingPreparation) return pendingPreparation;
    pendingPreparation = (async () => {
      if (!isNativeIOS()) await loadAppleSignInSDK();
      const { data } = await api.post('/auth/apple/step-up/challenge', { platform: platform() });
      return data;
    })()
      .then((data) => {
        preparedChallenge = { ...data, platform: platform(), createdAt: Date.now() };
        if (!refreshTimer) refreshTimer = setInterval(() => { prepareAppleStepUp().catch(() => {}); }, 105_000);
        return preparedChallenge;
      })
      .finally(() => { pendingPreparation = null; });
    return pendingPreparation;
  };

  const verifyAppleIdentity = async () => {
    verifying.value = true;
    error.value = '';
    try {
      const challenge = preparedChallenge;
      const isFresh = challenge && challenge.platform === platform() && Date.now() - challenge.createdAt < 105_000;
      if (!isFresh) await prepareAppleStepUp();
      const token = await authenticateAppleStepUp({ apiClient: api, platform: platform(), challengeData: preparedChallenge });
      preparedChallenge = null;
      return token;
    } catch (err) {
      error.value = err.response?.data?.message || 'Verifica Apple non riuscita.';
      throw err;
    } finally {
      verifying.value = false;
    }
  };

  onUnmounted(() => {
    if (refreshTimer) clearInterval(refreshTimer);
  });

  return { verifyAppleIdentity, prepareAppleStepUp, verifying, error };
}
