<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import AppDialog from '@/components/common/AppDialog.vue';
import WButton from '@/components/common/WButton.vue';
import CategoryIcon from '@/components/common/CategoryIcon.vue';
import { useContiStore } from '@/stores/conti.store';
import { useScheduledPaymentsStore } from '@/stores/scheduledPayments.store';
import { useToastStore } from '@/stores/toast.store';
import { useValuta } from '@/composables/useValuta';
import { CATEGORIE_ENTRATA, CATEGORIE_USCITA, CATEGORIE_ARCHIVIATE } from '@/utils/categorie';
import { formatData } from '@/utils/formatters';
import { Calendar } from '@/utils/appIcons';
import dayjs from 'dayjs';

// Riprogrammazione di una scadenza già creata: la data si sposta, l'importo
// cambia, il resto resta. Non è la form di creazione (MovimentoForm) e non
// crea nulla — invia solo i campi davvero modificati, così una richiesta non
// riscrive silenziosamente ciò che l'utente non ha toccato.
//
// Di una rata si può spostare solo la data: importo, categoria e conto
// appartengono al piano che l'ha generata, e il server li rifiuta.

const props = defineProps({
  open: { type: Boolean, default: false },
  payment: { type: Object, default: null },
});

const emit = defineEmits(['close', 'saved']);

const contiStore = useContiStore();
const scheduledStore = useScheduledPaymentsStore();
const toastStore = useToastStore();
const { formatValuta } = useValuta();

const loading = ref(false);
const ricercaCategoria = ref('');
const form = ref({ due_date: '', amount: null, category: null, account_id: null, description: '' });

const oggiISO = dayjs().format('YYYY-MM-DD');
const isRata = computed(() => Boolean(props.payment?.piano));
const isEntrata = computed(() => props.payment?.tipo === 'entrata');

const categorie = computed(() => [
  ...(isEntrata.value ? CATEGORIE_ENTRATA : CATEGORIE_USCITA),
  ...CATEGORIE_ARCHIVIATE.filter((c) => c.id === props.payment?.categoria),
].filter((c) => c.nome.toLowerCase().includes(ricercaCategoria.value.toLowerCase())));

const contiSelezionabili = computed(() => {
  const attivi = [...contiStore.contiAttivi];
  const corrente = contiStore.conti.find((c) => c.id === props.payment?.conto_id);
  if (corrente && !attivi.some((c) => c.id === corrente.id)) attivi.unshift(corrente);
  return attivi;
});

watch(() => props.open, (aperta) => {
  if (!aperta || !props.payment) return;
  ricercaCategoria.value = '';
  form.value = {
    due_date: props.payment.data_scadenza,
    amount: Number(props.payment.importo),
    category: props.payment.categoria || null,
    account_id: props.payment.conto_id,
    description: props.payment.descrizione || '',
  };
});

onMounted(() => {
  if (!contiStore.conti.length) contiStore.fetchConti();
});

/** Solo i campi davvero cambiati: una PATCH non deve riscrivere il resto. */
const buildPayload = () => {
  const payload = {};
  if (form.value.due_date && form.value.due_date !== props.payment.data_scadenza) {
    payload.due_date = form.value.due_date;
  }
  if (isRata.value) return payload;
  if (Number(form.value.amount) !== Number(props.payment.importo)) {
    payload.amount = Number(form.value.amount).toFixed(2);
  }
  if (form.value.category && form.value.category !== props.payment.categoria) {
    payload.category = form.value.category;
  }
  if (form.value.account_id && form.value.account_id !== props.payment.conto_id) {
    payload.account_id = form.value.account_id;
  }
  if (form.value.description.trim() !== (props.payment.descrizione || '')) {
    payload.description = form.value.description.trim();
  }
  return payload;
};

const modifiche = computed(() => Object.keys(buildPayload()).length);
const dataValida = computed(() => Boolean(form.value.due_date) && form.value.due_date >= oggiISO);
const canSave = computed(() => dataValida.value
  && modifiche.value > 0
  && (isRata.value || (Number(form.value.amount) > 0 && Boolean(form.value.category) && Boolean(form.value.account_id))));

