<script setup>
import { ref } from 'vue';
import { useAuthStore } from '@/stores/auth.store';

const authStore = useAuthStore();

const email = ref('');
const localError = ref('');
const successMessage = ref('');
const infoMessage = ref('');
const submitted = ref(false);

const handleSubmit = async () => {
  localError.value = '';
  successMessage.value = '';
  infoMessage.value = '';

  if (!email.value) {
    localError.value = 'Inserisci la tua email';
    return;
  }

  try {
    const data = await authStore.requestPasswordReset(email.value);
    successMessage.value = data.message;

    if (data.code === 'oauth_account') {
      infoMessage.value = data.message;
      successMessage.value = '';
    }

    submitted.value = true;
  } catch {
    localError.value = authStore.error;
  }
};
</script>

<template>
  <div class="flex flex-1 items-center justify-center px-4 py-6">
    <div class="w-full max-w-md">
      <div class="text-center mb-8">
        <img src="/brand/wallt-app-icon-96.png" alt="WALLT" class="inline-block w-16 h-16 rounded-2xl mb-4" width="96" height="96">
        <h1 class="text-3xl font-bold tracking-tight text-[var(--text-primary)]">
          WALL<span class="text-[var(--accent-green)]">T</span>
        </h1>
      </div>

      <div class="wallt-card p-8">
        <h2 class="text-xl font-semibold text-[var(--text-primary)] mb-1">
          Password dimenticata
        </h2>
        <p class="text-sm text-[var(--text-secondary)] mb-6">
          Inserisci l'email del tuo account. Ti invieremo un link per reimpostare la password.
        </p>

        <div
          v-if="localError"
          class="mb-4 px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm"
        >
          {{ localError }}
        </div>

        <div
          v-if="successMessage"
          class="mb-4 px-4 py-3 rounded-lg bg-[var(--accent-light)] border border-[var(--accent-green)]/20 text-[var(--text-secondary)] text-sm"
        >
          {{ successMessage }}
        </div>

        <div
          v-if="infoMessage"
          class="mb-4 px-4 py-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-100 text-sm"
        >
          {{ infoMessage }}
        </div>

        <form
          v-if="!submitted"
          class="space-y-4"
          @submit.prevent="handleSubmit"
        >
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

          <button
            type="submit"
            class="wallt-btn-primary w-full"
            :disabled="authStore.loading"
          >
            {{ authStore.loading ? 'Invio in corso...' : 'Invia link di reset' }}
          </button>
        </form>

        <p
          v-if="submitted && successMessage"
          class="mb-4 text-xs text-[var(--text-muted)] space-y-2"
        >
          <span class="block">Controlla anche la cartella spam se non trovi l'email entro qualche minuto.</span>
          <span class="block text-amber-200/90">
            Se non arriva nulla: devi esserti registrato con <strong>email e password</strong> (non solo Google),
            usando esattamente lo stesso indirizzo. Se non hai un account, <router-link to="/register" class="text-[var(--accent-green)] hover:underline">registrati prima</router-link>.
          </span>
        </p>

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
