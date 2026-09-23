<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import AppDialog from '@/components/common/AppDialog.vue';
import WButton from '@/components/common/WButton.vue';
import { useContiStore } from '@/stores/conti.store';
import { useMovimentiStore } from '@/stores/movimenti.store';
import { useToastStore } from '@/stores/toast.store';
import { CATEGORIE_ENTRATA, CATEGORIE_USCITA, CATEGORIE_ARCHIVIATE } from '@/utils/categorie';
import CategoryIcon from '@/components/common/CategoryIcon.vue';
import { ArrowDownCircle, ArrowUpCircle, Repeat2 } from '@/utils/appIcons';
import { useRouter } from 'vue-router';
import { refreshAfterWrite, VISTA_NON_AGGIORNATA } from '@/utils/afterWrite';
import { GIORNI_SETTIMANA, MESI_ANNO, normalizzaFrequenza } from '@/utils/ricorrenti';
import dayjs from 'dayjs';

// Form dedicata a chi arriva dalla sezione Ricorrenti: qui la ricorrenza non è
// un'opzione in fondo a un form di movimento, è il motivo per cui si è aperta
// questa form. Niente checkbox "ricorrente" (è sempre true) e niente campo
// data: la data del movimento "regola" è oggi, la schedulazione vera è
// giorno/mese/frequenza. Per un movimento normale resta MovimentoForm.vue.

const props = defineProps({
  open: { type: Boolean, default: false },
  movimento: { type: Object, default: null },
});

const emit = defineEmits(['close', 'saved']);

const contiStore = useContiStore();
const movimentiStore = useMovimentiStore();
const toastStore = useToastStore();
const router = useRouter();

const step = ref(1);
const loading = ref(false);

const form = ref({
  tipo: 'uscita',
  importo: null,
  categoria: null,
  conto_id: null,
  descrizione: '',
  natura_entrata: 'sconosciuto',
  periodicita_entrata: 'sconosciuta',
  ricorrente_frequenza: 'mensile',
  ricorrente_giorno: 1,
  ricorrente_mese: 1,
});

const isEdit = computed(() => !!props.movimento);

// Il range valido di ricorrente_giorno dipende dalla frequenza (1-7 per
// settimanale, 1-31 per mensile/annuale): cambiando frequenza un valore
// fuori range verrebbe respinto dalla validazione al salvataggio.
watch(() => form.value.ricorrente_frequenza, (freq, prev) => {
  if (!prev) return;
  if (freq === 'settimanale' && form.value.ricorrente_giorno > 7) {
    form.value.ricorrente_giorno = 1;
  }
});

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

const buildPayload = () => {
  const payload = { ...form.value, ricorrente: true };
  if (payload.ricorrente_frequenza !== 'annuale') payload.ricorrente_mese = null;
  if (!isEdit.value) payload.data = dayjs().format('YYYY-MM-DD');
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

const ricercaCategoria = ref('');
const categorie = computed(() => [
  ...(form.value.tipo === 'entrata' ? CATEGORIE_ENTRATA : CATEGORIE_USCITA),
  ...CATEGORIE_ARCHIVIATE.filter(c => c.id === props.movimento?.categoria && c.tipo === form.value.tipo),
].filter(c => c.nome.toLowerCase().includes(ricercaCategoria.value.toLowerCase())));

const resetForm = () => {
  form.value = {
    tipo: 'uscita',
    importo: null,
    categoria: null,
    conto_id: contiStore.contiAttivi[0]?.id || null,
    descrizione: '',
    natura_entrata: 'sconosciuto',
    periodicita_entrata: 'sconosciuta',
    ricorrente_frequenza: 'mensile',
    ricorrente_giorno: 1,
    ricorrente_mese: 1,
  };
  step.value = isEdit.value ? 2 : 1;
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
        descrizione: props.movimento.descrizione || '',
        natura_entrata: props.movimento.natura_entrata || 'sconosciuto',
        periodicita_entrata: props.movimento.periodicita_entrata || 'sconosciuta',
        ricorrente_frequenza: normalizzaFrequenza(props.movimento.ricorrente_frequenza),
        ricorrente_giorno: props.movimento.ricorrente_giorno || 1,
        ricorrente_mese: props.movimento.ricorrente_mese || 1,
      };
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
    if (isEdit.value) {
      await movimentiStore.updateMovimento(props.movimento.id, buildPayload());
    } else {
      await movimentiStore.createMovimento(buildPayload());
    }

    // Da qui in poi la regola è già registrata sul server. Ricaricare saldi e
    // patrimonio serve solo a ciò che si vede: se fallisce, il salvataggio
    // resta valido e va comunicato come riuscito, altrimenti l'utente lo
    // ripete credendo che non sia andato a buon fine.
    const vistaAggiornata = await refreshAfterWrite(
      () => contiStore.fetchConti(),
      () => contiStore.fetchPatrimonio(),
    );

    toastStore.success(isEdit.value ? 'Ricorrenza aggiornata!' : 'Ricorrenza creata!');
    if (!vistaAggiornata) toastStore.warning(VISTA_NON_AGGIORNATA);

    emit('saved');
    emit('close');
  } catch (err) {
    toastStore.error(extractErrorMessage(err));
  } finally {
    loading.value = false;
  }
};

