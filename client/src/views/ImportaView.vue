<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import dayjs from 'dayjs';

import WCard from '@/components/common/WCard.vue';
import WButton from '@/components/common/WButton.vue';
import WModal from '@/components/common/WModal.vue';

import { useImportazioniStore } from '@/stores/importazioni.store';
import { useToastStore } from '@/stores/toast.store';
import { useContiStore } from '@/stores/conti.store';
import { useMovimentiStore } from '@/stores/movimenti.store';

import { CATEGORIE_ENTRATA, CATEGORIE_USCITA } from '@/utils/categorie';
import { useValuta } from '@/composables/useValuta';
import { Paperclip, Wallet, Info } from '@/utils/appIcons';
import { refreshAfterWrite, VISTA_NON_AGGIORNATA } from '@/utils/afterWrite';
import HelpTrigger from '@/components/help/HelpTrigger.vue';
import HelpNote from '@/components/help/HelpNote.vue';

const router = useRouter();
const toastStore = useToastStore();
const importazioniStore = useImportazioniStore();
const contiStore = useContiStore();
const movimentiStore = useMovimentiStore();
const { formatValuta } = useValuta();

const fileInputRef = ref(null);
const dragActive = ref(false);

// Stato locale per rendere editabili le righe dell’anteprima
const items = ref([]);
const previewWarnings = ref([]);

const confirmOpen = ref(false);
const contoDefault = ref(null);
const importMode = ref('movimenti_e_saldo');

const allowedExtensions = ['.csv', '.xls', '.xlsx'];
const MAX_SIZE_MB = 5;

const isImporting = computed(() => importazioniStore.loading);

const hasConti = computed(() => contiStore.contiAttivi.length > 0);

const isUploading = ref(false);

const importabiliCount = computed(() => (
  items.value.filter((i) => !i.isDuplicate && i.conto_id_finale && i.categoria_finale).length
));

const missingRequiredCount = computed(() => (
  items.value.filter((i) => !i.isDuplicate && (
    !i.conto_id_finale || (i.categoria_finale === null || i.categoria_finale === undefined)
  )).length
));

const canConfirm = computed(() => importabiliCount.value > 0);

const transactionsPayload = computed(() => (
  items.value
    .filter((i) => !i.isDuplicate && i.conto_id_finale && i.categoria_finale)
    .map((i) => ({
      clientTxId: i.clientTxId,
      data: i.data,
      descrizione: i.descrizione,
      importo: i.importo,
      tipo: i.tipo,
      conto_id: i.conto_id_finale,
      categoria_finale: i.categoria_finale,
      categoria_suggerita: i.categoria_suggerita ?? null,
      categoria_automatica: !!i.categoria_automatica,
      categoria_confidenza: i.categoria_confidenza ?? null,
      merchant_finale: i.merchant_finale?.trim() || null,
      merchant: i.merchant ?? null,
      merchant_id_finale: i.merchant_id_finale ?? null,
      merchant_id: i.merchant_id ?? null,
      balance: i.balance ?? null,
    }))
));

const formatDate = (isoDate) => (isoDate ? dayjs(isoDate).format('DD/MM/YYYY') : '');

const formatTipo = (tipo) => (tipo === 'entrata' ? 'Entrata' : 'Uscita');

const openFilePicker = () => {
  fileInputRef.value?.click();
};

const validateFile = (file) => {
  const ext = file.name ? file.name.slice(file.name.lastIndexOf('.')).toLowerCase() : '';
  if (!allowedExtensions.includes(ext)) {
    return `Formato file non supportato (${ext || 'sconosciuto'}). Usa .csv o .xls/.xlsx`;
  }
  const maxBytes = MAX_SIZE_MB * 1024 * 1024;
  if (file.size > maxBytes) {
    return `File troppo grande (max ${MAX_SIZE_MB}MB)`;
  }
  return null;
};

const resetState = () => {
  items.value = [];
  previewWarnings.value = [];
  previewSummary.value = null;
  confirmOpen.value = false;
  importazioniStore.clear();
};

