<script setup>
import { ref, nextTick, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import WCard from '@/components/common/WCard.vue';
import WButton from '@/components/common/WButton.vue';
import { useAuthStore } from '@/stores/auth.store';
import { useToastStore } from '@/stores/toast.store';
import api from '@/utils/axios';

const auth = useAuthStore();
const toast = useToastStore();
const route = useRoute();
const categories = [
  'Problema tecnico', "Problema con l'account", 'Problema con entrate/uscite',
  'Suggerimento', 'Segnalazione bug', 'Altro',
];
const open = ref(false);
const sending = ref(false);
const category = ref('');
const subject = ref('');
const message = ref('');
const feedback = ref('');
const error = ref('');
const categoryInput = ref(null);
const toggleButton = ref(null);

const toggle = async () => {
  if (sending.value) return;
  open.value = !open.value;
  await nextTick();
  if (open.value) categoryInput.value?.focus();
};

onMounted(async () => {
  if (route.hash === '#supporto') await toggle();
});

const submit = async () => {
  if (sending.value) return;
  error.value = '';
  feedback.value = '';
  const data = { category: category.value, subject: subject.value.trim(), message: message.value.trim() };
  if (!categories.includes(data.category) || !data.subject || !data.message
    || data.subject.length > 160 || data.message.length > 5000
    || /[\x00-\x1f\x7f]/.test(data.subject)) {
    error.value = 'Seleziona una categoria e compila oggetto e messaggio.';
    return;
  }
  sending.value = true;
  try {
    // Le due email sono attese dal server; timeout coerente con la funzione Vercel.
    const response = await api.post('/support', data, { timeout: 60000 });
    category.value = '';
    subject.value = '';
    message.value = '';
    feedback.value = response.data.confirmationSent
      ? "Richiesta inviata. Abbiamo inviato una conferma all'email del tuo account."
      : "Richiesta inviata. Non è stato possibile inviare l'email di conferma, ma il supporto ha ricevuto il messaggio. Non serve reinviarlo.";
    toast.success('Richiesta inviata');
    open.value = false;
  } catch (err) {
    error.value = err.response?.status === 429
      ? 'Hai inviato troppe richieste. Riprova tra 15 minuti.'
      : 'Non siamo riusciti a inviare la richiesta. Riprova.';
    toast.error(error.value);
  } finally {
    sending.value = false;
    if (!open.value) {
      await nextTick();
      toggleButton.value?.$el?.focus();
    }
  }
};
</script>

<template>
  <WCard id="supporto" class="support-contact">
    <h2 class="support-contact__title">Assistenza WALLT</h2>
    <p class="support-contact__description">Hai bisogno di una mano o vuoi inviarci un suggerimento? Scrivi al team direttamente da qui.</p>
    <WButton
      ref="toggleButton"
      :disabled="sending"
      :aria-expanded="open"
      aria-controls="support-form"
      @click="toggle"
    >{{ open ? 'Chiudi il modulo' : 'Contatta il supporto' }}</WButton>
    <p v-if="feedback" role="status" class="support-contact__feedback">{{ feedback }}</p>

    <form v-if="open" id="support-form" class="support-contact__form" :aria-busy="sending" @submit.prevent="submit">
      <p class="support-contact__description support-contact__email">
        Riceverai la risposta su <strong>{{ auth.user?.email }}</strong>, l'email del tuo account.
      </p>
      <fieldset :disabled="sending" class="support-contact__fields">
        <div>
          <label for="support-category">Categoria</label>
          <select id="support-category" ref="categoryInput" v-model="category" class="wallt-input" required>
            <option disabled value="">Seleziona una categoria</option>
            <option v-for="item in categories" :key="item" :value="item">{{ item }}</option>
          </select>
        </div>
        <div>
          <label for="support-subject">Oggetto</label>
          <input id="support-subject" v-model="subject" class="wallt-input" required maxlength="160" placeholder="Descrivi brevemente la richiesta" />
        </div>
        <div>
          <label for="support-message">Messaggio</label>
          <textarea id="support-message" v-model="message" class="wallt-input" required maxlength="5000" rows="6" aria-describedby="support-message-hint" placeholder="Raccontaci cosa è successo e come possiamo aiutarti." />
          <p id="support-message-hint" class="support-contact__hint">{{ message.length }}/5000 caratteri. Non includere password o codici di accesso.</p>
        </div>
      </fieldset>
      <p v-if="error" role="alert" class="support-contact__error">{{ error }}</p>
      <WButton type="submit" :loading="sending" class="support-contact__submit">
        {{ sending ? 'Invio in corso...' : 'Invia richiesta' }}
      </WButton>
      <span class="sr-only" role="status">{{ sending ? 'Invio in corso...' : '' }}</span>
    </form>
  </WCard>
</template>

<style scoped>
.support-contact { margin-bottom: 1.5rem; scroll-margin-top: 80px; }
.support-contact__title { font-size: 1.0625rem; font-weight: 700; color: var(--text-primary); }
.support-contact__description { color: var(--text-secondary); font-size: 0.875rem; line-height: 1.6; margin: 0.5rem 0 1rem; }
.support-contact__email { overflow-wrap: anywhere; margin: 0; }
.support-contact__form { display: flex; flex-direction: column; gap: 1rem; margin-top: 1.25rem; border-top: 1px solid var(--border); padding-top: 1.25rem; }
.support-contact__fields { border: 0; padding: 0; margin: 0; min-width: 0; display: grid; gap: 1rem; }
label { display: block; margin-bottom: 0.375rem; color: var(--text-primary); font-weight: 600; font-size: 0.8125rem; }
.wallt-input { width: 100%; padding-left: 1rem; }
textarea { resize: vertical; min-height: 140px; }
.support-contact__hint { margin-top: 0.375rem; color: var(--text-muted); font-size: 0.75rem; }
.support-contact__feedback { margin-top: 1rem; color: var(--accent-green); font-size: 0.875rem; line-height: 1.6; }
.support-contact__error { color: var(--accent-red, #dc2626); font-size: 0.875rem; }
.support-contact__submit { align-self: flex-start; }
@media (max-width: 480px) {
  .support-contact__submit { width: 100%; }
  input, select, textarea { font-size: 16px; }
}
</style>
