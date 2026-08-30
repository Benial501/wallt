<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import WModal from '@/components/common/WModal.vue';
import BottomSheet from '@/components/layout/BottomSheet.vue';
import WButton from '@/components/common/WButton.vue';
import { useContiStore } from '@/stores/conti.store';
import { useMovimentiStore } from '@/stores/movimenti.store';
import { useToastStore } from '@/stores/toast.store';
import { CATEGORIE_ENTRATA, CATEGORIE_USCITA } from '@/utils/categorie';
import CategoryIcon from '@/components/common/CategoryIcon.vue';
import { ArrowDownCircle, ArrowUpCircle } from '@/utils/appIcons';
import dayjs from 'dayjs';

const props = defineProps({
  open: { type: Boolean, default: false },
  tipo: { type: String, default: 'entrata' },
  movimento: { type: Object, default: null },
  mobile: { type: Boolean, default: false },
});

const emit = defineEmits(['close', 'saved']);

const contiStore = useContiStore();
const movimentiStore = useMovimentiStore();
const toastStore = useToastStore();

const step = ref(1);
const loading = ref(false);

const form = ref({
  tipo: 'entrata',
  importo: null,
  categoria: null,
  conto_id: null,
  data: dayjs().format('YYYY-MM-DD'),
  descrizione: '',
  ricorrente: false,
  ricorrente_frequenza: 'mensile',
  ricorrente_giorno: 1,
});

const trasferimentoForm = ref({
  conto_origine_id: null,
  conto_destinazione_id: null,
  importo: null,
  data: dayjs().format('YYYY-MM-DD'),
  nota: '',
});

const isTrasferimento = computed(() => props.tipo === 'trasferimento' && !props.movimento);
const isEdit = computed(() => !!props.movimento);

const contiSelezionabili = computed(() => {
  const attivi = [...contiStore.contiAttivi];
  if (isEdit.value && props.movimento?.conto_id) {
    const corrente = contiStore.conti.find((c) => c.id === props.movimento.conto_id);
    if (corrente && !attivi.some((c) => c.id === corrente.id)) {
      attivi.unshift(corrente);
    }
  }
  return attivi;
});

const buildUpdatePayload = () => {
  const payload = { ...form.value };
  if (!payload.ricorrente) {
    payload.ricorrente_frequenza = null;
    payload.ricorrente_giorno = null;
  }
  return payload;
};

const extractErrorMessage = (err) => {
  const data = err.response?.data;
  return data?.errori?.[0]?.messaggio
    || data?.message
    || data?.error
    || err.message
    || 'Errore nel salvataggio';
};

const categorie = computed(() =>
  form.value.tipo === 'entrata' ? CATEGORIE_ENTRATA : CATEGORIE_USCITA
);

const contiDestinazione = computed(() =>
  contiStore.contiAttivi.filter((c) => c.id !== trasferimentoForm.value.conto_origine_id)
);

const saldoInsufficiente = computed(() => {
  const origine = contiStore.contiAttivi.find((c) => c.id === trasferimentoForm.value.conto_origine_id);
  return origine && parseFloat(trasferimentoForm.value.importo) > parseFloat(origine.saldo);
});

const resetForm = () => {
  form.value = {
    tipo: props.tipo === 'trasferimento' ? 'entrata' : props.tipo,
    importo: null,
    categoria: null,
    conto_id: contiStore.contiAttivi[0]?.id || null,
    data: dayjs().format('YYYY-MM-DD'),
    descrizione: '',
    ricorrente: false,
    ricorrente_frequenza: 'mensile',
    ricorrente_giorno: 1,
  };
  trasferimentoForm.value = {
    conto_origine_id: contiStore.contiAttivi[0]?.id || null,
    conto_destinazione_id: contiStore.contiAttivi[1]?.id || null,
    importo: null,
    data: dayjs().format('YYYY-MM-DD'),
    nota: '',
  };
  step.value = isTrasferimento.value || isEdit.value ? 2 : 1;
};