const hydrateEditableItems = (previewItems) => {
  const defaultContoId = contoDefault.value ?? contiStore.contiAttivi[0]?.id ?? null;
  return previewItems.map((i) => ({
    ...i,
    conto_id_finale: i.conto_id ?? defaultContoId,
    categoria_finale: i.categoria_suggerita ?? null,
    merchant_finale: i.merchant ?? '',
    merchant_id_finale: i.merchant_id ?? null,
  }));
};

const applyContoToAll = () => {
  if (!contoDefault.value) return;
  items.value.forEach((row) => {
    if (!row.isDuplicate) row.conto_id_finale = contoDefault.value;
  });
};

const confidenceLabel = (conf) => {
  if (conf === null || conf === undefined) return null;
  if (conf >= 90) return { label: `Alta (${conf})`, cls: 'badge--conf-high' };
  if (conf >= 60) return { label: `Media (${conf})`, cls: 'badge--conf-mid' };
  return { label: `Bassa (${conf})`, cls: 'badge--conf-low' };
};

const sourceLabel = (fonte) => {
  const map = {
    user: 'Regola tua',
    merchant: 'Merchant',
    global: 'Regola WALLT',
    history: 'Storico',
    ai_local: 'AI locale',
    openai: 'AI avanzata',
    knowledge: 'AI locale',
    ai_default: 'Stima AI',
    fallback: 'Keyword',
    default: 'Default',
    unverified: 'Da verificare',
    revolut: 'Revolut',
    ai_local: 'AI locale',
    ai_openai: 'AI avanzata',
    lookup_google_places: 'Google Places',
    lookup_openstreetmap: 'OpenStreetMap',
    lookup_foursquare: 'Foursquare',
  };
  return map[fonte] || 'Automatica';
};

const previewSummary = ref(null);

const handleFile = async (file) => {
  const error = validateFile(file);
  if (error) {
    toastStore.error(error);
    return;
  }

  isUploading.value = true;
  try {
    await contiStore.fetchConti();
    if (!contiStore.contiAttivi.length) {
      toastStore.error('Crea prima un conto in I miei conti, poi potrai importare l\'estratto.');
      return;
    }
    contoDefault.value = contiStore.contiAttivi[0]?.id ?? null;

    await importazioniStore.upload(file);
    const preview = importazioniStore.preview;

    if (!preview || !Array.isArray(preview.items)) {
      toastStore.error('Anteprima non disponibile');
      return;
    }

    items.value = hydrateEditableItems(preview.items);
    previewWarnings.value = preview.warnings || [];
    previewSummary.value = preview.summary || null;
  } catch (e) {
    toastStore.error(importazioniStore.error || e.response?.data?.message || e.message || 'Errore importazione');
  } finally {
    isUploading.value = false;
  }
};

const onDropzoneClick = () => {
  if (!hasConti.value || isUploading.value) return;
  openFilePicker();
};

const onDrop = async (e) => {
  e.preventDefault();
  dragActive.value = false;
  const file = e.dataTransfer?.files?.[0];
  if (file) await handleFile(file);
};

const onFileChange = async (e) => {
  const file = e.target.files?.[0];
  if (file) await handleFile(file);
  // Reset input per consentire re-upload dello stesso file
  e.target.value = '';
};

const categoriaOptions = (tipo) => (
  tipo === 'entrata' ? CATEGORIE_ENTRATA : CATEGORIE_USCITA
);

const categoriaLabelFromId = (tipo, categoriaId) => {
  if (!categoriaId) return '';
  const opts = categoriaOptions(tipo);
  const found = opts.find((c) => c.id === categoriaId);
  return found ? `${found.emoji} ${found.nome}` : categoriaId;
};

