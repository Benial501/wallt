import test from 'node:test';
import assert from 'node:assert/strict';
import {
  authenticateApple,
  authenticateAppleStepUp,
  authenticateNativeGoogle,
  authenticateGoogleStepUpNative,
  createSecureOAuthState,
} from '../src/utils/nativeOAuth.js';

const fakeApi = (responses = {}) => {
  const calls = [];
  return {
    calls,
    async post(path, payload) {
      calls.push({ path, payload });
      const data = responses[path];
      if (data instanceof Error) throw data;
      return { data: typeof data === 'function' ? data(payload) : (data || {}) };
    },
  };
};

test('Google nativo invia nonce, credenziale e challenge al backend', async () => {
  const api = fakeApi({
    '/auth/google/native/challenge': { nonce: 'nonce-google', challenge: 'challenge-google' },
    '/auth/google/native/verify': { token: 'jwt-wallt', onboarding: 'done', user: { id: 1 } },
  });
  const pluginCalls = [];
  const plugin = {
    async signInGoogle(options) {
      pluginCalls.push(options);
      return { credential: 'id-token-google' };
    },
  };

  const result = await authenticateNativeGoogle({
    apiClient: api,
    plugin,
    iosClientId: 'google-ios-client',
    serverClientId: 'google-server-client',
    useAiCategorization: true,
  });

  assert.equal(pluginCalls[0].nonce, 'nonce-google');
  assert.equal(pluginCalls[0].iosClientId, 'google-ios-client');
  assert.equal(api.calls[1].payload.credential, 'id-token-google');
  assert.equal(api.calls[1].payload.challenge, 'challenge-google');
  assert.equal(api.calls[1].payload.use_ai_categorization, true);
  assert.equal(result.token, 'jwt-wallt');
});

test('un annullamento Google non invia una richiesta di verifica al backend', async () => {
  const api = fakeApi({
    '/auth/google/native/challenge': { nonce: 'nonce-google', challenge: 'challenge-google' },
  });
  const plugin = { async signInGoogle() { throw new Error('AUTH_CANCELLED'); } };

  await assert.rejects(authenticateNativeGoogle({ apiClient: api, plugin }));
  assert.equal(api.calls.length, 1);
});

test('Apple nativo invia token, codice e consensi alla verifica backend', async () => {
  const api = fakeApi({
    '/auth/apple/challenge': { nonce: 'nonce-apple', challenge: 'challenge-apple' },
    '/auth/apple/verify': { token: 'jwt-wallt', onboarding: 'new', user: { id: 2 } },
  });
  const plugin = {
    async signInApple({ nonce }) {
      assert.equal(nonce, 'nonce-apple');
      return {
        credential: 'id-token-apple',
        authorizationCode: 'codice-autorizzazione-apple',
        name: 'Ada Rossi',
      };
    },
  };

  const result = await authenticateApple({
    apiClient: api,
    plugin,
    platform: 'ios',
    privacyAcceptedAt: '2026-09-30T12:00:00.000Z',
    termsAcceptedAt: '2026-09-30T12:00:00.000Z',
    useAiCategorization: true,
  });

  assert.equal(api.calls[1].path, '/auth/apple/verify');
  assert.equal(api.calls[1].payload.credential, 'id-token-apple');
  assert.equal(api.calls[1].payload.authorization_code, 'codice-autorizzazione-apple');
  assert.equal(api.calls[1].payload.challenge, 'challenge-apple');
  assert.equal(api.calls[1].payload.privacy_accepted_at, '2026-09-30T12:00:00.000Z');
  assert.equal(api.calls[1].payload.terms_accepted_at, '2026-09-30T12:00:00.000Z');
  assert.equal(api.calls[1].payload.use_ai_categorization, true);
  assert.equal(result.user.id, 2);
});

