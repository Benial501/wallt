<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import AppDialog from '@/components/common/AppDialog.vue';
import WButton from '@/components/common/WButton.vue';
import { useContiStore } from '@/stores/conti.store';
import { isContoFondo } from '@/utils/fondoEmergenza';
import { useMovimentiStore } from '@/stores/movimenti.store';
import { useToastStore } from '@/stores/toast.store';
import { CATEGORIE_ENTRATA, CATEGORIE_USCITA, CATEGORIE_ARCHIVIATE } from '@/utils/categorie';
import CategoryIcon from '@/components/common/CategoryIcon.vue';
import HelpNote from '@/components/help/HelpNote.vue';
import { ArrowDownCircle, ArrowUpCircle } from '@/utils/appIcons';
import { useRouter } from 'vue-router';
import { VISTA_NON_AGGIORNATA } from '@/utils/afterWrite';
import { GIORNI_SETTIMANA, MESI_ANNO, normalizzaFrequenza } from '@/utils/ricorrenti';
import MonthlySchedulePicker from '@/components/ricorrenti/MonthlySchedulePicker.vue';
import dayjs from 'dayjs';
import api from '@/utils/axios';
import { useScheduledPaymentsStore } from '@/stores/scheduledPayments.store';
import { calculateInstallmentPlan } from '@/utils/installmentCalculator';

const props = defineProps({
  open: { type: Boolean, default: false },
  tipo: { type: String, default: 'entrata' },
  movimento: { type: Object, default: null },
  modalitaProgrammate: { type: Boolean, default: false },
  saltaSceltaTipo: { type: Boolean, default: false },
});

const emit = defineEmits(['close', 'saved']);

const contiStore = useContiStore();
const movimentiStore = useMovimentiStore();
const toastStore = useToastStore();
const scheduledPaymentsStore = useScheduledPaymentsStore();
const router = useRouter();

const step = ref(1);
const loading = ref(false);
const feedback = ref(null);
const scheduleMode = ref('today');
const programmazione = ref('nessuna');
const mostraProgrammazione = ref(false);
const initialPayment = ref(0);
const paymentCount = ref(3);
const annualRate = ref(0);
const senzaTermine = ref(false);
const installmentPreview = computed(() => calculateInstallmentPlan({
  purchaseAmount: form.value.importo,
  initialPayment: initialPayment.value,
  paymentCount: paymentCount.value,
  annualRate: annualRate.value,
}));

const form = ref({
  tipo: 'entrata',
  importo: null,
  categoria: null,
  conto_id: null,
  data: dayjs().format('YYYY-MM-DD'),
  descrizione: '',
  natura_entrata: 'sconosciuto',
  periodicita_entrata: 'sconosciuta',
  ricorrente: false,
  ricorrente_frequenza: 'mensile',
  ricorrente_giorno: 1,
  ricorrente_mese: 1,
  ricorrente_occorrenze_rimanenti: 12,
});