const onConfirm = async () => {
  confirmOpen.value = false;

  const payload = transactionsPayload.value;
  if (!payload.length) {
    toastStore.error('Nessuna transazione importabile');
    return;
  }

  let result;
  try {
    result = await importazioniStore.conferma(payload, {
      aggiornaSaldo: importMode.value === 'movimenti_e_saldo',
    });
  } catch (e) {
    toastStore.error(importazioniStore.error || e.message || 'Errore conferma importazione');
    return;
  }

  // L'import è concluso: le transazioni sono sul server. Tutto quello che
  // segue riguarda solo l'aggiornamento della schermata e non può più
  // trasformarsi in un messaggio di errore, altrimenti l'utente riprova un
  // import già andato a buon fine e si ritrova le righe duplicate.
  const dates = payload.map((t) => t.data).filter(Boolean).sort();
  const da = dates[0];
  const a = dates[dates.length - 1];
  const oggi = dayjs();
  const periodo = da && a
    ? { da, a }
    : { da: oggi.startOf('month').format('YYYY-MM-DD'), a: oggi.endOf('month').format('YYYY-MM-DD') };

  const vistaAggiornata = await refreshAfterWrite(
    () => contiStore.fetchConti(),
    () => contiStore.fetchPatrimonio(),
    () => movimentiStore.fetchMovimenti(periodo),
  );

  const importati = result?.importati ?? payload.length;
  const saltati = (result?.duplicateSaltati ?? 0) + (result?.incompletiSaltati ?? 0);
  const msg = saltati > 0
    ? `${importati} transazioni importate (${saltati} saltate)`
    : `${importati} transazioni importate`;
  toastStore.success(msg);
  if (!vistaAggiornata) toastStore.warning(VISTA_NON_AGGIORNATA);

  resetState();
  router.push(da && a ? { path: '/movimenti', query: { da, a } } : '/movimenti');
};

onMounted(async () => {
  await contiStore.fetchConti();
  contoDefault.value = contiStore.contiAttivi[0]?.id ?? null;
});
</script>