test('Apple web associa state e nonce e non apre il bridge nativo', async () => {
  const api = fakeApi({
    '/auth/apple/challenge': { nonce: 'nonce-web-apple', challenge: 'challenge-web-apple' },
    '/auth/apple/verify': { token: 'jwt-web', user: { id: 3 } },
  });
  const authCalls = [];
  const appleJs = {
    auth: {
      init(options) { authCalls.push({ method: 'init', options }); },
      async signIn(options) {
        authCalls.push({ method: 'signIn', options });
        return {
          authorization: {
            state: options.state,
            id_token: 'id-token-web',
            code: 'codice-web',
          },
          user: { name: { firstName: 'Ada', lastName: 'Rossi' } },
        };
      },
    },
  };
  const plugin = {
    async signInApple() {
      assert.fail('Il bridge iOS non deve essere chiamato dal web');
    },
  };

  await authenticateApple({
    apiClient: api,
    plugin,
    platform: 'web',
    appleId: 'it.wallt.services',
    redirectUri: 'https://wallt.example/auth/apple/callback',
    appleJs,
  });

  assert.equal(authCalls[0].options.clientId, 'it.wallt.services');
  assert.equal(authCalls[0].options.redirectURI, 'https://wallt.example/auth/apple/callback');
  assert.equal(authCalls[1].options.nonce, 'nonce-web-apple');
  assert.equal(api.calls[1].payload.credential, 'id-token-web');
  assert.equal(api.calls[1].payload.name.firstName, 'Ada');
});

test('Apple rifiuta uno state diverso e Apple JS rifiuta il login annullato', async () => {
  const api = fakeApi({ '/auth/apple/challenge': { nonce: 'nonce', challenge: 'challenge' } });
  const appleJs = {
    auth: {
      init() {},
      async signIn() {
        return { authorization: { state: 'state-di-un-altra-sessione', id_token: 'token', code: 'code' } };
      },
    },
  };

  await assert.rejects(authenticateApple({
    apiClient: api,
    platform: 'web',
    appleId: 'it.wallt.services',
    redirectUri: 'https://wallt.example/callback',
    appleJs,
  }), /apple_state_invalid/);
  assert.equal(api.calls.length, 1);
});

test('Apple e Google step-up usano endpoint distinti e restituiscono solo lo step-up token', async () => {
  const appleApi = fakeApi({
    '/auth/apple/step-up/challenge': { nonce: 'nonce-apple-step-up', challenge: 'challenge-apple-step-up' },
    '/auth/apple/step-up/verify': { step_up_token: 'apple-step-up-jwt' },
  });
  const applePlugin = {
    async signInApple() { return { credential: 'apple-token', authorizationCode: 'apple-code' }; },
  };
  const appleToken = await authenticateAppleStepUp({
    apiClient: appleApi,
    plugin: applePlugin,
    platform: 'ios',
  });
  assert.equal(appleToken, 'apple-step-up-jwt');
  assert.equal(appleApi.calls[0].path, '/auth/apple/step-up/challenge');
  assert.equal(appleApi.calls[1].path, '/auth/apple/step-up/verify');

  const googleApi = fakeApi({
    '/auth/google/challenge': { nonce: 'nonce-google-step-up', challenge: 'challenge-google-step-up' },
    '/auth/verify-google': { step_up_token: 'google-step-up-jwt' },
  });
  const googlePlugin = {
    async signInGoogle() { return { credential: 'google-token' }; },
  };
  const googleToken = await authenticateGoogleStepUpNative({
    apiClient: googleApi,
    plugin: googlePlugin,
    iosClientId: 'ios-id',
    serverClientId: 'server-id',
  });
  assert.equal(googleToken, 'google-step-up-jwt');
  assert.equal(googleApi.calls[1].payload.platform, 'ios');
});


test('lo state OAuth usa solo generazione crittografica e rifiuta browser senza crypto sicura', () => {
  assert.equal(createSecureOAuthState({ randomUUID: () => 'state-casuale-uuid' }), 'state-casuale-uuid');
  const state = createSecureOAuthState({
    getRandomValues(bytes) {
      bytes.fill(15);
      return bytes;
    },
  });
  assert.equal(state, '0f'.repeat(32));
  assert.throws(() => createSecureOAuthState(null), /crypto_unavailable/);
});
