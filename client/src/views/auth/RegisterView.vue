<script setup>
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth.store';
import { useOAuthPopup } from '@/composables/useOAuthPopup';

const router = useRouter();
const authStore = useAuthStore();
const { oauthLoading, openOAuthPopup } = useOAuthPopup();

const nome = ref('');
const email = ref('');
const password = ref('');
const confirmPassword = ref('');
const showPassword = ref(false);
const acceptPrivacy = ref(false);
const acceptTerms = ref(false);
const useAiCategorization = ref(false);
const localError = ref('');

const canRegister = computed(() => acceptPrivacy.value && acceptTerms.value);

const buildConsentPayload = () => {
  const now = new Date().toISOString();
  return {
    privacyAcceptedAt: acceptPrivacy.value ? now : null,
    termsAcceptedAt: acceptTerms.value ? now : null,
    useAiCategorization: useAiCategorization.value,
  };
};

const validateConsents = () => {
  if (!acceptPrivacy.value || !acceptTerms.value) {
    localError.value = 'Devi accettare la Privacy Policy e i Termini e Condizioni';
    return false;
  }
  return true;
};

const handleRegister = async () => {
  localError.value = '';

  if (!validateConsents()) return;

  if (!nome.value || !email.value || !password.value) {
    localError.value = 'Compila tutti i campi obbligatori';
    return;
  }

  if (password.value.length < 8) {
    localError.value = 'La password deve avere almeno 8 caratteri';
    return;
  }

  if (!/[A-Z]/.test(password.value) || !/[0-9]/.test(password.value) || !/[^A-Za-z0-9]/.test(password.value)) {
    localError.value = 'La password deve contenere almeno una maiuscola, un numero e un carattere speciale';
    return;
  }

  if (password.value !== confirmPassword.value) {
    localError.value = 'Le password non coincidono';
    return;
  }

  try {
    await authStore.register({
      nome: nome.value,
      email: email.value,
      password: password.value,
      ...buildConsentPayload(),
    });
    router.push('/onboarding');
  } catch {
    localError.value = authStore.error;
  }
};

const oauthErrorMessages = {
  google: 'Accesso con Google non riuscito. Riprova.',
  google_not_configured: 'Login Google non ancora configurato sul server.',
  google_account_exists_local: 'Esiste già un account con questa email registrato con password. Accedi con la password, oppure usa "Password dimenticata" per reimpostarla.',
  popup_blocked: 'Il browser ha bloccato il popup. Consenti i popup per questo sito e riprova.',
};

const handleOAuthError = (errorKey) => {
  localError.value = oauthErrorMessages[errorKey] || oauthErrorMessages.google;
};

const startGoogleLogin = () => {
  localError.value = '';

  if (!validateConsents()) return;

  openOAuthPopup('google', handleOAuthError, buildConsentPayload());
};
</script>