<template>
  <div class="import-view animate-fade-in">
    <header class="page-header">
      <div>
        <div class="page-title-row">
          <h1 class="page-title">Importa estratto conto</h1>
          <HelpTrigger topic="import-come-funziona" />
        </div>
        <p class="page-sub">Carica un file CSV/XLS/XLSX, rivedi l’anteprima e conferma l’importazione.</p>
      </div>
    </header>

    <WCard class="section-card import-prereq" :class="{ 'import-prereq--warn': !hasConti }">
      <div class="import-prereq__icon" aria-hidden="true">
        <Wallet v-if="!hasConti" :size="22" :stroke-width="1.75" />
        <Info v-else :size="22" :stroke-width="1.75" />
      </div>
      <div class="import-prereq__body">
        <p class="import-prereq__title">
          {{ hasConti ? 'Dove finiscono i movimenti' : 'Prima crea un conto' }}
        </p>
        <p class="import-prereq__text">
          <template v-if="hasConti">
            Le transazioni importate vengono associate al conto che scegli in anteprima
            (es. il conto corrente della tua banca). Se non l'hai ancora aggiunto, crea prima il conto in
            <button type="button" class="import-prereq__inline-link" @click="router.push('/conti')">I miei conti</button>.
          </template>
          <template v-else>
            Per importare un estratto conto serve un conto WALLT — ad esempio «Conto Intesa» o «Revolut» —
            dove registrare i movimenti della banca. Crealo in pochi secondi, poi torna qui a caricare il file.
          </template>
        </p>
      </div>
      <WButton
        v-if="!hasConti"
        variant="primary"
        size="sm"
        @click="router.push('/conti')"
      >
        Crea conto
      </WButton>
    </WCard>

    <WCard class="section-card" :class="{ 'section-card--disabled': !hasConti }">
      <input
        ref="fileInputRef"
        type="file"
        class="file-input-hidden"
        accept=".csv,.xls,.xlsx,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        @change="onFileChange"
      />

      <div
        class="dropzone"
        :class="{
          'dropzone--active': dragActive,
          'dropzone--disabled': !hasConti || isUploading,
          'dropzone--loading': isUploading,
        }"
        role="button"
        tabindex="0"
        @click="onDropzoneClick"
        @keydown.enter.prevent="onDropzoneClick"
        @keydown.space.prevent="onDropzoneClick"
        @dragenter.prevent="hasConti && !isUploading && (dragActive = true)"
        @dragover.prevent="hasConti && !isUploading && (dragActive = true)"
        @dragleave.prevent="dragActive = false"
        @drop="hasConti && !isUploading ? onDrop($event) : null"
      >
        <div class="dropzone__content">
          <Paperclip class="dropzone__icon" :size="32" :stroke-width="1.75" />
          <div class="dropzone__title">
            <template v-if="isUploading">Analisi in corso…</template>
            <template v-else-if="hasConti">Trascina qui il file o clicca per selezionarlo</template>
            <template v-else>Crea un conto per iniziare</template>
          </div>
          <div class="dropzone__subtitle">
            <template v-if="hasConti">
              Supporto: <b>.csv</b> e <b>.xls/.xlsx</b> (max {{ MAX_SIZE_MB }}MB)
            </template>
            <template v-else>
              Dopo aver creato il conto potrai caricare il CSV o l'Excel della tua banca.
            </template>
          </div>
          <WButton
            class="dropzone__button"
            variant="secondary"
            size="md"
            :disabled="!hasConti || isUploading"
            :loading="isUploading"
            @click.stop="hasConti ? openFilePicker() : router.push('/conti')"
          >
            {{ hasConti ? 'Seleziona file' : 'Vai a I miei conti' }}
          </WButton>
        </div>
      </div>
    </WCard>

    <div v-if="items.length" class="preview-section">
      <WCard class="section-card">
        <div class="summary">
          <div class="summary__item">
            <div class="summary__label">Nuove</div>
            <div class="summary__value">{{ items.filter((i) => !i.isDuplicate).length }}</div>
          </div>
          <div class="summary__item">
            <div class="summary__label">Duplicate</div>
            <div class="summary__value summary__value--danger">{{ items.filter((i) => i.isDuplicate).length }}</div>
          </div>
          <div class="summary__item">
            <div class="summary__label">Categorizzate</div>
            <div class="summary__value summary__value--ok">{{ previewSummary?.categorizzate ?? items.filter((i) => !i.isDuplicate && i.categoria_suggerita).length }}</div>
          </div>
          <div class="summary__item">
            <div class="summary__label">Merchant</div>
            <div class="summary__value summary__value--ok">{{ previewSummary?.merchant_riconosciuti ?? items.filter((i) => !i.isDuplicate && i.merchant).length }}</div>
          </div>
          <div class="summary__item">
            <div class="summary__label">Da verificare</div>
            <div class="summary__value summary__value--warn">{{ previewSummary?.da_verificare ?? items.filter((i) => !i.isDuplicate && (i.categoria_confidenza ?? 0) < 60).length }}</div>
          </div>
        </div>

        <p class="preview-hint">
          Questa è solo un'anteprima: puoi correggere conto, categoria e merchant riga per riga.
          Niente viene salvato finché non premi «Conferma importazione».
        </p>

        <div v-if="contiStore.contiAttivi.length > 1" class="bulk-conto">
          <label class="bulk-conto__label" for="conto-default">Conto predefinito per tutte le righe</label>
          <select
            id="conto-default"
            v-model="contoDefault"
            class="select bulk-conto__select"
            @change="applyContoToAll"
          >
            <option :value="null" disabled>Seleziona conto</option>
            <option
              v-for="c in contiStore.contiAttivi"
              :key="c.id"
              :value="c.id"
            >
              {{ c.icona }} {{ c.nome }}
            </option>
          </select>
        </div>

        <div v-if="previewWarnings.length" class="warnings">
          <div class="warnings__title">Avvisi</div>
          <ul class="warnings__list">
            <li v-for="w in previewWarnings" :key="`${w.row}-${w.message}`">
              Riga {{ w.row }}: {{ w.message }}
            </li>
          </ul>
        </div>

        <div class="table-wrap">
          <table class="preview-table">
            <thead>
              <tr>
                <th>Data</th>
                <th>Descrizione</th>
                <th>Merchant</th>
                <th>Importo</th>
                <th>Tipo</th>
                <th>Conto</th>
                <th>Categoria</th>
                <th>Stato</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="row in items"
                :key="row.clientTxId"
                :class="{ 'row--duplicate': row.isDuplicate }"
              >
                <td class="td-muted">{{ formatDate(row.data) }}</td>
                <td class="td-desc">
                  <div>{{ row.descrizione }}</div>
                  <div v-if="row.descrizione_pulita && row.descrizione_pulita !== row.descrizione" class="td-desc__clean">
                    {{ row.descrizione_pulita }}
                  </div>
                </td>
                <td>
                  <div v-if="row.isDuplicate" class="td-muted">—</div>
                  <div v-else class="merchant-edit">
                    <div v-if="row.merchant && row.merchant !== row.merchant_finale" class="merchant-pill merchant-pill--suggested">
                      <span class="merchant-pill__name">{{ row.merchant }}</span>
                      <span
                        v-if="confidenceLabel(row.merchant_confidenza)"
                        :class="confidenceLabel(row.merchant_confidenza)?.cls"
                        class="badge badge--inline"
                      >
                        {{ confidenceLabel(row.merchant_confidenza).label }}
                      </span>
                      <span v-if="row.categoria_fonte === 'user'" class="badge badge--source badge--inline">
                        Regola tua
                      </span>
                    </div>
                    <input
                      v-model="row.merchant_finale"
                      type="text"
                      class="input input--merchant"
                      placeholder="Merchant (opzionale)"
                    >
                    <div v-if="row.merchant_indirizzo" class="merchant-address">
                      {{ row.merchant_indirizzo }}
                    </div>
                    <div v-if="row.merchant_motivazione" class="merchant-motivazione" :title="row.merchant_motivazione">
                      {{ row.merchant_motivazione }}
                    </div>
                  </div>
                </td>
                <td :class="{ 'td-positive': row.tipo === 'entrata', 'td-negative': row.tipo === 'uscita' }">
                  {{ row.tipo === 'entrata' ? '+' : '-' }}{{ formatValuta(row.importo) }}
                </td>
                <td>{{ formatTipo(row.tipo) }}</td>

                <td>
                  <select
                    v-if="!row.isDuplicate"
                    v-model="row.conto_id_finale"
                    class="select"
                  >
                    <option :value="null" disabled>Seleziona conto</option>
                    <option
                      v-for="c in contiStore.contiAttivi"
                      :key="c.id"
                      :value="c.id"
                    >
                      {{ c.icona }} {{ c.nome }}
                    </option>
                  </select>
                  <span v-else class="td-muted">—</span>
                </td>

                <td>
                  <div v-if="row.isDuplicate" class="td-muted">—</div>
                  <div v-else class="cat-edit">
                    <div
                      v-if="row.categoria_suggerita"
                      class="cat-pill cat-pill--suggested"
                    >
                      <span class="cat-pill__label">{{ categoriaLabelFromId(row.tipo, row.categoria_suggerita) }}</span>
                      <span
                        v-if="confidenceLabel(row.categoria_confidenza)"
                        :class="confidenceLabel(row.categoria_confidenza)?.cls"
                        class="badge badge--inline"
                      >
                        {{ confidenceLabel(row.categoria_confidenza).label }}
                      </span>
                      <span v-if="row.categoria_fonte" class="badge badge--source badge--inline">
                        {{ sourceLabel(row.categoria_fonte) }}
                      </span>
                    </div>
                    <select
                      v-model="row.categoria_finale"
                      class="select"
                      :disabled="row.isDuplicate"
                    >
                      <option :value="null" disabled>Seleziona categoria</option>
                      <option
                        v-for="c in categoriaOptions(row.tipo)"
                        :key="c.id"
                        :value="c.id"
                      >
                        {{ c.nome }}
                      </option>
                    </select>
                  </div>
                </td>

                <td class="td-status">
                  <span v-if="row.isDuplicate" class="badge badge--duplicate">Duplicata</span>
                  <span v-else-if="row.conto_id_finale && row.categoria_finale" class="badge badge--ready">Importabile</span>
                  <span v-else class="badge badge--blocked">Da completare</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="actions">
          <WButton variant="primary" size="lg" :disabled="!canConfirm" :loading="isImporting" @click="confirmOpen = true">
            Conferma importazione
          </WButton>
          <div v-if="missingRequiredCount" class="actions__hint">
            {{ importabiliCount }} righe pronte. {{ missingRequiredCount }} righe incomplete verranno saltate.
          </div>
        </div>
      </WCard>
    </div>
  </div>

  <WModal :open="confirmOpen" title="Conferma importazione" @close="confirmOpen = false">
    <div class="modal-space">
      <p class="modal-text">
        Stai per importare <b>{{ importabiliCount }}</b> transazioni.
        <span v-if="missingRequiredCount">
          {{ missingRequiredCount }} righe incomplete e le duplicate verranno ignorate.
        </span>
        <span v-else>Le righe duplicate verranno ignorate.</span>
      </p>
      <div class="import-mode">
        <label class="import-mode__option">
          <input v-model="importMode" type="radio" value="solo_movimenti">
          <span>
            <strong>Importa solo movimenti</strong>
            <small>Non modifica il saldo del conto. Usa se il saldo è già corretto.</small>
          </span>
        </label>
        <label class="import-mode__option">
          <input v-model="importMode" type="radio" value="movimenti_e_saldo">
          <span>
            <strong>Importa movimenti e aggiorna saldo</strong>
            <small>
              Il saldo del conto viene ricalcolato e sostituito, non sommato:
              si usa il saldo finale dell'estratto se presente (es. Revolut),
              altrimenti la somma delle entrate e delle uscite registrate su quel conto.
            </small>
          </span>
        </label>
        <p class="import-mode__warn">
          Nel calcolo alternativo non rientrano il saldo iniziale né i trasferimenti tra i tuoi conti:
          con un estratto parziale il saldo ottenuto può non corrispondere a quello della banca.
          Nel dubbio scegli «Importa solo movimenti» e correggi il saldo a mano.
        </p>
        <HelpNote topic="import-modalita-saldo" label="Quale modalità scegliere" />
      </div>
      <div class="modal-actions">
        <WButton variant="secondary" size="md" :disabled="isImporting" @click="confirmOpen = false">
          Annulla
        </WButton>
        <WButton variant="primary" size="md" :loading="isImporting" :disabled="!canConfirm" @click="onConfirm">
          Sì, importa
        </WButton>
      </div>
    </div>
  </WModal>