// Il range valido di ricorrente_giorno dipende dalla frequenza (1-7 per
// settimanale, 1-31 per mensile/annuale): cambiando frequenza un valore
// fuori range verrebbe respinto dalla validazione al salvataggio.
watch(() => form.value.ricorrente_frequenza, (freq, prev) => {
  if (!prev) return;
  if (freq === 'settimanale' && form.value.ricorrente_giorno > 7) {
    form.value.ricorrente_giorno = 1;
  }
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

// Il fondo di emergenza non accetta entrate o uscite dirette (il server le
// rifiuta): offrirlo qui vorrebbe dire far scegliere una strada che finisce in
// errore. Nel trasferimento invece resta disponibile, ed è l'unico modo per
// metterci o togliere denaro.
const contiSelezionabili = computed(() => {
  const attivi = contiStore.contiAttivi.filter((c) => !isContoFondo(c));
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
  payload.ricorrente_occorrenze_rimanenti = payload.ricorrente
    && payload.ricorrente_frequenza === 'mensile'
    && !senzaTermine.value
    ? payload.ricorrente_occorrenze_rimanenti
    : null;
  if (!payload.ricorrente) {
    payload.ricorrente_frequenza = null;
    payload.ricorrente_giorno = null;
    payload.ricorrente_mese = null;
  } else if (payload.ricorrente_frequenza !== 'annuale') {
    payload.ricorrente_mese = null;
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

const ricercaCategoria = ref('');
const categorie = computed(() => [
  ...(form.value.tipo === 'entrata' ? CATEGORIE_ENTRATA : CATEGORIE_USCITA),
  ...CATEGORIE_ARCHIVIATE.filter(c => c.id === props.movimento?.categoria && c.tipo === form.value.tipo),
].filter(c => c.nome.toLowerCase().includes(ricercaCategoria.value.toLowerCase())));


const contiDestinazione = computed(() =>
  contiStore.contiAttivi.filter((c) => c.id !== trasferimentoForm.value.conto_origine_id)
);

const saldoInsufficiente = computed(() => {
  const origine = contiStore.contiAttivi.find((c) => c.id === trasferimentoForm.value.conto_origine_id);
  return origine && parseFloat(trasferimentoForm.value.importo) > parseFloat(origine.saldo);
});

const resetForm = () => {
  feedback.value = null;
  scheduleMode.value = 'today';
  programmazione.value = 'nessuna';
  mostraProgrammazione.value = false;
  initialPayment.value = 0;
  paymentCount.value = 3;
  annualRate.value = 0;
  senzaTermine.value = false;
  form.value = {
    tipo: props.tipo === 'trasferimento' ? 'entrata' : props.tipo,
    importo: null,
    categoria: null,
    conto_id: contiStore.contiAttivi[0]?.id || null,
    data: dayjs().format('YYYY-MM-DD'),
    descrizione: '',
    natura_entrata: 'sconosciuto',
    periodicita_entrata: 'sconosciuta',
    ricorrente: false,
    ricorrente_frequenza: 'mensile',
    ricorrente_giorno: dayjs().date(),
    ricorrente_mese: dayjs().month() + 1,
    ricorrente_occorrenze_rimanenti: 12,
  };
  trasferimentoForm.value = {
    conto_origine_id: contiStore.contiAttivi[0]?.id || null,
    conto_destinazione_id: contiStore.contiAttivi[1]?.id || null,
    importo: null,
    data: dayjs().format('YYYY-MM-DD'),
    nota: '',
  };
  step.value = isTrasferimento.value || isEdit.value || props.saltaSceltaTipo ? 2 : 1;
  if (props.modalitaProgrammate) {
    programmazione.value = 'una_volta';
    scheduleMode.value = 'scheduled';
    mostraProgrammazione.value = true;
    form.value.data = dayjs().add(1, 'day').format('YYYY-MM-DD');
  }
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
        natura_entrata: props.movimento.natura_entrata || 'sconosciuto',
        periodicita_entrata: props.movimento.periodicita_entrata || 'sconosciuta',
        ricorrente: props.movimento.ricorrente,
        ricorrente_frequenza: normalizzaFrequenza(props.movimento.ricorrente_frequenza),
        ricorrente_giorno: props.movimento.ricorrente_giorno || 1,
        ricorrente_mese: props.movimento.ricorrente_mese || 1,
        ricorrente_occorrenze_rimanenti: props.movimento.ricorrente_occorrenze_rimanenti ?? 12,
      };
      senzaTermine.value = props.movimento.ricorrente_frequenza === 'mensile'
        && props.movimento.ricorrente_occorrenze_rimanenti == null;
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
  if (tipo === 'entrata' && scheduleMode.value === 'installments') scheduleMode.value = 'today';
  step.value = 2;
};

const selectScheduleMode = (mode) => {
  const previousMode = scheduleMode.value;
  scheduleMode.value = mode;
  if (mode === 'today') form.value.data = dayjs().format('YYYY-MM-DD');
  if (mode === 'scheduled' && previousMode !== mode) form.value.data = dayjs().add(1, 'day').format('YYYY-MM-DD');
  if (mode === 'installments' && previousMode !== mode) form.value.data = dayjs().add(1, 'month').format('YYYY-MM-DD');
};

const selectProgrammazione = (value) => {
  programmazione.value = value;
  form.value.ricorrente = ['mensile', 'settimanale', 'annuale'].includes(value);
  if (form.value.tipo === 'entrata') {
    form.value.periodicita_entrata = form.value.ricorrente ? 'ricorrente' : 'sconosciuta';
  }

  if (value === 'una_volta') {
    selectScheduleMode('scheduled');
  } else if (value === 'rate') {
    selectScheduleMode('installments');
  } else {
    selectScheduleMode('today');
    if (form.value.ricorrente) {
      form.value.ricorrente_frequenza = value;
      if (value === 'mensile') {
        form.value.ricorrente_occorrenze_rimanenti = 12;
        senzaTermine.value = false;
      }
      const oggi = dayjs();
      if (value === 'mensile') form.value.ricorrente_giorno = oggi.add(1, 'month').date();
      if (value === 'settimanale') {
        const weekday = oggi.add(1, 'week').day();
        form.value.ricorrente_giorno = weekday === 0 ? 7 : weekday;
      }
      if (value === 'annuale') {
        form.value.ricorrente_giorno = oggi.date();
        form.value.ricorrente_mese = oggi.month() + 1;
      }
    }
  }
};

const toggleMostraProgrammazione = () => {
  if (mostraProgrammazione.value) selectProgrammazione('nessuna');
  mostraProgrammazione.value = !mostraProgrammazione.value;
};

const salva = async () => {
  loading.value = true;
  feedback.value = null;
  try {
    let messaggio;

    if (isTrasferimento.value) {
      await contiStore.trasferimento({ ...trasferimentoForm.value });
      messaggio = 'Trasferimento completato!';
    } else if (isEdit.value) {
      await movimentiStore.updateMovimento(props.movimento.id, buildUpdatePayload());
      messaggio = 'Movimento aggiornato!';
    } else {
      if (scheduleMode.value === 'scheduled') {
        await scheduledPaymentsStore.createPayment({
          type: form.value.tipo,
          amount: form.value.importo,
          category: form.value.categoria,
          account_id: form.value.conto_id,
          description: form.value.descrizione,
          due_date: form.value.data,
        });
        messaggio = 'Pagamento programmato!';
      } else if (scheduleMode.value === 'installments') {
        await scheduledPaymentsStore.createInstallmentPlan({
          purchase_amount: form.value.importo,
          initial_payment: initialPayment.value || 0,
          payment_count: paymentCount.value,
          annual_rate: annualRate.value || 0,
          first_due_date: form.value.data,
          category: form.value.categoria,
          account_id: form.value.conto_id,
          description: form.value.descrizione,
        });
        messaggio = 'Piano a rate creato!';
      } else {
        await movimentiStore.createMovimento(buildUpdatePayload());
        messaggio = form.value.ricorrente ? 'Movimento programmato!' : 'Movimento salvato!';
      }
    }

    // Il dialogo nativo vive sopra la pagina e copre i toast globali. Mostrare
    // l'esito qui lo rende visibile anche durante l'aggiornamento dei riepiloghi.
    feedback.value = { type: 'success', message: messaggio };

    // Da qui in poi il movimento è già registrato sul server. Ricaricare saldi
    // e patrimonio serve solo a ciò che si vede: se fallisce, il salvataggio
    // resta valido e va comunicato come riuscito, altrimenti l'utente lo
    // ripete credendo che non sia andato a buon fine.
    const selectedAccount = contiStore.contiAttivi.find((account) => account.id === form.value.conto_id);
    const transferUsesBettingAccount = isTrasferimento.value && [
      trasferimentoForm.value.conto_origine_id,
      trasferimentoForm.value.conto_destinazione_id,
    ].some((id) => contiStore.contiAttivi.find((account) => account.id === id)?.tipo === 'scommesse');
    toastStore.success(messaggio);
    emit('saved');
    emit('close');

    // Il server ha già confermato la scrittura: la ricarica dei dati può
    // proseguire in background senza trattenere la conferma o la chiusura.
    void contiStore.refreshDopoScrittura(
      transferUsesBettingAccount || selectedAccount?.tipo === 'scommesse',
    ).then((vistaAggiornata) => {
      if (!vistaAggiornata) toastStore.warning(VISTA_NON_AGGIORNATA);
    });
  } catch (err) {
    feedback.value = { type: 'error', message: extractErrorMessage(err) };
  } finally {
    loading.value = false;
  }
};

const cambiaRicorrenza = async (stato) => {
  loading.value = true;
  feedback.value = null;
  try {
    await api.patch(`/movimenti/${props.movimento.id}/ricorrenza/stato`, { stato });
    const messaggio = stato === 'sospesa' ? 'Programmazione sospesa' : stato === 'attiva' ? 'Programmazione riattivata' : 'Programmazione terminata';
    feedback.value = { type: 'success', message: messaggio };
    emit('saved');
    emit('close');
    toastStore.success(messaggio);
  } catch (err) {
    feedback.value = { type: 'error', message: extractErrorMessage(err) };
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
  const baseValid = form.value.importo > 0 && form.value.categoria && form.value.conto_id;
  if (!baseValid) return false;
  if (scheduleMode.value === 'installments') {
    return !!installmentPreview.value && form.value.data >= dayjs().format('YYYY-MM-DD');
  }
  if (form.value.ricorrente && form.value.ricorrente_frequenza === 'mensile' && !senzaTermine.value) {
    return Number.isInteger(form.value.ricorrente_occorrenze_rimanenti)
      && form.value.ricorrente_occorrenze_rimanenti >= 1
      && form.value.ricorrente_occorrenze_rimanenti <= 600;
  }
  return scheduleMode.value !== 'scheduled' || form.value.data >= dayjs().format('YYYY-MM-DD');
});

/** Nessun conto disponibile: il movimento non avrebbe dove essere registrato. */
const senzaConti = computed(() => contiSelezionabili.value.length === 0);
/** Il trasferimento richiede due conti distinti. */
const contiInsufficientiPerTrasferimento = computed(() => contiStore.contiAttivi.length < 2);

const vaiAiConti = () => {
  emit('close');
  router.push('/conti');
};

const titolo = computed(() => {
  if (isTrasferimento.value) return 'Sposta soldi';
  if (isEdit.value) return 'Modifica movimento';
  return 'Nuovo movimento';
});

// Una sola shell per tutti i punti di apertura: il dialog nativo gestisce da
// solo il layout a bottom sheet sotto i 768px via media query. Prima la scelta
// dipendeva da un ref JS aggiornato sul resize, che cambiando componente a
// caldo distruggeva e ricreava il dialog gia' aperto.
const shellProps = computed(() => ({ open: props.open, title: titolo.value }));
</script>

<template>
  <component
    :is="AppDialog"
    v-bind="shellProps"
    @close="$emit('close')"
  >
    <p
      v-if="feedback"
      class="form-feedback"
      :class="`form-feedback--${feedback.type}`"
      :role="feedback.type === 'error' ? 'alert' : 'status'"
      :aria-live="feedback.type === 'error' ? 'assertive' : 'polite'"
      aria-atomic="true"
    >
      {{ feedback.message }}
    </p>

    <!-- Trasferimento -->
    <div v-if="isTrasferimento" class="form-space">
      <p class="form-intro">
        Sposta soldi fra due tuoi conti WALLT. Non viene conteggiato come spesa o entrata.
      </p>

      <div v-if="contiInsufficientiPerTrasferimento" class="prereq">
        <p class="prereq__text">
          Per un trasferimento servono due conti diversi. Creane un altro e poi torna qui.
        </p>
        <WButton variant="secondary" size="sm" @click="vaiAiConti">Vai a I miei conti</WButton>
      </div>

      <div class="field">
        <label>Da</label>
        <select v-model="trasferimentoForm.conto_origine_id" class="form-select">
          <option v-for="c in contiStore.contiAttivi" :key="c.id" :value="c.id">
            {{ c.nome }} (€{{ parseFloat(c.saldo).toFixed(2) }})
          </option>
        </select>
      </div>
      <div class="transfer-arrow">→</div>
      <div class="field">
        <label>A</label>
        <select v-model="trasferimentoForm.conto_destinazione_id" class="form-select">
          <option v-for="c in contiDestinazione" :key="c.id" :value="c.id">
            {{ c.nome }}
          </option>
        </select>
      </div>
      <div class="field">
        <label>Importo €</label>
        <input v-model.number="trasferimentoForm.importo" type="number" min="0" step="0.01" class="form-input form-input--lg" inputmode="decimal" />
        <p class="error-text error-text--reserved">{{ saldoInsufficiente ? 'Saldo insufficiente' : '' }}</p>
      </div>
      <div class="field">
        <label>Data</label>
        <input v-model="trasferimentoForm.data" type="date" class="form-input" />
      </div>
      <div class="field">
        <label>Note (opzionale)</label>
        <input v-model="trasferimentoForm.nota" type="text" class="form-input" placeholder="Descrizione..." />
      </div>
      <WButton class="form-save" variant="primary" size="lg" :loading="loading" :disabled="!canSave" @click="salva">
        Sposta soldi
      </WButton>
    </div>

    <!-- Movimento entrata/uscita -->
    <div v-else class="form-space">
      <div v-if="senzaConti" class="prereq">
        <p class="prereq__text">
          Serve prima un conto: è la “tasca” su cui viene registrato il movimento e di cui
          viene aggiornato il saldo. Aprendo I miei conti questo form si chiude e
          quanto hai già scritto qui non viene salvato.
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
        <div v-if="!isEdit && modalitaProgrammate" class="field">
          <label>Come vuoi programmarlo?</label>
          <div class="programmazione-grid" role="group" aria-label="Tipo di programmazione">
            <button v-for="opzione in [
              { id: 'una_volta', label: 'Una data', detail: 'Un solo pagamento futuro' },
              { id: 'mensile', label: 'Ogni mese', detail: 'Ripeti ogni mese' },
              { id: 'settimanale', label: 'Ogni settimana', detail: 'Ripeti ogni settimana' },
              { id: 'annuale', label: 'Ogni anno', detail: 'Ripeti ogni anno' },
              ...(form.tipo === 'uscita' ? [{ id: 'rate', label: 'A rate', detail: 'Dividi in più pagamenti' }] : []),
            ]" :key="opzione.id" type="button" class="programmazione-option" :class="{ 'programmazione-option--active': programmazione === opzione.id }" @click="selectProgrammazione(opzione.id)">
              <strong>{{ opzione.label }}</strong><span>{{ opzione.detail }}</span>
            </button>
          </div>
        </div>

        <div v-if="!isEdit && !modalitaProgrammate" class="field">
          <button type="button" class="programmazione-toggle" :aria-expanded="mostraProgrammazione" @click="toggleMostraProgrammazione">
            {{ mostraProgrammazione ? 'Nascondi programmazione' : 'Programmare questo movimento' }}
          </button>
          <select v-if="mostraProgrammazione" id="programmazione-movimento" :value="programmazione" class="form-select" @change="selectProgrammazione($event.target.value)">
            <option value="nessuna">Solo questo movimento</option>
            <option value="una_volta">Una volta, in una data futura</option>
            <option value="mensile">Ogni mese</option>
            <option value="settimanale">Ogni settimana</option>
            <option value="annuale">Ogni anno</option>
            <option v-if="form.tipo === 'uscita'" value="rate">A rate</option>
          </select>
        </div>

        <div class="field">
          <label>{{ scheduleMode === 'installments' ? 'Costo totale €' : 'Importo €' }}</label>
          <input v-model.number="form.importo" type="number" min="0" step="0.01" class="form-input form-input--lg" inputmode="decimal" placeholder="0.00" />
        </div>

        <template v-if="scheduleMode === 'installments' && !isEdit">
          <div class="field">
            <label>Quanto paghi oggi? €</label>
            <input v-model.number="initialPayment" type="number" min="0" :max="form.importo || undefined" step="0.01" class="form-input" inputmode="decimal" />
          </div>
          <div class="field">
            <label>Numero totale dei pagamenti</label>
            <input v-model.number="paymentCount" type="number" min="1" max="600" step="1" class="form-input" />
            <small v-if="initialPayment > 0">Include il pagamento di oggi.</small>
          </div>
          <div class="field">
            <label>Tasso annuo (%)</label>
            <input v-model.number="annualRate" type="number" min="0" max="1000" step="0.01" class="form-input" inputmode="decimal" />
          </div>
          <div v-if="installmentPreview" class="installment-preview">
            <strong>Riepilogo rate</strong>
            <p v-if="Number(installmentPreview.initialPayment) > 0">Oggi: €{{ installmentPreview.initialPayment }}</p>
            <p v-for="(payment, index) in installmentPreview.payments" :key="index">Rata {{ index + 1 }}: €{{ payment }}</p>
            <p>Totale da pagare: €{{ installmentPreview.totalRepayment }}</p>
            <p>Interessi stimati: €{{ installmentPreview.interestTotal }}</p>
          </div>
          <p v-else class="error-text">Controlla costo, pagamento iniziale e numero dei pagamenti.</p>
        </template>

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
          <HelpNote
            always-open
            text="Scegli il conto su cui registrare l'entrata o l'uscita. Il salvataggio aggiorna il suo saldo."
          />
        </div>

        <div v-if="scheduleMode === 'scheduled' || scheduleMode === 'installments' || isEdit" class="field">
          <label>{{ scheduleMode === 'installments' ? 'Data della prima rata' : scheduleMode === 'scheduled' ? 'Data del pagamento' : 'Data' }}</label>
          <input v-model="form.data" type="date" class="form-input" :min="scheduleMode === 'today' ? undefined : dayjs().format('YYYY-MM-DD')" />
        </div>

        <div class="field">
          <label>Descrizione (opzionale)</label>
          <input v-model="form.descrizione" type="text" class="form-input" placeholder="Descrizione..." />
        </div>

        <div v-if="form.tipo === 'entrata' && isEdit" class="field">
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

        <div v-if="form.tipo === 'entrata' && isEdit" class="field">
          <label>Periodicità dell'entrata</label>
          <select v-model="form.periodicita_entrata" class="form-select">
            <option value="sconosciuta">Non specificata</option>
            <option value="ricorrente">Regolare o prevedibile</option>
            <option value="occasionale">Occasionale</option>
          </select>
        </div>

        <div v-if="isEdit" class="field">
          <label class="toggle-label">
            <input v-model="form.ricorrente" type="checkbox" />
            Movimento programmato
          </label>
        </div>

        <div v-if="form.ricorrente" class="field">
          <label v-if="isEdit">Frequenza</label>
          <div class="ricorrente-fields">
            <select v-if="isEdit" v-model="form.ricorrente_frequenza" class="form-select ricorrente-fields__frequenza">
              <option value="mensile">Ogni mese</option>
              <option value="settimanale">Ogni settimana</option>
              <option value="annuale">Ogni anno</option>
            </select>

            <select v-if="form.ricorrente_frequenza === 'settimanale'" v-model.number="form.ricorrente_giorno" class="form-select ricorrente-fields__frequenza">
              <option v-for="g in GIORNI_SETTIMANA" :key="g.id" :value="g.id">{{ g.label }}</option>
            </select>

            <template v-else-if="form.ricorrente_frequenza === 'annuale'">
              <select v-model.number="form.ricorrente_mese" class="form-select">
                <option v-for="m in MESI_ANNO" :key="m.id" :value="m.id">{{ m.label }}</option>
              </select>
              <input v-model.number="form.ricorrente_giorno" type="number" min="1" max="31" class="form-input" placeholder="Giorno (es. 1)" />
            </template>

          </div>
          <template v-if="form.ricorrente_frequenza === 'mensile'">
            <MonthlySchedulePicker
              v-model="form.ricorrente_giorno"
              :occurrences="form.ricorrente_occorrenze_rimanenti"
              :unlimited="senzaTermine"
            />
            <div class="monthly-count">
              <label for="movimento-ricorrenza-occorrenze">Numero di scadenze future</label>
              <input
                id="movimento-ricorrenza-occorrenze"
                v-model.number="form.ricorrente_occorrenze_rimanenti"
                type="number"
                min="1"
                max="600"
                step="1"
                class="form-input"
                :disabled="senzaTermine"
                inputmode="numeric"
              />
              <label v-if="isEdit" class="monthly-count__unlimited">
                <input v-model="senzaTermine" type="checkbox" />
                Continua ogni mese finché non la sospendo
              </label>
            </div>
          </template>
          <HelpNote topic="movimento-ricorrenza" label="Come funziona la programmazione" />
          <div v-if="isEdit && props.movimento.ricorrente" class="ricorrenza-actions">
            <span>Stato: {{ props.movimento.stato_ricorrenza || 'attiva' }}</span>
            <button v-if="props.movimento.stato_ricorrenza === 'sospesa'" type="button" :disabled="loading" @click="cambiaRicorrenza('attiva')">Riprendi</button>
            <button v-if="!props.movimento.stato_ricorrenza || props.movimento.stato_ricorrenza === 'attiva'" type="button" :disabled="loading" @click="cambiaRicorrenza('sospesa')">Sospendi</button>
            <button v-if="props.movimento.stato_ricorrenza !== 'terminata'" type="button" :disabled="loading" @click="cambiaRicorrenza('terminata')">Termina definitivamente</button>
          </div>
        </div>

        <WButton class="form-save" variant="primary" size="lg" :loading="loading" :disabled="!canSave" @click="salva">
          Salva
        </WButton>
      </div>
    </div>
  </component>
</template>

<style scoped>
.ricorrenza-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 0.75rem; margin-top: 0.75rem; font-size: var(--text-sm); }
.programmazione-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; }
.programmazione-option { display: flex; flex-direction: column; align-items: flex-start; gap: 0.2rem; padding: 0.75rem; border: 1px solid var(--glass-interactive-border); border-radius: var(--radius-md); background: var(--glass-interactive-bg); color: var(--text-primary); text-align: left; cursor: pointer; }
.programmazione-option strong { font-size: var(--text-xs); }
.programmazione-option span { color: var(--text-muted); font-size: var(--text-xs); }
.programmazione-option--active { border-color: var(--accent-green); background: color-mix(in srgb, var(--accent-green) 10%, transparent); }
.programmazione-toggle { color: var(--accent-green); font-size: var(--text-xs); font-weight: 600; text-align: left; text-decoration: underline; }
.ricorrenza-actions button { color: var(--text-primary); text-decoration: underline; }
.monthly-count { display: grid; gap: 0.4375rem; }
.monthly-count > label:first-child { color: var(--text-muted); font-size: var(--text-xs); font-weight: 600; }
.monthly-count__unlimited { display: flex; align-items: center; gap: 0.5rem; color: var(--text-secondary); font-size: var(--text-xs); }
.form-feedback {
  margin: 0 0 1rem;
  padding: 0.75rem 1rem;
  border: 1px solid var(--glass-elevated-border);
  border-radius: var(--radius-lg);
  font-size: var(--text-xs);
  font-weight: 600;
  line-height: 1.35;
}
.form-feedback--success {
  color: var(--positive);
  border-color: color-mix(in srgb, var(--positive) 40%, var(--glass-elevated-border));
  background: color-mix(in srgb, var(--positive) 8%, var(--glass-elevated-bg));
}
.form-feedback--error {
  color: var(--negative);
  border-color: color-mix(in srgb, var(--negative) 40%, var(--glass-elevated-border));
  background: color-mix(in srgb, var(--negative) 8%, var(--glass-elevated-bg));
}
.form-space { display: flex; flex-direction: column; gap: 1.125rem; }
.form-save { margin-top: 0.5rem; }
.form-intro { font-size: var(--text-xs); line-height: var(--leading-normal); color: var(--text-muted); }
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
   Qui restano solo le varianti specifiche del form movimento. */
.form-input--lg {
  font-size: 2rem;
  font-weight: 700;
  letter-spacing: var(--tracking-display);
  text-align: center;
  padding: 1rem;
  font-variant-numeric: tabular-nums;
}
.tipo-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.625rem; }
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

