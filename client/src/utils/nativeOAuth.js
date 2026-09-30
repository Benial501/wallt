import { Capacitor } from '@capacitor/core';
import { WalltNative } from '@wallt/native';

const APPLE_SCRIPT_SRC = 'https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js';
let appleScriptPromise = null;

export const loadAppleSignInSDK = () => {
  if (typeof window === 'undefined') return Promise.reject(new Error('apple_not_available'));
  if (window.AppleID?.auth) return Promise.resolve(window.AppleID);
  if (appleScriptPromise) return appleScriptPromise;
  appleScriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = APPLE_SCRIPT_SRC;
    script.async = true;
    script.onload = () => window.AppleID?.auth
      ? resolve(window.AppleID)
      : reject(new Error('apple_not_available'));
    script.onerror = () => reject(new Error('apple_sdk_load_failed'));
    document.head.appendChild(script);
  }).catch((error) => {
    appleScriptPromise = null;
    throw error;
  });
  return appleScriptPromise;
};

const APP_ENV = import.meta.env || {};

export const createSecureOAuthState = (cryptoApi = globalThis.crypto) => {
  if (typeof cryptoApi?.randomUUID === 'function') return cryptoApi.randomUUID();
  if (typeof cryptoApi?.getRandomValues !== 'function') throw new Error('crypto_unavailable');
  const bytes = cryptoApi.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
};

const nativeGoogleOptions = () => ({
  iosClientId: APP_ENV.VITE_GOOGLE_IOS_CLIENT_ID,
  serverClientId: APP_ENV.VITE_GOOGLE_CLIENT_ID,
});

export const isNativeIOS = () => Capacitor.getPlatform() === 'ios';

export const requestAppleCredential = async ({
  nonce,
  platform,
  plugin = WalltNative,
  appleId,
  redirectUri,
  appleJs = typeof window !== 'undefined' ? window.AppleID : null,
}) => {
  if (platform === 'ios') {
    const result = await plugin.signInApple({ nonce });
    return {
      credential: result.credential,
      authorizationCode: result.authorizationCode,
      name: result.name,
    };
  }

  if (!appleId || !redirectUri) throw new Error('apple_not_configured');
  const webApple = appleJs?.auth ? appleJs : await loadAppleSignInSDK();
  webApple.auth.init({
    clientId: appleId,
    scope: 'name email',
    redirectURI: redirectUri,
    usePopup: true,
  });
  const state = createSecureOAuthState();
  const result = await webApple.auth.signIn({ state, nonce });
  const authorization = result?.authorization;
  if (authorization?.state !== state) throw new Error('apple_state_invalid');
  if (!authorization?.id_token || !authorization?.code) throw new Error('apple_credential_missing');
  return {
    credential: authorization.id_token,
    authorizationCode: authorization.code,
    name: result.user?.name || null,
  };
};

export const authenticateNativeGoogle = async ({
  apiClient,
  plugin = WalltNative,
  iosClientId = nativeGoogleOptions().iosClientId,
  serverClientId = nativeGoogleOptions().serverClientId,
  useAiCategorization = false,
} = {}) => {
  const { data: challengeData } = await apiClient.post('/auth/google/native/challenge');
  const { credential } = await plugin.signInGoogle({
    nonce: challengeData.nonce,
    iosClientId,
    serverClientId,
  });
  const { data } = await apiClient.post('/auth/google/native/verify', {
    credential,
    challenge: challengeData.challenge,
    use_ai_categorization: useAiCategorization,
  });
  return data;
};

export const authenticateApple = async ({
  apiClient,
  plugin = WalltNative,
  platform = isNativeIOS() ? 'ios' : 'web',
  appleId = APP_ENV.VITE_APPLE_SERVICE_ID,
  redirectUri = APP_ENV.VITE_APPLE_REDIRECT_URI,
  appleJs,
  privacyAcceptedAt,
  termsAcceptedAt,
  useAiCategorization = false,
  challengePath = '/auth/apple/challenge',
  verifyPath = '/auth/apple/verify',
  challengeData: preparedChallenge = null,
} = {}) => {
  const challengeData = preparedChallenge || (await apiClient.post(challengePath, { platform })).data;
  const credentials = await requestAppleCredential({
    nonce: challengeData.nonce,
    platform,
    plugin,
    appleId,
    redirectUri,
    appleJs,
  });
  const { data } = await apiClient.post(verifyPath, {
    platform,
    credential: credentials.credential,
    authorization_code: credentials.authorizationCode,
    challenge: challengeData.challenge,
    name: credentials.name,
    ...(privacyAcceptedAt ? { privacy_accepted_at: privacyAcceptedAt } : {}),
    ...(termsAcceptedAt ? { terms_accepted_at: termsAcceptedAt } : {}),
    use_ai_categorization: useAiCategorization,
  });
  return data;
};

export const authenticateAppleStepUp = async (options = {}) => authenticateApple({
  ...options,
  challengePath: '/auth/apple/step-up/challenge',
  verifyPath: '/auth/apple/step-up/verify',
}).then((data) => data.step_up_token);

export const authenticateGoogleStepUpNative = async ({
  apiClient,
  plugin = WalltNative,
  iosClientId = nativeGoogleOptions().iosClientId,
  serverClientId = nativeGoogleOptions().serverClientId,
} = {}) => {
  const { data: challengeData } = await apiClient.post('/auth/google/challenge', { platform: 'ios' });
  const { credential } = await plugin.signInGoogle({
    nonce: challengeData.nonce,
    iosClientId,
    serverClientId,
  });
  const { data } = await apiClient.post('/auth/verify-google', {
    platform: 'ios',
    credential,
    challenge: challengeData.challenge,
  });
  return data.step_up_token;
};