const canSave = computed(() => form.value.importo > 0 && form.value.categoria && form.value.conto_id);

/** Nessun conto disponibile: la regola non avrebbe dove essere registrata. */
const senzaConti = computed(() => contiSelezionabili.value.length === 0);

const vaiAiConti = () => {
  emit('close');
  router.push('/conti');
};

const titolo = computed(() => (isEdit.value ? 'Modifica ricorrenza' : 'Nuova ricorrenza'));

const shellProps = computed(() => ({ open: props.open, title: titolo.value }));
</script>

<template>
  <component
    :is="AppDialog"
    v-bind="shellProps"
    @close="$emit('close')"
  >
    <div class="form-space">
      <div v-if="senzaConti" class="prereq">
        <p class="prereq__text">
          Serve prima un conto: è la “tasca” su cui viene registrata la regola e di cui
          viene aggiornato il saldo a ogni addebito automatico. Aprendo I miei conti
          questa form si chiude e quanto hai già scritto qui non viene salvato.
        </p>
        <WButton variant="secondary" size="sm" @click="vaiAiConti">Crea un conto</WButton>
      </div>

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
        <div class="regola-intro">
          <span class="regola-intro__icon"><Repeat2 :size="18" :stroke-width="1.75" /></span>
          <p>Crei una regola: WALLT registra da sola il movimento a ogni scadenza.</p>
        </div>

        <div class="field">
          <label>Ogni quanto si ripete</label>
          <div class="ricorrente-fields">
            <select v-model="form.ricorrente_frequenza" class="form-select ricorrente-fields__frequenza">
              <option value="mensile">Ogni mese</option>
              <option value="settimanale">Ogni settimana</option>
              <option value="annuale">Ogni anno</option>
            </select>

            <select v-if="form.ricorrente_frequenza === 'settimanale'" v-model.number="form.ricorrente_giorno" class="form-select">
              <option v-for="g in GIORNI_SETTIMANA" :key="g.id" :value="g.id">{{ g.label }}</option>
            </select>

            <template v-else-if="form.ricorrente_frequenza === 'annuale'">
              <select v-model.number="form.ricorrente_mese" class="form-select">
                <option v-for="m in MESI_ANNO" :key="m.id" :value="m.id">{{ m.label }}</option>
              </select>
              <input v-model.number="form.ricorrente_giorno" type="number" min="1" max="31" class="form-input" placeholder="Giorno (es. 1)" />
            </template>

            <input v-else v-model.number="form.ricorrente_giorno" type="number" min="1" max="31" class="form-input" placeholder="Giorno del mese (es. 1)" />
          </div>
        </div>

        <div class="field">
          <label>Importo €</label>
          <input v-model.number="form.importo" type="number" min="0" step="0.01" class="form-input form-input--lg" inputmode="decimal" placeholder="0.00" />
        </div>

        <div class="field">
          <label>Categoria</label>
          <input v-model="ricercaCategoria" class="form-input" type="search" placeholder="Cerca categoria" aria-label="Cerca categoria" />
          <div class="cat-grid">
            <button
              v-for="cat in categorie"
              :key="cat.id"
              class="cat-btn"
              :class="{ active: form.categoria === cat.id }"
              :style="{ '--cat-color': cat.colore }"
              @click="form.categoria = cat.id"
            >
              <span class="cat-btn__icon">
                <CategoryIcon :categoria="cat.id" :tipo="form.tipo" :size="17" />
              </span>
              <span class="cat-label">{{ cat.nome }}{{ !cat.attiva ? ' (archiviata)' : '' }}</span>
            </button>
          </div>
        </div>

        <div class="field">
          <label>Conto</label>
          <select v-model="form.conto_id" class="form-select">
            <option v-for="c in contiSelezionabili" :key="c.id" :value="c.id">
              {{ c.nome }} — €{{ parseFloat(c.saldo).toFixed(2) }}
            </option>
          </select>
        </div>

        <div class="field">
          <label>Note (opzionale)</label>
          <input v-model="form.descrizione" type="text" class="form-input" placeholder="Descrizione..." />
        </div>

        <div v-if="form.tipo === 'entrata'" class="field">
          <label>Natura dell'entrata</label>
          <select v-model="form.natura_entrata" class="form-select">
            <option value="sconosciuto">Non specificata</option>
            <option value="stipendio">Stipendio</option>
            <option value="pensione">Pensione</option>
            <option value="compenso">Compenso</option>
            <option value="bonus">Bonus</option>
            <option value="regalo">Regalo</option>
            <option value="rimborso">Rimborso</option>
            <option value="vendita">Vendita</option>
            <option value="altro">Altro</option>
          </select>
        </div>

        <div v-if="form.tipo === 'entrata'" class="field">
          <label>Periodicità dell'entrata</label>
          <select v-model="form.periodicita_entrata" class="form-select">
            <option value="sconosciuta">Non specificata</option>
            <option value="ricorrente">Ricorrente o prevedibile</option>
            <option value="occasionale">Occasionale</option>
          </select>
        </div>

        <WButton variant="primary" size="lg" :loading="loading" :disabled="!canSave" @click="salva">
          {{ isEdit ? 'Salva' : 'Crea ricorrenza' }}
        </WButton>
      </div>
    </div>
  </component>