const salva = async () => {
  loading.value = true;
  try {
    const { funding } = await scheduledStore.updatePayment(props.payment.id, buildPayload());
    // Il ricalcolo arriva dal server, che è l'unico a conoscere gli
    // accantonamenti già messi da parte: qui si mostra, non si ricalcola.
    if (funding && Number(funding.remaining) > 0) {
      toastStore.success(`Scadenza aggiornata: ${formatValuta(funding.weeklyQuota)} a settimana per ${funding.periodsRemaining === 1 ? 'un’ultima settimana' : `${funding.periodsRemaining} settimane`}`);
    } else {
      toastStore.success('Scadenza aggiornata');
    }
    emit('saved');
    emit('close');
  } catch (err) {
    const data = err.response?.data;
    toastStore.error(data?.errori?.[0]?.messaggio || data?.message || data?.error || 'Non è stato possibile aggiornare la scadenza');
  } finally {
    loading.value = false;
  }
};
</script>

<template>
  <AppDialog :open="open" title="Modifica scadenza" @close="$emit('close')">
    <div v-if="payment" class="riprogramma">
      <div class="riprogramma__intro">
        <span class="riprogramma__icon"><Calendar :size="18" aria-hidden="true" /></span>
        <p>
          {{ isEntrata ? 'Entrata prevista' : 'Scadenza' }} oggi fissata al
          {{ formatData(payment.data_scadenza, 'medio') }}. Spostarla non muove denaro:
          il movimento viene registrato solo quando la confermi.
        </p>
      </div>

      <div class="field">
        <label for="riprogramma-data">{{ isEntrata ? 'Data prevista' : 'Nuova data di scadenza' }}</label>
        <input
          id="riprogramma-data"
          v-model="form.due_date"
          type="date"
          class="form-input"
          :min="oggiISO"
        />
        <p v-if="form.due_date && !dataValida" class="field__errore">La data non può essere nel passato.</p>
      </div>

      <p v-if="isRata" class="riprogramma__rata">
        Questa è una rata del piano “{{ payment.descrizione || 'piano di pagamento' }}”:
        puoi spostarne la data, mentre importo, categoria e conto appartengono al piano.
      </p>

      <template v-else>
        <div class="field">
          <label for="riprogramma-importo">Importo €</label>
          <input
            id="riprogramma-importo"
            v-model.number="form.amount"
            type="number"
            min="0"
            step="0.01"
            inputmode="decimal"
            class="form-input form-input--lg"
          />
        </div>

        <div class="field">
          <label>Categoria</label>
          <input v-model="ricercaCategoria" class="form-input" type="search" placeholder="Cerca categoria" aria-label="Cerca categoria" />
          <div class="cat-grid">
            <button
              v-for="cat in categorie"
              :key="cat.id"
              class="cat-btn"
              :class="{ active: form.category === cat.id }"
              :style="{ '--cat-color': cat.colore }"
              @click="form.category = cat.id"
            >
              <span class="cat-btn__icon">
                <CategoryIcon :categoria="cat.id" :tipo="payment.tipo" :size="17" />
              </span>
              <span class="cat-label">{{ cat.nome }}{{ !cat.attiva ? ' (archiviata)' : '' }}</span>
            </button>
          </div>
        </div>

        <div class="field">
          <label for="riprogramma-conto">Conto</label>
          <select id="riprogramma-conto" v-model="form.account_id" class="form-select">
            <option v-for="c in contiSelezionabili" :key="c.id" :value="c.id">
              {{ c.nome }} — {{ formatValuta(c.saldo) }}
            </option>
          </select>
        </div>

        <div class="field">
          <label for="riprogramma-note">Note (opzionale)</label>
          <input id="riprogramma-note" v-model="form.description" type="text" class="form-input" placeholder="Descrizione..." />
        </div>
      </template>

      <div class="riprogramma__azioni">
        <WButton variant="secondary" size="lg" :disabled="loading" @click="$emit('close')">Annulla</WButton>
        <WButton variant="primary" size="lg" :loading="loading" :disabled="!canSave" @click="salva">Salva</WButton>
      </div>
    </div>
  </AppDialog>
</template>