watch(() => props.open, (val) => {
  if (val) {
    resetForm();
    if (props.movimento) {
      form.value = {
        tipo: props.movimento.tipo,
        importo: parseFloat(props.movimento.importo),
        categoria: props.movimento.categoria || 'da_verificare',
        conto_id: props.movimento.conto_id,
        data: props.movimento.data,
        descrizione: props.movimento.descrizione || '',
        ricorrente: props.movimento.ricorrente,
        // Solo la frequenza mensile è effettivamente processata dal cron
        // (vedi ricorrenti.service.js): un valore storico diverso viene
        // normalizzato a 'mensile' al primo salvataggio successivo.
        ricorrente_frequenza: 'mensile',
        ricorrente_giorno: props.movimento.ricorrente_giorno || 1,
      };
    } else if (!isTrasferimento.value) {
      form.value.tipo = props.tipo;
    }
  }
});

onMounted(() => {
  if (!contiStore.conti.length) contiStore.fetchConti();
});

const selectTipo = (tipo) => {
  form.value.tipo = tipo;
  form.value.categoria = null;
  step.value = 2;
};

const salva = async () => {
  loading.value = true;
  try {
    if (isTrasferimento.value) {
      const origine = contiStore.contiAttivi.find((c) => c.id === trasferimentoForm.value.conto_origine_id);
      const destinazione = contiStore.contiAttivi.find((c) => c.id === trasferimentoForm.value.conto_destinazione_id);
      const involvesScommesse = origine?.tipo === 'scommesse' || destinazione?.tipo === 'scommesse';
      await contiStore.trasferimento({ ...trasferimentoForm.value }, { involvesScommesse });
      toastStore.success('Trasferimento completato!');
    } else if (isEdit.value) {
      await movimentiStore.updateMovimento(props.movimento.id, buildUpdatePayload());
      await contiStore.fetchConti();
      toastStore.success('Movimento aggiornato!');
    } else {
      await movimentiStore.createMovimento(form.value);
      await contiStore.fetchConti();
      await contiStore.fetchPatrimonio();
      toastStore.success('Movimento salvato!');
    }
    emit('saved');
    emit('close');
  } catch (err) {
    toastStore.error(extractErrorMessage(err));
  } finally {
    loading.value = false;
  }
};

const canSave = computed(() => {
  if (isTrasferimento.value) {
    return trasferimentoForm.value.conto_origine_id
      && trasferimentoForm.value.conto_destinazione_id
      && trasferimentoForm.value.importo > 0
      && !saldoInsufficiente.value;
  }
  return form.value.importo > 0 && form.value.categoria && form.value.conto_id;
});

const titolo = computed(() => {
  if (isTrasferimento.value) return 'Sposta soldi';
  if (isEdit.value) return 'Modifica movimento';
  return 'Nuovo movimento';
});

const shellProps = computed(() => {
  const base = { open: props.open, title: titolo.value };
  return props.mobile ? { ...base, elevated: true } : base;
});
</script>