</template>

<style scoped>
.form-space { display: flex; flex-direction: column; gap: 1.125rem; }
.prereq {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.625rem;
  padding: 0.875rem 1rem;
  border-radius: var(--radius-lg);
  border: 1px solid color-mix(in srgb, var(--warning) 32%, transparent);
  background: color-mix(in srgb, var(--warning) 10%, transparent);
}
.prereq__text { font-size: var(--text-xs); line-height: var(--leading-normal); color: var(--text-secondary); }
.field label {
  display: block;
  font-size: var(--text-xs);
  font-weight: 600;
  letter-spacing: var(--tracking-wide);
  color: var(--text-muted);
  margin-bottom: 0.4375rem;
}
/* .form-input e .form-select: aspetto condiviso in assets/styles/main.css.
   Qui restano solo le varianti specifiche di questa form. */
.form-input--lg {
  font-size: 2rem;
  font-weight: 700;
  letter-spacing: var(--tracking-display);
  text-align: center;
  padding: 1rem;
  font-variant-numeric: tabular-nums;
}
.tipo-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.625rem; margin-bottom: 1.125rem; }
.tipo-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 1.5rem;
  border-radius: var(--radius-lg);
  border: 1px solid var(--glass-interactive-border);
  background: var(--glass-interactive-bg);
  box-shadow: var(--glass-highlight);
  color: var(--text-primary);
  font-size: 0.9375rem;
  font-weight: 550;
  cursor: pointer;
  transition:
    background var(--dur-fast) var(--ease-out),
    border-color var(--dur-fast) var(--ease-out),
    transform var(--dur-fast) var(--ease-out);
}
@media (hover: hover) {
  .tipo-btn:hover { background: var(--glass-interactive-bg-hover); }
}
.tipo-btn:active { transform: scale(0.98); }
.tipo-btn:focus-visible { outline: none; box-shadow: var(--focus-ring), var(--glass-highlight); }
.tipo-btn svg { color: var(--accent-text); stroke: currentColor; }
.tipo-btn.active { border-color: color-mix(in srgb, var(--accent-green) 55%, transparent); background: var(--accent-light); }

/* Riga di apertura dello step 2: marca subito la form come "regola", non
   transazione — è l'unico elemento davvero nuovo rispetto al linguaggio
   condiviso col resto dell'app (stessi input, stessa griglia categorie). */
.regola-intro {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  padding: 0.75rem 0.875rem;
  margin-bottom: 1.125rem;
  border-radius: var(--radius-lg);
  border: 1px solid color-mix(in srgb, var(--accent-green) 22%, var(--border));
  background: color-mix(in srgb, var(--accent-green) 8%, transparent);
}
.regola-intro__icon {
  flex-shrink: 0;
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border-radius: 10px;
  color: var(--accent-text);
  background: color-mix(in srgb, var(--accent-green) 14%, transparent);
}
.regola-intro p { margin: 0; font-size: var(--text-xs); line-height: 1.5; color: var(--text-secondary); }

/* --- Selettore categoria -------------------------------------------------
   E' il controllo piu' usato del form: griglia scorrevole con ricerca sopra.
   Lo stato selezionato si legge dal bordo tinto e dalla pastiglia dell'icona,
   non da un fondo pieno che coprirebbe l'etichetta. */
.cat-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 0.4375rem;
  margin-top: 0.5rem;
  padding: 0.5rem;
  max-height: 250px;
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
  cursor: pointer; color: var(--text-secondary);
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
.cat-btn { min-width: 0; }
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
  transition:
    background var(--dur-fast) var(--ease-out),
    border-color var(--dur-fast) var(--ease-out);
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
.ricorrente-fields { display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; }
.ricorrente-fields__frequenza { grid-column: 1 / -1; }
</style>