<style scoped>
.riprogramma { display: flex; flex-direction: column; gap: 1.125rem; }
.riprogramma__intro {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  padding: 0.75rem 0.875rem;
  border-radius: var(--radius-lg);
  border: 1px solid color-mix(in srgb, var(--accent-green) 22%, var(--border));
  background: color-mix(in srgb, var(--accent-green) 8%, transparent);
}
.riprogramma__icon {
  flex-shrink: 0;
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border-radius: 10px;
  color: var(--accent-text);
  background: color-mix(in srgb, var(--accent-green) 14%, transparent);
}
.riprogramma__intro p { margin: 0; font-size: var(--text-xs); line-height: 1.5; color: var(--text-secondary); }
.riprogramma__rata {
  margin: 0;
  padding: 0.75rem 0.875rem;
  border-radius: var(--radius-md);
  border: 1px solid color-mix(in srgb, var(--warning) 28%, transparent);
  background: color-mix(in srgb, var(--warning) 10%, transparent);
  color: var(--text-secondary);
  font-size: var(--text-xs);
  line-height: 1.5;
}
.field label {
  display: block;
  font-size: var(--text-xs);
  font-weight: 600;
  letter-spacing: var(--tracking-wide);
  color: var(--text-muted);
  margin-bottom: 0.4375rem;
}
.field__errore { margin: 0.375rem 0 0; color: var(--negative); font-size: var(--text-xs); }
.form-input--lg {
  font-size: 2rem;
  font-weight: 700;
  letter-spacing: var(--tracking-display);
  text-align: center;
  padding: 1rem;
  font-variant-numeric: tabular-nums;
}
.riprogramma__azioni { display: grid; grid-template-columns: 1fr 1fr; gap: 0.625rem; }
@media (max-width: 420px) { .riprogramma__azioni { grid-template-columns: 1fr; } }

/* Griglia categorie: stesso linguaggio delle altre form (RicorrenteForm,
   MovimentoForm), lo stato selezionato si legge dal bordo tinto. */
.cat-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 0.4375rem;
  margin-top: 0.5rem;
  padding: 0.5rem;
  max-height: 220px;
  overflow-y: auto;
  border-radius: var(--radius-lg);
  border: 1px solid var(--glass-secondary-border);
  background: var(--glass-secondary-bg);
  overflow-x: hidden;
  overscroll-behavior: contain;
  touch-action: pan-y;
}
.cat-btn {
  display: flex; flex-direction: column; align-items: center; gap: 0.3125rem;
  padding: 0.625rem 0.25rem; border-radius: var(--radius-md);
  border: 1px solid transparent; background: transparent;
  cursor: pointer; color: var(--text-secondary); min-width: 0;
  transition:
    background var(--dur-fast) var(--ease-out),
    border-color var(--dur-fast) var(--ease-out),
    transform var(--dur-fast) var(--ease-out);
}
@media (hover: hover) {
  .cat-btn:hover { background: var(--glass-interactive-bg); }
}
.cat-btn:active { transform: scale(0.95); }
.cat-btn:focus-visible { outline: 2px solid var(--border-focus); outline-offset: 2px; }
.cat-btn.active {
  border-color: color-mix(in srgb, var(--cat-color, var(--accent-green)) 45%, transparent);
  background: color-mix(in srgb, var(--cat-color, var(--accent-green)) 12%, transparent);
  color: var(--text-primary);
}
.cat-btn__icon {
  width: 34px;
  height: 34px;
  border-radius: 12px;
  display: grid;
  place-items: center;
  color: var(--text-primary);
  background: color-mix(in srgb, var(--cat-color, var(--accent-green)) 12%, transparent);
  border: 1px solid color-mix(in srgb, var(--cat-color, var(--accent-green)) 20%, var(--border));
  box-shadow: inset 0 1px 0 rgb(255 255 255 / 12%);
  flex-shrink: 0;
}
.cat-btn.active .cat-btn__icon {
  background: color-mix(in srgb, var(--cat-color, var(--accent-green)) 24%, transparent);
  border-color: color-mix(in srgb, var(--cat-color, var(--accent-green)) 50%, var(--border));
}
.cat-label {
  font-size: var(--text-xs);
  line-height: 1.25;
  color: var(--text-muted);
  text-align: center;
  min-width: 0;
  overflow-wrap: anywhere;
}
.cat-btn.active .cat-label { color: var(--text-primary); font-weight: 600; }
</style>