<template>
  <div class="flex flex-1 items-center justify-center px-4 py-6 bg-[var(--bg-primary)]">
    <div class="w-full max-w-md">
      <div class="text-center mb-8">
        <img src="/brand/wallt-app-icon-96.png" alt="WALLT" class="inline-block w-16 h-16 rounded-2xl mb-4" width="96" height="96">
        <h1 class="text-3xl font-bold tracking-tight text-[var(--text-primary)]">
          WALL<span class="text-[var(--accent-green)]">T</span>
        </h1>
        <p class="mt-2 text-sm text-[var(--text-secondary)]">
          Crea il tuo account gratuito
        </p>
      </div>

      <div class="wallt-card p-8">
        <h2 class="text-xl font-semibold text-[var(--text-primary)] mb-1">
          Registrati
        </h2>
        <p class="text-sm text-[var(--text-secondary)] mb-6">
          Inizia a gestire le tue finanze
        </p>

        <div
          v-if="localError"
          class="mb-4 px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm"
        >
          {{ localError }}
        </div>

        <form @submit.prevent="handleRegister" class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">
              Nome
            </label>
            <div class="relative">
              <span class="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]">
                <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </span>
              <input
                v-model="nome"
                type="text"
                placeholder="Il tuo nome"
                class="wallt-input"
                autocomplete="name"
              />
            </div>
          </div>

          <div>
            <label class="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">
              Email
            </label>
            <div class="relative">
              <span class="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]">
                <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </span>
              <input
                v-model="email"
                type="email"
                placeholder="nome@email.com"
                class="wallt-input"
                autocomplete="email"
              />
            </div>
          </div>

          <div>
            <label class="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">
              Password
            </label>
            <div class="relative">
              <span class="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]">
                <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </span>
              <input
                v-model="password"
                :type="showPassword ? 'text' : 'password'"
                placeholder="Min 8 caratteri, maiuscola, numero, speciale"
                class="wallt-input pr-12"
                autocomplete="new-password"
              />
              <button
                type="button"
                @click="showPassword = !showPassword"
                class="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
              >
                <svg v-if="!showPassword" xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
                <svg v-else xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                </svg>
              </button>
            </div>
          </div>

          <div>
            <label class="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">
              Conferma Password
            </label>
            <div class="relative">
              <span class="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]">
                <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </span>
              <input
                v-model="confirmPassword"
                :type="showPassword ? 'text' : 'password'"
                placeholder="Ripeti la password"
                class="wallt-input"
                autocomplete="new-password"
              />
            </div>
          </div>

          <fieldset class="consent-fieldset">
            <legend class="sr-only">Consensi GDPR</legend>

            <label class="consent-box">
              <input
                v-model="acceptPrivacy"
                type="checkbox"
                class="consent-checkbox"
                required
              />
              <span class="consent-text">
                Ho letto e accetto la
                <router-link
                  to="/privacy"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="text-[var(--accent-green)] hover:underline"
                  @click.stop
                >
                  Privacy Policy
                </router-link>
              </span>
            </label>

            <label class="consent-box">
              <input
                v-model="acceptTerms"
                type="checkbox"
                class="consent-checkbox"
                required
              />
              <span class="consent-text">
                Ho letto e accetto i
                <router-link
                  to="/termini"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="text-[var(--accent-green)] hover:underline"
                  @click.stop
                >
                  Termini e Condizioni
                </router-link>
              </span>
            </label>

            <label class="consent-box consent-optional">
              <input
                v-model="useAiCategorization"
                type="checkbox"
                class="consent-checkbox"
              />
              <span class="consent-text">
                Acconsento all'uso di intelligenza artificiale per la categorizzazione
                delle transazioni (OpenAI)
              </span>
            </label>
          </fieldset>

          <button
            type="submit"
            class="wallt-btn-primary mt-2"
            :disabled="authStore.loading || !canRegister"
          >
            {{ authStore.loading ? 'Registrazione in corso...' : 'Registrati' }}
          </button>
        </form>

        <div class="social-divider">
          <span>oppure</span>
        </div>

        <button
          type="button"
          class="btn-social btn-google"
          :disabled="oauthLoading || authStore.loading || !canRegister"
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

        <p class="mt-5 text-center text-sm text-[var(--text-secondary)]">
          Hai già un account?
          <router-link
            to="/login"
            class="text-[var(--accent-green)] font-medium hover:underline ml-1"
          >
            Accedi
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

.consent-fieldset {
  border: none;
  padding: 0;
  margin: 0.5rem 0 0;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.consent-box {
  display: flex;
  align-items: flex-start;
  gap: 0.625rem;
  cursor: pointer;
}

.consent-optional .consent-text {
  color: var(--text-muted);
}

.consent-checkbox {
  margin-top: 0.125rem;
  width: 1rem;
  height: 1rem;
  flex-shrink: 0;
  accent-color: var(--accent-green);
  cursor: pointer;
}

.consent-text {
  font-size: 0.8125rem;
  line-height: 1.5;
  color: var(--text-secondary);
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
</style>