</template>

<style scoped>
.page-header { margin-bottom: 1rem; }
.page-title-row { display: flex; align-items: center; gap: 0.625rem; flex-wrap: wrap; }
.page-title { font-size: 1.5rem; font-weight: 800; color: var(--text-primary); }
.preview-hint { margin-bottom: 0.875rem; font-size: 0.75rem; line-height: 1.5; color: var(--text-muted); }
.page-sub { color: var(--text-secondary); font-size: 0.875rem; margin-top: 0.25rem; }

.section-card { padding: 1.25rem; }
.section-card--disabled { opacity: 0.85; }

.import-prereq {
  display: flex;
  align-items: flex-start;
  gap: 0.875rem;
  margin-bottom: 1rem;
}
.import-prereq--warn {
  border-color: rgba(251, 191, 36, 0.35);
  background: rgba(251, 191, 36, 0.06);
}
.import-prereq__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 40px;
  height: 40px;
  border-radius: 10px;
  background: var(--accent-light);
  color: var(--accent-green);
}
.import-prereq--warn .import-prereq__icon {
  background: rgba(251, 191, 36, 0.15);
  color: #d97706;
}
.import-prereq__icon svg { stroke: currentColor; }
.import-prereq__body { flex: 1; min-width: 0; }
.import-prereq__title {
  font-size: 0.9375rem;
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: 0.25rem;
}
.import-prereq__text {
  font-size: 0.8125rem;
  line-height: 1.45;
  color: var(--text-secondary);
}
.import-prereq__inline-link {
  background: none;
  border: none;
  padding: 0;
  color: var(--accent-green);
  font-weight: 600;
  font-size: inherit;
  font-family: inherit;
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 2px;
}

