<script setup>
import { ref, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth.store';
import { useOAuthPopup } from '@/composables/useOAuthPopup';
import { Eye, EyeOff } from '@/utils/appIcons';
import { isOnboardingComplete } from '@/utils/onboarding';

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const { oauthLoading, openOAuthPopup } = useOAuthPopup();

const email = ref('');
const password = ref('');
const showPassword = ref(false);
const localError = ref('');
const successMessage = ref('');

const errorMessages = {
  google: 'Accesso con Google non riuscito. Riprova.',
  google_not_configured: 'Login Google non ancora configurato sul server. Aggiungi GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET in server/.env',
  google_account_exists_local: 'Esiste già un account con questa email registrato con password. Accedi con la password, oppure usa "Password dimenticata" per reimpostarla.',
  popup_blocked: 'Il browser ha bloccato il popup. Consenti i popup per questo sito e riprova.',
};

onMounted(() => {
  const errorKey = route.query.error;
  if (errorKey && errorMessages[errorKey]) {
    localError.value = errorMessages[errorKey];
  }
  if (route.query.reset === 'success') {
    localError.value = '';
    successMessage.value = 'Password aggiornata. Ora puoi accedere con la nuova password.';
  }
});

const handleLogin = async () => {
  localError.value = '';
  if (!email.value || !password.value) {
    localError.value = 'Inserisci email e password';
    return;
  }

  try {
    const data = await authStore.login(email.value, password.value);
    router.push(isOnboardingComplete(data.user?.profilo) ? '/dashboard' : '/onboarding');
  } catch {
    localError.value = authStore.error;
  }
};

const handleOAuthError = (errorKey) => {
  localError.value = errorMessages[errorKey] || errorMessages.google;
};

const startGoogleLogin = () => {
  localError.value = '';
  openOAuthPopup('google', handleOAuthError);
};
</script>

<template>
  <div class="flex flex-1 items-center justify-center px-4 py-6 bg-[var(--bg-primary)]">
    <div
      v-if="oauthLoading"
      class="oauth-overlay"
      aria-live="polite"
    >
      <div class="oauth-overlay-card">
        <div class="oauth-spinner" />
        <p>Accesso con Google in corso...</p>
      </div>
    </div>

    <div class="w-full max-w-md">
      <div class="text-center mb-6">
        <img src="/brand/wallt-app-icon-96.png" alt="WALLT" class="inline-block w-14 h-14 rounded-2xl mb-3" width="96" height="96">
        <h1 class="text-3xl font-bold tracking-tight text-[var(--text-primary)]">
          WALL<span class="text-[var(--accent-green)]">T</span>
        </h1>
        <p class="mt-1 text-sm text-[var(--text-secondary)]">
          Il tuo portafoglio intelligente
        </p>
      </div>

      <div class="wallt-card p-6">
        <h2 class="text-xl font-semibold text-[var(--text-primary)] mb-1">
          Bentornato
        </h2>
        <p class="text-sm text-[var(--text-secondary)] mb-5">
          Accedi al tuo account
        </p>

        <div
          v-if="successMessage"
          class="mb-4 px-4 py-3 rounded-lg bg-[var(--accent-light)] border border-[var(--accent-green)]/20 text-[var(--text-secondary)] text-sm"
        >
          {{ successMessage }}
        </div>

        <div
          v-if="localError"
          class="mb-4 px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm"
        >
          {{ localError }}
        </div>

        <button
          type="button"
          class="btn-social btn-google"
          :disabled="oauthLoading || authStore.loading"
          @click="startGoogleLogin"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          {{ oauthLoading ? 'Accesso Google...' : 'Continua con Google' }}
        </button>

        <div class="social-divider">
          <span>oppure con email</span>
        </div>

        <form @submit.prevent="handleLogin" class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">
              Email
            </label>
            <input
              v-model="email"
              type="email"
              placeholder="nome@email.com"
              class="wallt-input !pl-4"
              autocomplete="email"
            />
          </div>

          <div>
            <div class="flex items-center justify-between mb-1.5">
              <label class="block text-sm font-medium text-[var(--text-secondary)]">
                Password
              </label>
              <router-link
                to="/forgot-password"
                class="text-xs text-[var(--accent-green)] hover:underline"
              >
                Password dimenticata?
              </router-link>
            </div>
            <div class="relative">
              <input
                v-model="password"
                :type="showPassword ? 'text' : 'password'"
                placeholder="••••••••"
                class="wallt-input !pl-4 pr-12"
                autocomplete="current-password"
              />
              <button
                type="button"
                class="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
                @click="showPassword = !showPassword"
              >
                <component :is="showPassword ? EyeOff : Eye" :size="18" :stroke-width="1.75" />
              </button>
            </div>
          </div>

          <button
            type="submit"
            class="wallt-btn-primary mt-2"
            :disabled="authStore.loading"
          >
            {{ authStore.loading ? 'Accesso in corso...' : 'Accedi' }}
          </button>
        </form>

        <p class="mt-5 text-center text-sm text-[var(--text-secondary)]">
          Non hai un account?
          <router-link to="/register" class="text-[var(--accent-green)] font-medium hover:underline ml-1">
            Registrati
          </router-link>
        </p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.social-divider {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin: 1.25rem 0;
  color: var(--text-muted);
  font-size: 0.8125rem;
}

.social-divider::before,
.social-divider::after {
  content: '';
  flex: 1;
  height: 1px;
  background: var(--border);
}

.btn-social {
  border-radius: var(--radius-md);
  padding: 12px 24px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  text-decoration: none;
  transition: opacity 0.2s;
  cursor: pointer;
}

.btn-social:hover:not(:disabled) {
  opacity: 0.9;
}

.btn-social:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-google {
  background: #FFFFFF;
  color: #1F1F1F;
  border: 1px solid var(--border);
}

.oauth-overlay {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(15, 20, 25, 0.72);
  backdrop-filter: blur(4px);
}

.oauth-overlay-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
  padding: 1.5rem 2rem;
  border-radius: var(--radius-lg);
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  color: var(--text-secondary);
  font-size: 0.875rem;
}

.oauth-spinner {
  width: 28px;
  height: 28px;
  border: 2px solid var(--border);
  border-top-color: var(--accent-green);
  border-radius: 50%;
  animation: oauth-spin 0.7s linear infinite;
}

@keyframes oauth-spin {
  to { transform: rotate(360deg); }
}
</style>
