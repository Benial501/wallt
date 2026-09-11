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
  <div class="min-h-full text-[var(--text-primary)] doc-page">
    <header class="doc-topbar">
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
      <p class="contatto__eyebrow">Supporto</p>
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
          <div class="contatto__field">
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
          <div class="contatto__field">
            <label for="contatto-categoria">Categoria</label>
            <select id="contatto-categoria" v-model="category" class="wallt-input" required>
              <option disabled value="">Seleziona una categoria</option>
              <option v-for="item in SUPPORT_CATEGORIES" :key="item" :value="item">{{ item }}</option>
            </select>
          </div>
          <div class="contatto__field">
            <label for="contatto-oggetto">Oggetto</label>
            <input
              id="contatto-oggetto" v-model="subject" class="wallt-input"
              required :maxlength="SUBJECT_MAX" placeholder="Descrivi brevemente la richiesta"
            >
          </div>
          <div class="contatto__field">
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
.contatto__eyebrow {
  font-size: 0.6875rem;
  font-weight: 700;
  letter-spacing: var(--tracking-caps);
  text-transform: uppercase;
  color: var(--accent-green);
  margin-bottom: 0.5rem;
}
.contatto__title {
  font-size: clamp(1.875rem, 4.5vw, 2.375rem);
  font-weight: 700;
  letter-spacing: var(--tracking-display);
  line-height: var(--leading-tight);
}
.contatto__lead {
  color: var(--text-secondary);
  font-size: 1rem;
  line-height: var(--leading-relaxed);
  margin: 0.875rem 0 2rem;
  max-width: 52ch;
}

/* Livello "elevated": il modulo e' il soggetto della pagina, quindi e' la
   superficie piu' definita. Il resto della pagina gli fa da sfondo. */
.contatto__card {
  background: var(--glass-elevated-bg);
  backdrop-filter: blur(var(--blur-lg)) saturate(var(--glass-saturate));
  -webkit-backdrop-filter: blur(var(--blur-lg)) saturate(var(--glass-saturate));
  border: 1px solid var(--glass-elevated-border);
  border-radius: var(--radius-2xl);
  box-shadow: var(--shadow-lg), var(--glass-highlight);
  padding: 1.75rem;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}
@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
  .contatto__card { background: var(--glass-elevated-solid); }
}

.contatto__fields { border: 0; padding: 0; margin: 0; min-width: 0; display: grid; gap: 1.375rem; }
.contatto__fields:disabled { opacity: 0.6; }

/* I campi sono separati da una linea sottilissima invece che dal solo spazio:
   il modulo si legge come un elenco di voci, non come quattro riquadri. */
.contatto__field + .contatto__field {
  padding-top: 1.375rem;
  border-top: 1px solid var(--divider);
  margin-top: -0.375rem;
}

label {
  display: block;
  margin-bottom: 0.5rem;
  color: var(--text-primary);
  font-weight: 600;
  font-size: 0.875rem;
  letter-spacing: var(--tracking-tight);
}

/* Nessun padding a sinistra per l'icona: qui i campi non hanno un'icona. */
.wallt-input { padding-left: 1rem; }
textarea.wallt-input { resize: vertical; min-height: 170px; padding-top: 0.875rem; }

.contatto__hint {
  margin-top: 0.5rem;
  color: var(--text-muted);
  font-size: 0.8125rem;
  line-height: var(--leading-normal);
}

.contatto__error {
  display: flex;
  gap: 0.5rem;
  margin: 0;
  padding: 0.75rem 0.9375rem;
  border-radius: var(--radius-md);
  border: 1px solid color-mix(in srgb, var(--negative) 35%, transparent);
  background: color-mix(in srgb, var(--negative) 10%, transparent);
  color: var(--negative);
  font-size: 0.875rem;
  line-height: var(--leading-normal);
}

.contatto__submit { align-self: flex-start; min-width: 12rem; }

.contatto__done { color: var(--text-secondary); font-size: 1rem; line-height: var(--leading-relaxed); }
.contatto__done-title {
  font-size: 1.25rem;
  font-weight: 650;
  letter-spacing: var(--tracking-title);
  color: var(--text-primary);
  margin-bottom: 0.5rem;
}
.contatto__done-action { align-self: flex-start; margin-top: 0.25rem; }

@media (max-width: 640px) {
  .contatto__card { padding: 1.25rem; border-radius: var(--radius-xl); }
  .contatto__submit, .contatto__done-action { width: 100%; }
  /* 16px: sotto questa soglia iOS ingrandisce la pagina al fuoco del campo. */
  input, select, textarea { font-size: 16px; }
}
</style>