.file-input-hidden {
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

.dropzone {
  border: 2px dashed var(--border);
  border-radius: var(--radius-xl);
  padding: 1.75rem 1.25rem;
  background: rgba(255, 255, 255, 0.01);
  cursor: pointer;
  position: relative;
}
.dropzone--active { border-color: var(--accent-green); box-shadow: 0 0 0 4px var(--color-accent-light); }
.dropzone--disabled { cursor: not-allowed; opacity: 0.75; }
.dropzone--loading { pointer-events: none; opacity: 0.85; }
.dropzone--disabled.dropzone--active { border-color: var(--border); box-shadow: none; }

.dropzone__content { display: flex; flex-direction: column; align-items: center; gap: 0.5rem; }
.dropzone__icon { display: block; margin: 0 auto 0.75rem; color: var(--text-muted); stroke: currentColor; }
.dropzone__title { font-weight: 700; color: var(--text-primary); }
.dropzone__subtitle { color: var(--text-secondary); font-size: 0.875rem; text-align: center; }
.dropzone__button { margin-top: 0.75rem; max-width: 240px; }

.preview-section { margin-top: 1rem; }

.summary {
  display: flex;
  gap: 1rem;
  align-items: center;
  margin-bottom: 1rem;
}
.summary__item { flex: 1; background: var(--bg-input); border: 1px solid var(--border); border-radius: var(--radius-md); padding: 0.75rem; text-align: center; }
.summary__label { color: var(--text-secondary); font-size: 0.8125rem; }
.summary__value { margin-top: 0.25rem; font-size: 1.25rem; font-weight: 800; color: var(--text-primary); }
.summary__value--danger { color: var(--color-danger); }
.summary__value--ok { color: var(--color-success); }
.summary__value--warn { color: #feca57; }

.warnings { margin: 0.5rem 0 1rem; }
.bulk-conto {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 1rem;
  padding: 0.75rem;
  background: var(--bg-input);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
}
.bulk-conto__label { font-weight: 700; color: var(--text-primary); font-size: 0.875rem; }
.bulk-conto__select { flex: 1; min-width: 200px; max-width: 320px; }
.warnings__title { font-weight: 700; color: var(--text-primary); margin-bottom: 0.5rem; }
.warnings__list { margin: 0; padding-left: 1.25rem; color: var(--text-secondary); font-size: 0.875rem; }

.table-wrap { overflow-x: auto; border-radius: var(--radius-lg); border: 1px solid var(--border); }
.preview-table { width: 100%; border-collapse: collapse; min-width: 1080px; }
.preview-table th {
  text-align: left;
  font-size: 0.75rem;
  letter-spacing: 0.02em;
  color: var(--text-muted);
  padding: 0.75rem 0.75rem;
  background: rgba(255, 255, 255, 0.01);
  border-bottom: 1px solid var(--border);
}
.preview-table td { padding: 0.75rem 0.75rem; border-bottom: 1px solid var(--border); vertical-align: top; }
.row--duplicate td { background: rgba(255, 71, 87, 0.08); }

.td-muted { color: var(--text-secondary); }
.td-desc { max-width: 280px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.td-desc__clean { margin-top: 0.25rem; font-size: 0.75rem; color: var(--text-muted); white-space: normal; }
.merchant-pill { display: flex; flex-direction: column; gap: 0.35rem; align-items: flex-start; }
.merchant-pill--suggested { margin-bottom: 0.35rem; opacity: 0.85; }
.merchant-pill__name { font-weight: 700; color: var(--text-primary); font-size: 0.875rem; }
.merchant-edit { display: flex; flex-direction: column; gap: 0.35rem; min-width: 140px; }
.input--merchant {
  width: 100%;
  background: var(--bg-input);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 0.5rem 0.75rem;
  color: var(--text-primary);
  font-size: 0.875rem;
}
.merchant-address { font-size: 0.75rem; color: var(--text-muted); line-height: 1.3; }
.merchant-motivazione { font-size: 0.75rem; color: var(--text-secondary); line-height: 1.3; font-style: italic; }

.td-positive { color: var(--color-success); font-weight: 700; }
.td-negative { color: var(--color-danger); font-weight: 700; }

.select {
  width: 100%;
  background: var(--bg-input);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 0.5rem 0.75rem;
  color: var(--text-primary);
}
.cat-pill { display: inline-flex; align-items: center; padding: 0.35rem 0.55rem; border-radius: var(--radius-md); border: 1px solid rgba(0, 212, 170, 0.35); background: rgba(0, 212, 170, 0.12); }
.cat-pill__label { color: var(--accent-green); font-weight: 800; font-size: 0.8125rem; text-transform: capitalize; }

.badge { display: inline-flex; align-items: center; padding: 0.35rem 0.55rem; border-radius: 999px; font-size: 0.75rem; font-weight: 800; }
.badge--duplicate { color: #fff; background: rgba(255, 71, 87, 0.85); border: 1px solid rgba(255, 71, 87, 0.3); }
.badge--ready { color: var(--accent-on); background: rgba(0, 212, 170, 0.9); border: 1px solid rgba(0, 212, 170, 0.3); }
.badge--blocked { color: var(--text-muted); background: rgba(255, 255, 255, 0.03); border: 1px solid var(--border); }
.badge--inline { margin-left: 0.5rem; }

.badge--conf-high { color: var(--accent-on); background: rgba(0, 212, 170, 0.9); border: 1px solid rgba(0, 212, 170, 0.3); }
.badge--conf-mid { color: var(--accent-on); background: rgba(255, 230, 77, 0.95); border: 1px solid rgba(255, 230, 77, 0.35); }
.badge--conf-low { color: #fff; background: rgba(255, 71, 87, 0.85); border: 1px solid rgba(255, 71, 87, 0.3); }
.badge--source { color: var(--text-secondary); background: rgba(255, 255, 255, 0.06); border: 1px solid var(--border); font-weight: 600; }

.actions { margin-top: 1rem; display: flex; flex-direction: column; gap: 0.75rem; }
.actions__hint { color: var(--text-secondary); font-size: 0.875rem; }

.modal-space { display: flex; flex-direction: column; gap: 1rem; }
.modal-text { color: var(--text-secondary); }
.import-mode { display: flex; flex-direction: column; gap: 0.75rem; }
.import-mode__option { display: flex; gap: 0.75rem; align-items: flex-start; cursor: pointer; color: var(--text-secondary); font-size: 0.875rem; }
.import-mode__option strong { display: block; color: var(--text-primary); margin-bottom: 0.15rem; }
.import-mode__option small { display: block; color: var(--text-muted); line-height: 1.35; }
.import-mode__option input { margin-top: 0.2rem; flex-shrink: 0; }
.import-mode__warn { font-size: 0.8125rem; color: var(--warning); line-height: 1.45; margin: 0; padding: 0.75rem; border-radius: var(--radius-md); background: rgba(255, 165, 2, 0.1); border: 1px solid rgba(255, 165, 2, 0.25); }
.modal-actions { display: flex; gap: 0.75rem; justify-content: flex-end; }

@media (max-width: 767px) {
  .section-card { padding: 1rem; }
  .summary { flex-direction: column; }
  .preview-table { min-width: 820px; }
}
</style>

