<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import WButton from '@/components/common/WButton.vue';
import { useAuthStore } from '@/stores/auth.store';
import { useToastStore } from '@/stores/toast.store';
import { SUPPORT_CATEGORIES, SUBJECT_MAX, MESSAGE_MAX } from '@/utils/supportCategories';
import api from '@/utils/axios';

/**
 * Contatto dal sito, senza login: serve a chi non riesce ad accedere al proprio
 * account e a chi scrive dalle pagine legali. Chi ha una sessione attiva usa
 * invece Aiuto → Contatta il supporto, dove l'identità è già verificata.
 */

const router = useRouter();
const auth = useAuthStore();
const toast = useToastStore();

const email = ref('');
const category = ref('');
const subject = ref('');
const message = ref('');
const sending = ref(false);
const sent = ref(false);
const error = ref('');

onMounted(() => {
  // Comodità per chi arriva già autenticato: l'indirizzo resta modificabile.
  if (auth.user?.email) email.value = auth.user.email;
});

const goBack = () => {
  if (window.history.length > 1) {
    router.back();
    return;
  }
  router.push(auth.isAuthenticated ? '/dashboard' : '/login');
};
const backLabel = computed(() => (auth.isAuthenticated ? 'Torna all\'app' : 'Torna al login'));

const submit = async () => {
  if (sending.value) return;
  error.value = '';
  const data = {
    email: email.value.trim(),
    category: category.value,
    subject: subject.value.trim(),
    message: message.value.trim(),
  };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email) || !SUPPORT_CATEGORIES.includes(data.category)
    || !data.subject || !data.message
    || data.subject.length > SUBJECT_MAX || data.message.length > MESSAGE_MAX
    || /[\x00-\x1f\x7f]/.test(data.subject)) {
    error.value = 'Controlla email, categoria, oggetto e messaggio.';
    return;
  }
  sending.value = true;
  try {
    await api.post('/contatto', data, { timeout: 60000 });
    sent.value = true;
    toast.success('Messaggio inviato');
  } catch (err) {
    error.value = err.response?.status === 429
      ? 'Hai inviato troppi messaggi. Riprova tra 15 minuti.'
      : 'Non siamo riusciti a inviare il messaggio. Riprova.';
    toast.error(error.value);
  } finally {
    sending.value = false;
  }
};
</script>

