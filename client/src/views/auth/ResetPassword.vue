<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth.store';
import api from '@/utils/axios';
import { Eye, EyeOff } from '@/utils/appIcons';

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();

const password = ref('');
const confirmPassword = ref('');
const showPassword = ref(false);
const localError = ref('');
const emailHint = ref('');
const tokenValid = ref(false);
const verifying = ref(true);

const resetToken = computed(() => String(route.query.token || ''));

const isPasswordValid = (value) => (
  value.length >= 8
  && /[A-Z]/.test(value)
  && /[0-9]/.test(value)
  && /[^A-Za-z0-9]/.test(value)
);

const verifyToken = async () => {
  verifying.value = true;
  localError.value = '';
  emailHint.value = '';
  tokenValid.value = false;

  if (!resetToken.value) {
    verifying.value = false;
    return;
  }

  try {
    const { data } = await api.post('/auth/reset-password/verify', {
      token: resetToken.value,
    });
    tokenValid.value = data.valid === true;
    emailHint.value = data.emailHint || '';
  } catch {
    localError.value = 'Link non valido o scaduto. Richiedi un nuovo reset password.';
  } finally {
    verifying.value = false;
  }
};

onMounted(async () => {
  authStore.logout();
  await verifyToken();
});

const handleSubmit = async () => {
  localError.value = '';

  if (!resetToken.value || !tokenValid.value) {
    localError.value = 'Link non valido o scaduto.';
    return;
  }

  if (!isPasswordValid(password.value)) {
    localError.value = 'La password deve avere almeno 8 caratteri, una maiuscola, un numero e un carattere speciale';
    return;
  }

  if (password.value !== confirmPassword.value) {
    localError.value = 'Le password non coincidono';
    return;
  }

  try {
    await authStore.resetPassword(resetToken.value, password.value);
    await router.push({ name: 'login', query: { reset: 'success' } });
  } catch {
    localError.value = authStore.error;
  }
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
      </div>

      <div class="wallt-card p-8">
        <h2 class="text-xl font-semibold text-[var(--text-primary)] mb-1">
          Reimposta password
        </h2>
        <p class="text-sm text-[var(--text-secondary)] mb-6">
          Scegli una nuova password per il tuo account.
        </p>

        <div
          v-if="verifying"
          class="mb-4 px-4 py-3 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border)] text-[var(--text-secondary)] text-sm"
        >
          Verifica del link in corso...
        </div>

        <div
          v-if="emailHint && tokenValid"
          class="mb-4 px-4 py-3 rounded-lg bg-[var(--accent-light)] border border-[var(--accent-green)]/20 text-sm text-[var(--text-secondary)]"
        >
          Stai reimpostando la password per <strong class="text-[var(--text-primary)]">{{ emailHint }}</strong>
        </div>

        <div
          v-if="!verifying && !resetToken"
          class="mb-4 px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm"
        >
          Link non valido o scaduto.
          <router-link
            to="/forgot-password"
            class="block mt-2 text-[var(--accent-green)] hover:underline"
          >
            Richiedi un nuovo link
          </router-link>
        </div>

        <div
          v-if="localError"
          class="mb-4 px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm"
        >
          {{ localError }}
          <router-link
            v-if="localError.includes('scaduto') || localError.includes('valido')"
            to="/forgot-password"
            class="block mt-2 text-[var(--accent-green)] hover:underline"
          >
            Richiedi un nuovo link
          </router-link>
        </div>

        <form
          v-if="tokenValid && !verifying"
          class="space-y-4"
          @submit.prevent="handleSubmit"
        >
          <div>
            <label class="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">
              Nuova password
            </label>
            <div class="relative">
              <input
                v-model="password"
                :type="showPassword ? 'text' : 'password'"
                placeholder="Min 8 caratteri, maiuscola, numero, speciale"
                class="wallt-input !pl-4 pr-12"
                autocomplete="new-password"
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

          <div>
            <label class="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">
              Conferma password
            </label>
            <input
              v-model="confirmPassword"
              :type="showPassword ? 'text' : 'password'"
              placeholder="Ripeti la password"
              class="wallt-input !pl-4"
              autocomplete="new-password"
            />
          </div>

          <button
            type="submit"
            class="wallt-btn-primary w-full"
            :disabled="authStore.loading"
          >
            {{ authStore.loading ? 'Salvataggio...' : 'Reimposta password' }}
          </button>
        </form>

        <p class="mt-5 text-center text-sm text-[var(--text-secondary)]">
          <router-link
            to="/login"
            class="text-[var(--accent-green)] font-medium hover:underline"
          >
            ← Torna al login
          </router-link>
        </p>
      </div>
    </div>
  </div>
</template>
