import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Execute the real composable with browser/framework boundaries supplied by the harness.
const source = fs.readFileSync(new URL('../src/composables/useOAuthPopup.js', import.meta.url), 'utf8')
  .replace(/^import .*;\n/gm, '')
  .replace('export function useOAuthPopup', 'function useOAuthPopup');

function harness({ blocked = false, login = async () => ({ profilo: { onboarding_completato: true } }), navigate = async () => {} } = {}) {
  const listeners = new Map();
  const intervals = new Map();
  const timeouts = new Map();
  const errors = [];
  const destinations = [];
  const popup = { closed: false, close() { this.closed = true; } };
  let id = 0;
  const context = {
    window: {
      location: { origin: 'https://www.wallt.it' }, screenX: 0, screenY: 0, outerWidth: 1200, outerHeight: 900,
      open: () => blocked ? null : popup,
      addEventListener: (name, fn) => listeners.set(name, fn),
      removeEventListener: (name) => listeners.delete(name),
    },
    localStorage: { getItem: () => null, removeItem() {} },
    URLSearchParams, Date, JSON,
    ref: (value) => ({ value }), onUnmounted() {},
    useRouter: () => ({ replace: async (path) => { await navigate(path); destinations.push(path); } }),
    useAuthStore: () => ({ completeOAuthLogin: login }),
    isOnboardingComplete: (profile) => profile?.onboarding_completato === true,
    API_BASE_URL: 'https://wallt-api.vercel.app/api',
    setInterval: (fn) => { intervals.set(++id, fn); return id; },
    clearInterval: (key) => intervals.delete(key),
    setTimeout: (fn) => { timeouts.set(++id, fn); return id; },
    clearTimeout: (key) => timeouts.delete(key),
  };
  vm.createContext(context);
  vm.runInContext(`${source}\nthis.api = useOAuthPopup();`, context);
  const api = context.api;
  const start = () => api.openOAuthPopup('google', (error) => errors.push(error));
  const message = async (data, origin = 'https://www.wallt.it') => {
    listeners.get('message')?.({ origin, data });
    await new Promise((resolve) => setImmediate(resolve));
  };
  return { api, start, message, errors, destinations, popup, intervals, timeouts, listeners };
}

test('blocked popup reports its error and stops loading', () => {
  const h = harness({ blocked: true }); h.start();
  assert.deepEqual(h.errors, ['popup_blocked']);
  assert.equal(h.api.oauthLoading.value, false);
  assert.equal(h.listeners.size, 0);
  assert.equal(h.intervals.size, 0);
});

test('provider errors remain visible after popup cleanup', async () => {
  const h = harness(); h.start();
  await h.message({ type: 'AUTH_ERROR', error: 'google_account_exists_local' });
  assert.deepEqual(h.errors, ['google_account_exists_local']);
  assert.equal(h.api.oauthLoading.value, false);
  assert.equal(h.popup.closed, true);
});

for (const [label, options, payload] of [
  ['missing token', {}, { type: 'AUTH_SUCCESS' }],
  ['missing user', { login: async () => null }, { type: 'AUTH_SUCCESS', token: 'test-token' }],
  ['login failure', { login: async () => { throw new Error('login failed'); } }, { type: 'AUTH_SUCCESS', token: 'test-token' }],
  ['navigation failure', { navigate: async () => { throw new Error('navigation failed'); } }, { type: 'AUTH_SUCCESS', token: 'test-token' }],
]) {
  test(`${label} reports an error and ends loading`, async () => {
    const h = harness(options); h.start(); await h.message(payload);
    assert.deepEqual(h.errors, ['google']);
    assert.equal(h.api.oauthLoading.value, false);
  });
}

test('closed popup reports failure after the result grace period', () => {
  const h = harness(); h.start(); h.popup.closed = true;
  for (const fn of [...h.intervals.values()]) fn();
  for (const fn of [...h.timeouts.values()]) fn();
  assert.deepEqual(h.errors, ['google']);
  assert.equal(h.api.oauthLoading.value, false);
});

for (const completed of [true, false]) {
  test(`successful login routes to ${completed ? 'dashboard' : 'onboarding'}`, async () => {
    const h = harness({ login: async () => ({ profilo: { onboarding_completato: completed } }) });
    h.start(); await h.message({ type: 'AUTH_SUCCESS', token: 'test-token' });
    assert.deepEqual(h.destinations, [completed ? '/dashboard' : '/onboarding']);
    assert.deepEqual(h.errors, []);
    assert.equal(h.api.oauthLoading.value, false);
  });
}

test('a message from another domain is ignored', async () => {
  const h = harness(); h.start();
  await h.message({ type: 'AUTH_SUCCESS', token: 'test-token' }, 'https://untrusted.example');
  assert.deepEqual(h.destinations, []);
  assert.equal(h.api.oauthLoading.value, true);
  h.api.cleanup();
});