<template>
  <div class="min-h-full bg-[var(--bg-primary)] text-[var(--text-primary)]">
    <header class="sticky top-0 z-10 border-b border-[var(--border)] bg-[var(--bg-primary)]/95 backdrop-blur-sm">
      <div class="max-w-3xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-4">
        <router-link to="/" class="flex items-center gap-2 shrink-0">
          <img src="/brand/wallt-app-icon-96.png" alt="WALLT" class="w-9 h-9 rounded-xl" width="96" height="96">
          <span class="font-bold tracking-tight hidden sm:inline">
            WALL<span class="text-[var(--accent-green)]">T</span>
          </span>
        </router-link>
        <button
          type="button"
          class="inline-flex items-center gap-2 text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--accent-green)] transition-colors"
          @click="goBack"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          {{ backLabel }}
        </button>
      </div>
    </header>

    <main class="max-w-3xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
      <h1 class="contatto__title">Contatta WALLT</h1>
      <p class="contatto__lead">
        Scrivi al team senza aprire il tuo programma di posta. Se non riesci ad accedere
        al tuo account, è da qui che puoi segnalarcelo.
      </p>

      <div v-if="sent" class="contatto__card contatto__done" role="status">
        <h2 class="contatto__done-title">Messaggio inviato</h2>
        <p>
          Abbiamo ricevuto il tuo messaggio e ti risponderemo all'indirizzo che hai indicato.
          Non serve reinviarlo.
        </p>
        <WButton class="contatto__done-action" @click="goBack">{{ backLabel }}</WButton>
      </div>

      <form v-else class="contatto__card" :aria-busy="sending" @submit.prevent="submit">
        <fieldset :disabled="sending" class="contatto__fields">
          <div>
            <label for="contatto-email">La tua email</label>
            <input
              id="contatto-email" v-model="email" type="email" class="wallt-input"
              required maxlength="254" autocomplete="email"
              placeholder="nome@esempio.it"
              aria-describedby="contatto-email-hint"
            >
            <p id="contatto-email-hint" class="contatto__hint">
              È l'indirizzo a cui risponderemo: controlla che sia scritto bene.
            </p>
          </div>
          <div>
            <label for="contatto-categoria">Categoria</label>
            <select id="contatto-categoria" v-model="category" class="wallt-input" required>
              <option disabled value="">Seleziona una categoria</option>
              <option v-for="item in SUPPORT_CATEGORIES" :key="item" :value="item">{{ item }}</option>
            </select>
          </div>
          <div>
            <label for="contatto-oggetto">Oggetto</label>
            <input
              id="contatto-oggetto" v-model="subject" class="wallt-input"
              required :maxlength="SUBJECT_MAX" placeholder="Descrivi brevemente la richiesta"
            >
          </div>
          <div>
            <label for="contatto-messaggio">Messaggio</label>
            <textarea
              id="contatto-messaggio" v-model="message" class="wallt-input"
              required :maxlength="MESSAGE_MAX" rows="7"
              aria-describedby="contatto-messaggio-hint"
              placeholder="Raccontaci cosa è successo e come possiamo aiutarti."
            />
            <p id="contatto-messaggio-hint" class="contatto__hint">
              {{ message.length }}/{{ MESSAGE_MAX }} caratteri.
              Non includere password o codici di accesso: non ti verranno mai chiesti.
            </p>
          </div>
        </fieldset>

        <p v-if="error" role="alert" class="contatto__error">{{ error }}</p>

        <WButton type="submit" :loading="sending" class="contatto__submit">
          {{ sending ? 'Invio in corso...' : 'Invia messaggio' }}
        </WButton>
        <span class="sr-only" role="status">{{ sending ? 'Invio in corso...' : '' }}</span>
      </form>
    </main>
  </div>
</template>

<style scoped>
.contatto__title { font-size: 1.75rem; font-weight: 700; letter-spacing: -0.01em; }
.contatto__lead { color: var(--text-secondary); font-size: 0.9375rem; line-height: 1.6; margin: 0.75rem 0 2rem; max-width: 46ch; }
.contatto__card { background: var(--bg-secondary, var(--bg-primary)); border: 1px solid var(--border); border-radius: var(--radius-lg, 16px); padding: 1.5rem; display: flex; flex-direction: column; gap: 1.25rem; }
.contatto__fields { border: 0; padding: 0; margin: 0; min-width: 0; display: grid; gap: 1.25rem; }
label { display: block; margin-bottom: 0.375rem; color: var(--text-primary); font-weight: 600; font-size: 0.8125rem; }
.wallt-input { width: 100%; padding-left: 1rem; }
textarea { resize: vertical; min-height: 160px; }
.contatto__hint { margin-top: 0.375rem; color: var(--text-muted); font-size: 0.75rem; line-height: 1.5; }
.contatto__error { color: var(--accent-red, #dc2626); font-size: 0.875rem; margin: 0; }
.contatto__submit { align-self: flex-start; }
.contatto__done-title { font-size: 1.125rem; font-weight: 700; margin-bottom: 0.5rem; }
.contatto__done { color: var(--text-secondary); font-size: 0.9375rem; line-height: 1.6; }
.contatto__done-action { align-self: flex-start; margin-top: 0.5rem; }
@media (max-width: 480px) {
  .contatto__card { padding: 1.25rem; }
  .contatto__submit, .contatto__done-action { width: 100%; }
  input, select, textarea { font-size: 16px; }
}
</style>
