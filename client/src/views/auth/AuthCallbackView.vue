<script setup>
import { onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth.store';
import { isOnboardingComplete } from '@/utils/onboarding';

const router = useRouter();
const authStore = useAuthStore();

const decodePayload = () => {
  const raw = window.location.hash.match(/^#wallt=(.+)$/);
  if (!raw?.[1]) return null;

  try {
    const decoded = decodeURIComponent(raw[1]);
    return JSON.parse(atob(decoded));
  } catch {
    return null;
  }
};

const relayToOpener = (payload) => {
  if (!window.opener || window.opener.closed) return false;

  window.opener.postMessage(payload, window.location.origin);
  setTimeout(() => {
    window.close();
  }, 300);
  return true;
};

onMounted(async () => {
  const payload = decodePayload();

  if (!payload) {
    router.replace('/login');
    return;
  }

  // Popup OAuth: inoltra il token alla finestra principale (stessa origin → affidabile)
  if (relayToOpener(payload)) {
    return;
  }

  if (payload.type === 'AUTH_ERROR') {
    router.replace(`/login?error=${payload.error || 'google'}`);
    return;
  }

  if (payload.type !== 'AUTH_SUCCESS' || !payload.token) {
    router.replace('/login?error=google');
    return;
  }

  const user = await authStore.completeOAuthLogin(payload.token, payload.user ?? null);
  if (!user) {
    router.replace('/login?error=google');
    return;
  }

  router.replace(isOnboardingComplete(user.profilo) ? '/dashboard' : '/onboarding');
});
</script>

<template>
  <div class="auth-callback">
    <div class="spinner" />
    <p>Accesso in corso...</p>
  </div>
</template>

<style scoped>
.auth-callback {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  background: var(--bg-primary);
  color: var(--text-secondary);
}

.spinner {
  width: 40px;
  height: 40px;
  border: 3px solid var(--border);
  border-top-color: var(--accent-green);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