<template>
  <component
    :is="mobile ? BottomSheet : WModal"
    v-bind="shellProps"
    @close="$emit('close')"
  >
    <!-- Trasferimento -->
    <div v-if="isTrasferimento" class="form-space">
      <div class="field">
        <label>Da</label>
        <select v-model="trasferimentoForm.conto_origine_id" class="form-select">
          <option v-for="c in contiStore.contiAttivi" :key="c.id" :value="c.id">
            {{ c.icona }} {{ c.nome }} (€{{ parseFloat(c.saldo).toFixed(2) }})
          </option>
        </select>
      </div>
      <div class="transfer-arrow">→</div>
      <div class="field">
        <label>A</label>
        <select v-model="trasferimentoForm.conto_destinazione_id" class="form-select">
          <option v-for="c in contiDestinazione" :key="c.id" :value="c.id">
            {{ c.icona }} {{ c.nome }}
          </option>
        </select>
      </div>
      <div class="field">
        <label>Importo €</label>
        <input v-model.number="trasferimentoForm.importo" type="number" min="0" step="0.01" class="form-input form-input--lg" inputmode="decimal" />
        <p v-if="saldoInsufficiente" class="error-text">Saldo insufficiente</p>
      </div>
      <div class="field">
        <label>Data</label>
        <input v-model="trasferimentoForm.data" type="date" class="form-input" />
      </div>
      <div class="field">
        <label>Note (opzionale)</label>
        <input v-model="trasferimentoForm.nota" type="text" class="form-input" placeholder="Descrizione..." />
      </div>
      <WButton variant="primary" size="lg" :loading="loading" :disabled="!canSave" @click="salva">
        Sposta soldi
      </WButton>
    </div>

    <!-- Movimento entrata/uscita -->
    <div v-else class="form-space">
      <div v-if="step === 1 && !isEdit" class="tipo-grid">
        <button class="tipo-btn" :class="{ active: form.tipo === 'entrata' }" @click="selectTipo('entrata')">
          <ArrowDownCircle :size="20" :stroke-width="1.75" />
          <span>Entrata</span>
        </button>
        <button class="tipo-btn" :class="{ active: form.tipo === 'uscita' }" @click="selectTipo('uscita')">
          <ArrowUpCircle :size="20" :stroke-width="1.75" />
          <span>Uscita</span>
        </button>
      </div>

      <div v-if="step === 2 || isEdit">
        <div class="field">
          <label>Importo €</label>
          <input v-model.number="form.importo" type="number" min="0" step="0.01" class="form-input form-input--lg" inputmode="decimal" placeholder="0.00" />
        </div>

        <div class="field">
          <label>Categoria</label>
          <div class="cat-grid">
            <button
              v-for="cat in categorie"
              :key="cat.id"
              class="cat-btn"
              :class="{ active: form.categoria === cat.id }"
              :style="{ '--cat-color': cat.colore }"
              @click="form.categoria = cat.id"
            >
              <CategoryIcon :categoria="cat.id" :tipo="form.tipo" :size="18" />
              <span class="cat-label">{{ cat.nome }}</span>
            </button>
          </div>
        </div>

        <div class="field">
          <label>Conto</label>
          <select v-model="form.conto_id" class="form-select">
            <option v-for="c in contiSelezionabili" :key="c.id" :value="c.id">
              {{ c.icona }} {{ c.nome }} — €{{ parseFloat(c.saldo).toFixed(2) }}
            </option>
          </select>
        </div>

        <div class="field">
          <label>Data</label>
          <input v-model="form.data" type="date" class="form-input" />
        </div>

        <div class="field">
          <label>Note (opzionale)</label>
          <input v-model="form.descrizione" type="text" class="form-input" placeholder="Descrizione..." />
        </div>

        <div class="field">
          <label class="toggle-label">
            <input v-model="form.ricorrente" type="checkbox" />
            Movimento ricorrente ogni mese
          </label>
          <div v-if="form.ricorrente" class="ricorrente-fields">
            <input v-model.number="form.ricorrente_giorno" type="number" min="1" max="31" class="form-input" placeholder="Giorno del mese (es. 1)" />
          </div>
        </div>

        <WButton variant="primary" size="lg" :loading="loading" :disabled="!canSave" @click="salva">
          Salva
        </WButton>
      </div>
    </div>
  </component>
</template>

<style scoped>
.form-space { display: flex; flex-direction: column; gap: 1rem; }
.field label { display: block; font-size: 0.8125rem; color: var(--text-secondary); margin-bottom: 0.375rem; }
.form-input, .form-select {
  width: 100%;
  background: var(--bg-input);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 0.75rem 1rem;
  color: var(--text-primary);
  font-size: 0.9375rem;
}
.form-input--lg { font-size: 2rem; font-weight: 800; text-align: center; }
.form-input:focus, .form-select:focus { outline: none; border-color: var(--accent-green); }
.tipo-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; }
.tipo-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 1.5rem;
  border-radius: var(--radius-md);
  border: 1px solid var(--border);
  background: var(--bg-input);
  color: var(--text-primary);
  font-size: 1rem;
  cursor: pointer;
}
.tipo-btn svg { color: var(--accent-green); stroke: currentColor; }
.tipo-btn.active { border-color: var(--accent-green); background: var(--accent-light); }
.cat-btn {
  display: flex; flex-direction: column; align-items: center; gap: 0.25rem;
  padding: 0.625rem 0.25rem; border-radius: var(--radius-sm);
  border: 1px solid var(--border); background: var(--bg-input);
  cursor: pointer; color: var(--text-secondary);
}
.cat-btn.active { border-color: var(--cat-color, var(--accent-green)); background: rgba(0,212,170,0.1); color: var(--accent-green); }
.cat-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.5rem; }
.cat-label { font-size: 0.625rem; color: var(--text-muted); text-align: center; }
.transfer-arrow { text-align: center; font-size: 1.5rem; color: var(--accent-green); }
.error-text { color: var(--negative); font-size: 0.8125rem; margin-top: 0.25rem; }
.toggle-label { display: flex; align-items: center; gap: 0.5rem; cursor: pointer; }
.ricorrente-fields { display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; margin-top: 0.5rem; }
</style>