/* --- Selettore categoria -------------------------------------------------
   E' il controllo piu' usato del form: griglia scorrevole con ricerca sopra.
   Lo stato selezionato si legge dal bordo tinto e dalla pastiglia dell'icona,
   non da un fondo pieno che coprirebbe l'etichetta. */
.cat-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  grid-auto-rows: minmax(5.75rem, auto);
  gap: 0.4375rem;
  margin-top: 0.5rem;
  padding: 0.5rem;
  max-height: 300px;
  overflow-y: auto;
  border-radius: var(--radius-lg);
  border: 1px solid var(--glass-secondary-border);
  background: var(--glass-secondary-bg);
  /* Per le regole CSS sull'overflow, impostare solo overflow-y a un valore
     diverso da visible porta overflow-x ad "auto": la griglia diventava
     trascinabile lateralmente. Va dichiarato esplicitamente. */
  overflow-x: hidden;
  /* Arrivati a fine corsa il gesto non deve proseguire sugli antenati:
     e' il concatenamento che faceva sembrare trascinato tutto il dialog. */
  overscroll-behavior: contain;
  touch-action: pan-y;
}
.cat-btn {
  display: flex; flex-direction: column; align-items: center; gap: 0.3125rem;
  padding: 0.625rem 0.375rem; border-radius: var(--radius-md);
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
/* outline invece di box-shadow: .cat-grid ha overflow-x: hidden apposta
   per bloccare il trascinamento laterale, e taglierebbe l'alone. outline
   non viene ritagliato dall'overflow. */
.cat-btn:focus-visible { outline: 2px solid var(--border-focus); outline-offset: 2px; }
.cat-btn.active {
  border-color: color-mix(in srgb, var(--cat-color, var(--accent-green)) 45%, transparent);
  background: color-mix(in srgb, var(--cat-color, var(--accent-green)) 12%, transparent);
  color: var(--text-primary);
}
/* Un grid item vale di default min-width: auto, quindi una categoria dal
   nome lungo allargava la colonna oltre 1fr e mandava la griglia in
   overflow orizzontale. E' la causa vera del trascinamento laterale. */
.cat-btn { min-width: 0; }
/* Stesso trattamento del contenitore icona delle card conto: pastiglia
   squadrata, fondo tinto dal colore dell'elemento, bordo sottile e riflesso
   interno. Cambiano solo le proporzioni, il linguaggio e' quello. */
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
  word-break: keep-all;
  overflow-wrap: normal;
  hyphens: none;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  overflow: hidden;
  text-overflow: ellipsis;
}
.cat-btn.active .cat-label { color: var(--text-primary); font-weight: 600; }
@media (max-width: 480px) {
  .cat-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
}
.transfer-arrow { text-align: center; font-size: 1.25rem; color: var(--accent-text); opacity: 0.7; }
.error-text { color: var(--negative); font-size: var(--text-xs); margin-top: 0.25rem; }
/* Lo spazio resta occupato anche senza messaggio: comparendo e sparendo
   spingerebbe in basso i campi sottostanti. */
.error-text--reserved { min-height: 1.125rem; }
/* Piu' specifica di `.field label`, altrimenti erediterebbe il maiuscoletto
   delle etichette di campo: qui l'etichetta e' una frase, non un titolo. */
.field .toggle-label {
  display: flex; align-items: center; gap: 0.625rem; cursor: pointer;
  font-size: 0.875rem; font-weight: 400; color: var(--text-primary);
  text-transform: none; letter-spacing: var(--tracking-tight);
  margin-bottom: 0;
}
.ricorrente-fields { display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; margin-top: 0.625rem; }
.ricorrente-fields__frequenza { grid-column: 1 / -1; }
.installment-preview { padding: 0.875rem; border: 1px solid var(--glass-secondary-border); border-radius: var(--radius-lg); background: var(--glass-secondary-bg); font-size: var(--text-xs); color: var(--text-secondary); }
.installment-preview strong { color: var(--text-primary); }
.installment-preview p { margin: 0.35rem 0 0; }
.field small { color: var(--text-muted); font-size: var(--text-xs); }
</style>
