<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import dayjs from 'dayjs';
import WCard from '@/components/common/WCard.vue';
import WSkeleton from '@/components/common/WSkeleton.vue';
import WButton from '@/components/common/WButton.vue';
import DataState from '@/components/common/DataState.vue';
import SuggerimentoCard from '@/components/analisi/SuggerimentoCard.vue';
import { Doughnut, Bar } from 'vue-chartjs';
import {
  Chart as ChartJS, ArcElement, Tooltip, Legend,
  CategoryScale, LinearScale, BarElement,
} from 'chart.js';
import { useAnalisiStore } from '@/stores/analisi.store';
import { useContiStore } from '@/stores/conti.store';
import { useChartTheme } from '@/composables/useChartTheme';
import { useValuta } from '@/composables/useValuta';
import { PERIODI, getDateRange as periodoRange } from '@/utils/periodoAnalisi';
import api from '@/utils/axios';
import { useToastStore } from '@/stores/toast.store';
import CategoryIcon from '@/components/common/CategoryIcon.vue';
import MovimentoForm from '@/components/movimenti/MovimentoForm.vue';
import AnalisiMovimentoRow from '@/components/analisi/AnalisiMovimentoRow.vue';
import AndamentoPatrimonio from '@/components/analisi/AndamentoPatrimonio.vue';
import { BarChart3, TrendingUp, Coins, LightbulbIcon, CheckCircle2, DownloadIcon, X, Banknote } from '@/utils/appIcons';
import HelpTrigger from '@/components/help/HelpTrigger.vue';

ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement);

const analisiStore = useAnalisiStore();
const contiStore = useContiStore();
const toastStore = useToastStore();
const { formatValuta } = useValuta();
const { baseOptions } = useChartTheme();

const activeTab = ref('spese');
const periodo = ref('mese');
const quantitaConfronto = ref(6);
const customDa = ref(dayjs().startOf('month').format('YYYY-MM-DD'));
const customA = ref(dayjs().format('YYYY-MM-DD'));
const highlightCat = ref(null);
const categoryMovimenti = ref([]);
const loadingCategoryMovimenti = ref(false);
const formOpen = ref(false);
const formTipo = ref('uscita');
const movimentoEdit = ref(null);

const flattenMovimentiResponse = (data) => {
  if (Array.isArray(data?.movimenti) && data.movimenti.length) return data.movimenti;
  if (!Array.isArray(data?.gruppi)) return [];
  return data.gruppi.flatMap((g) => (
    g.movimenti.map((m) => ({ ...m, dataLabel: g.label || m.dataLabel }))
  ));
};

const loadCategoryMovimenti = async (categoria) => {
  if (!categoria) {
    categoryMovimenti.value = [];
    return;
  }

  loadingCategoryMovimenti.value = true;
  try {
    const { da, a } = getDateRange();
    const { data } = await api.get('/movimenti', {
      params: {
        categoria,
        tipo: tipoCorrente.value,
        da,
        a,
        limit: 200,
      },
    });
    categoryMovimenti.value = flattenMovimentiResponse(data);
  } catch (err) {
    categoryMovimenti.value = [];
    toastStore.error(err.response?.data?.message || 'Errore nel caricamento delle transazioni');
  } finally {
    loadingCategoryMovimenti.value = false;
  }
};

const toggleCategory = async (cat) => {
  if (highlightCat.value === cat.categoria) {
    closeCategoryPanel();
    return;
  }

  highlightCat.value = cat.categoria;
  await loadCategoryMovimenti(cat.categoria);
};

const closeCategoryPanel = () => {
  highlightCat.value = null;
  categoryMovimenti.value = [];
};

const formatGroupDate = (mov) => {
  const raw = mov.data || mov.dataLabel;
  if (!raw) return 'Senza data';
  const d = dayjs(raw);
  if (!d.isValid()) return String(raw);
  const oggi = dayjs();
  if (d.isSame(oggi, 'day')) return 'Oggi';
  if (d.isSame(oggi.subtract(1, 'day'), 'day')) return 'Ieri';
  return d.format('D MMMM YYYY');
};

const categoryMovimentiGrouped = computed(() => {
  const map = new Map();
  categoryMovimenti.value.forEach((mov) => {
    const key = mov.data || 'unknown';
    if (!map.has(key)) {
      map.set(key, { key, label: formatGroupDate(mov), items: [] });
    }
    map.get(key).items.push(mov);
  });
  return Array.from(map.values()).sort((a, b) => String(b.key).localeCompare(String(a.key)));
});

const apriFormModifica = (mov) => {
  if (!mov || mov.tipo === 'trasferimento') return;
  formTipo.value = mov.tipo === 'entrata' ? 'entrata' : 'uscita';
  movimentoEdit.value = mov;
  formOpen.value = true;
};

const onMovimentoSaved = async () => {
  formOpen.value = false;
  movimentoEdit.value = null;
  await contiStore.fetchConti();
  await contiStore.fetchPatrimonio();
  if (highlightCat.value) {
    await loadCategoryMovimenti(highlightCat.value);
  }
  const { da, a } = getDateRange();
  if (activeTab.value === 'entrate') await analisiStore.fetchDistribuzioneEntrate(da, a);
  else await analisiStore.fetchDistribuzioneSpese(da, a);
};

// Spese ed entrate condividono grafico, elenco e pannello transazioni:
// cambiano solo la sorgente dei dati e il tipo di movimento.
const isDistribuzione = computed(() => activeTab.value === 'spese' || activeTab.value === 'entrate');
const risorsaDistribuzione = computed(() => (
  activeTab.value === 'entrate' ? analisiStore.risorsaEntrate : analisiStore.risorsaSpese
));
const tipoCorrente = computed(() => (activeTab.value === 'entrate' ? 'entrata' : 'uscita'));
const distribuzioneCorrente = computed(() => (activeTab.value === 'entrate'
  ? analisiStore.distribuzioneEntrate
  : analisiStore.distribuzioneSpese));
const totaleCorrente = computed(() => (activeTab.value === 'entrate'
  ? analisiStore.totaleEntrate
  : analisiStore.totaleSpese));

const CHART_COLORS = ['#00D4AA', '#FF4757', '#6C5CE7', '#74B9FF', '#FECA57', '#FF9F43', '#FD79A8', '#A29BFE', '#E17055', '#636E72'];

const tabs = [
  { id: 'spese', label: 'Spese', icon: BarChart3 },
  { id: 'entrate', label: 'Entrate', icon: Banknote },
  { id: 'confronto', label: 'Confronto', icon: TrendingUp },
  { id: 'patrimonio', label: 'Patrimonio', icon: Coins },
  { id: 'suggerimenti', label: 'Suggerimenti', icon: LightbulbIcon },
];

const getDateRange = () => periodoRange(periodo.value, {
  customDa: customDa.value, customA: customA.value,
});

/**
 * Confronto segue il periodo scelto in cima alla pagina:
 *
 *   Settimana → ultime N settimane      selettore 2-12
 *   Mese      → ultimi N mesi           selettore 2-12
 *   Trimestre → ultimi 3 mesi           fisso, nessun selettore
 *   Anno      → ultimi N anni           selettore 2-12
 *   Custom    → i mesi fra Da e A       derivato dall'intervallo
 */
const REGOLA_PER_PERIODO = {
  settimana: { unita: 'settimana', selezionabile: true },
  mese: { unita: 'mese', selezionabile: true },
  trimestre: { unita: 'mese', selezionabile: false, quantita: 3 },
  anno: { unita: 'anno', selezionabile: true },
  custom: { unita: 'mese', selezionabile: false, daIntervallo: true },
};

const regolaPeriodo = computed(() => REGOLA_PER_PERIODO[periodo.value] || REGOLA_PER_PERIODO.mese);
const quantitaSelezionabile = computed(() => regolaPeriodo.value.selezionabile);

/**
 * Il tab che dipende dal periodo e mostra il selettore di quantita'.
 * Patrimonio non c'e' piu': l'andamento ha un periodo tutto suo, dentro
 * `AndamentoPatrimonio`, indipendente dai tab in cima alla pagina.
 */
const TAB_CON_QUANTITA = ['confronto'];
const mostraSelettoreQuantita = computed(() => TAB_CON_QUANTITA.includes(activeTab.value));

/** Quantita' di periodi da confrontare. */
const quantitaAttiva = computed({
  get: () => quantitaConfronto.value,
  set: (n) => { quantitaConfronto.value = n; },
});

/** Quanti periodi chiedere: il valore scelto, o quello imposto dal periodo. */
const quantitaRichiesta = (scelta) => (
  quantitaSelezionabile.value ? scelta : (regolaPeriodo.value.quantita ?? 6)
);

const CONFRONTO_ETICHETTE = {
  settimana: { singolare: 'Settimana', plurale: 'settimane' },
  mese: { singolare: 'Mese', plurale: 'mesi' },
  anno: { singolare: 'Anno', plurale: 'anni' },
};

/** Nome dell'unita' realmente caricata, non di quella richiesta. */
const etichetteConfronto = computed(() => (
  CONFRONTO_ETICHETTE[analisiStore.confrontoUnita] || CONFRONTO_ETICHETTE.mese
));

const etichettaUnitaScelta = computed(() => (
  (CONFRONTO_ETICHETTE[regolaPeriodo.value.unita] || CONFRONTO_ETICHETTE.mese).plurale
));

/** Scorciatoie del selettore, oltre alla scelta libera da 2 a 12. */
const PRESET_CONFRONTO = [3, 6, 12];
const QUANTITA_CONFRONTO = Array.from({ length: 11 }, (_, i) => i + 2);

/** Riassunto di cosa si sta confrontando quando non c'e' un selettore. */
const descrizionePeriodoFisso = computed(() => {
  if (quantitaSelezionabile.value) return '';
  if (regolaPeriodo.value.daIntervallo) return 'I mesi dell\'intervallo scelto';
  return 'Ultimi 3 mesi';
});

const doughnutData = computed(() => ({
  labels: distribuzioneCorrente.value.map((d) => d.nome_display),
  datasets: [{
    data: distribuzioneCorrente.value.map((d) => d.importo),
    backgroundColor: distribuzioneCorrente.value.map((_, i) => CHART_COLORS[i % CHART_COLORS.length]),
    borderWidth: 0,
  }],
}));

const doughnutOptions = computed(() => ({
  ...baseOptions.value,
  cutout: '65%',
  animation: { animateRotate: true, duration: 1000 },
  plugins: {
    ...baseOptions.value.plugins,
    tooltip: {
      ...baseOptions.value.plugins.tooltip,
      callbacks: {
        label: (ctx) => `${formatValuta(ctx.raw)} (${distribuzioneCorrente.value[ctx.dataIndex]?.percentuale}%)`,
      },
    },
  },
}));

const barData = computed(() => ({
  labels: analisiStore.confrontoPeriodi.map((m) => m.label),
  datasets: [
    { label: 'Entrate', data: analisiStore.confrontoPeriodi.map((m) => m.entrate), backgroundColor: '#00D4AA' },
    { label: 'Uscite', data: analisiStore.confrontoPeriodi.map((m) => m.uscite), backgroundColor: '#FF4757' },
  ],
}));

const barOptions = computed(() => ({
  ...baseOptions.value,
  animation: { duration: 800 },
  scales: {
    x: { ...baseOptions.value.scales.x, grid: { display: false } },
    y: {
      ...baseOptions.value.scales.y,
      ticks: { ...baseOptions.value.scales.y.ticks, callback: (v) => `€${v}` },
    },
  },
}));

const loadTabData = async () => {
  const { da, a } = getDateRange();
  if (isDistribuzione.value) {
    if (activeTab.value === 'entrate') await analisiStore.fetchDistribuzioneEntrate(da, a);
    else await analisiStore.fetchDistribuzioneSpese(da, a);
    if (highlightCat.value) {
      const stillExists = distribuzioneCorrente.value.some((c) => c.categoria === highlightCat.value);
      if (stillExists) await loadCategoryMovimenti(highlightCat.value);
      else closeCategoryPanel();
    }
  }
  const { unita, daIntervallo } = regolaPeriodo.value;
  if (activeTab.value === 'confronto') {
    await analisiStore.fetchConfrontoPeriodi(
      daIntervallo ? { da, a } : { unita, quantita: quantitaRichiesta(quantitaConfronto.value) },
    );
  }
  if (activeTab.value === 'suggerimenti') await analisiStore.fetchSuggerimenti();
};

watch(activeTab, () => closeCategoryPanel());

watch([activeTab, periodo, quantitaConfronto, customDa, customA], loadTabData);

onMounted(async () => {
  await contiStore.fetchConti();
  await loadTabData();
});

const esportaDati = async () => {
  try {
    const response = await api.get('/impostazioni/esporta', { responseType: 'blob' });
    const url = URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;
    link.download = `wallt-export-${dayjs().format('YYYY-MM-DD')}.json`;
    link.click();
    URL.revokeObjectURL(url);
    toastStore.success('Dati esportati!');
  } catch {
    toastStore.error('Errore nell\'esportazione');
  }
};
</script>

<template>
  <div class="analisi-view animate-fade-in">
    <header class="page-header">
      <div class="page-title-row">
        <h1 class="page-title">Analisi</h1>
        <HelpTrigger topic="analisi-come-funziona" />
      </div>
      <div class="periodo-tabs">
        <button v-for="p in PERIODI" :key="p.id" :class="{ active: periodo === p.id }" @click="periodo = p.id">
          {{ p.label }}
        </button>
      </div>
      <div v-if="periodo === 'custom'" class="custom-dates">
        <input v-model="customDa" type="date" class="form-input" />
        <input v-model="customA" type="date" class="form-input" />
      </div>
    </header>

    <div class="tab-nav">
      <button v-for="tab in tabs" :key="tab.id" :class="{ active: activeTab === tab.id }" @click="activeTab = tab.id">
        <component :is="tab.icon" class="tab-icon" :size="16" :stroke-width="1.75" />
        <span>{{ tab.label }}</span>
      </button>
    </div>

    <!-- Confronto e Patrimonio seguono il periodo scelto in cima: qui si
         sceglie solo quanti periodi. Con Trimestre e Custom la quantita' e'
         gia' decisa dal periodo, quindi resta solo la descrizione. -->
    <template v-if="mostraSelettoreQuantita">
      <div v-if="quantitaSelezionabile" class="quantita-picker">
        <div class="sub-tabs quantita-picker__preset">
          <button
            v-for="n in PRESET_CONFRONTO"
            :key="n"
            :class="{ active: quantitaAttiva === n }"
            @click="quantitaAttiva = n"
          >{{ n }} {{ etichettaUnitaScelta }}</button>
        </div>
        <label class="quantita-picker__libero">
          <span>Oppure</span>
          <select v-model.number="quantitaAttiva" class="filtro-select" aria-label="Quanti periodi mostrare">
            <option v-for="n in QUANTITA_CONFRONTO" :key="n" :value="n">{{ n }}</option>
          </select>
          <span>{{ etichettaUnitaScelta }}</span>
        </label>
      </div>
      <p v-else class="quantita-fissa">{{ descrizionePeriodoFisso }}</p>
    </template>

    <DataState
      v-if="isDistribuzione"
      :stato="risorsaDistribuzione.stato"
      :last-updated="risorsaDistribuzione.lastUpdated"
      messaggio-errore="Non è stato possibile caricare le analisi."
      skeleton-type="text"
      :skeleton-lines="5"
      @riprova="risorsaDistribuzione.riprova()"
    >
      <template #vuoto>
        <div class="empty-state">
          <BarChart3 class="empty-icon" :size="48" :stroke-width="1.5" />
          <p>Aggiungi movimenti per vedere le analisi</p>
          <p class="empty-hint">
            I grafici si costruiscono sui movimenti registrati nel periodo selezionato:
            prova a cambiare periodo, oppure registra o importa qualche movimento.
          </p>
          <router-link to="/movimenti" class="link-accent">Aggiungi movimento →</router-link>
        </div>
      </template>

      <WCard class="chart-card">
        <div class="donut-wrap">
          <Doughnut :data="doughnutData" :options="doughnutOptions" />
          <div class="donut-center">
            <span class="donut-label">{{ activeTab === 'entrate' ? 'Totale entrate' : 'Totale spese' }}</span>
            <span class="donut-value">{{ formatValuta(totaleCorrente) }}</span>
          </div>
        </div>
      </WCard>

      <div v-if="distribuzioneCorrente.length" class="cat-list">
        <div
          v-for="(cat, i) in distribuzioneCorrente"
          :key="cat.categoria"
          class="cat-block"
        >
          <button
            type="button"
            class="cat-row stagger-item"
            :class="{ highlighted: highlightCat === cat.categoria, expanded: highlightCat === cat.categoria }"
            @click="toggleCategory(cat)"
          >
            <span class="cat-bullet" :style="{ background: CHART_COLORS[i % CHART_COLORS.length] }" />
            <CategoryIcon :categoria="cat.categoria" :tipo="tipoCorrente" :size="16" class="cat-row-icon" />
            <span class="cat-row__name">{{ cat.nome_display }}</span>
            <span class="cat-importo">{{ formatValuta(cat.importo) }}</span>
            <span class="cat-pct">{{ cat.percentuale }}%</span>
            <div class="cat-bar">
              <div :style="{ width: cat.percentuale + '%', background: CHART_COLORS[i % CHART_COLORS.length] }" />
            </div>
          </button>

          <div v-if="highlightCat === cat.categoria" class="cat-transactions">
            <div class="cat-transactions__header">
              <div>
                <p class="cat-transactions__title">{{ cat.nome_display }}</p>
                <p class="cat-transactions__hint">
                  {{ loadingCategoryMovimenti ? 'Caricamento…' : `${categoryMovimenti.length} transazioni · tocca per modificare` }}
                </p>
              </div>
              <button type="button" class="cat-transactions__close" aria-label="Chiudi" @click.stop="closeCategoryPanel">
                <X :size="18" :stroke-width="2" />
              </button>
            </div>

            <div class="cat-transactions__list">
              <WSkeleton v-if="loadingCategoryMovimenti" type="card" class="cat-transactions__skeleton" />
              <p v-else-if="!categoryMovimenti.length" class="cat-transactions__empty">
                Nessuna transazione in questo periodo
              </p>
              <template v-else>
                <section
                  v-for="gruppo in categoryMovimentiGrouped"
                  :key="gruppo.key"
                  class="cat-transactions__group"
                >
                  <h4 class="cat-transactions__group-label">{{ gruppo.label }}</h4>
                  <AnalisiMovimentoRow
                    v-for="mov in gruppo.items"
                    :key="mov.id"
                    :movimento="mov"
                    @click="apriFormModifica"
                  />
                </section>
              </template>
            </div>
          </div>
        </div>
      </div>
    </DataState>

    <Transition v-else name="fade">
      <!-- TAB CONFRONTO -->
      <DataState
        v-if="activeTab === 'confronto'"
        key="confronto"
        :stato="analisiStore.risorsaConfronto.stato"
        :last-updated="analisiStore.risorsaConfronto.lastUpdated"
        messaggio-errore="Non è stato possibile caricare il confronto tra periodi."
        skeleton-type="card"
        @riprova="analisiStore.risorsaConfronto.riprova()"
      >
        <template #vuoto>
          <div class="empty-state">
            <TrendingUp class="empty-icon" :size="48" :stroke-width="1.5" />
            <p>Nessun dato da confrontare per questo periodo</p>
          </div>
        </template>

        <WCard><Bar :data="barData" :options="barOptions" /></WCard>
        <WCard class="mt-4">
          <table class="data-table">
            <thead><tr><th>{{ etichetteConfronto.singolare }}</th><th>Entrate</th><th>Uscite</th><th>Saldo</th></tr></thead>
            <tbody>
              <tr v-for="m in analisiStore.confrontoPeriodi" :key="m.chiave || m.label">
                <td>{{ m.labelEsteso || m.label }}</td>
                <td class="positive">{{ formatValuta(m.entrate) }}</td>
                <td class="negative">{{ formatValuta(m.uscite) }}</td>
                <td :class="m.saldo >= 0 ? 'positive' : 'negative'">{{ formatValuta(m.saldo) }}</td>
              </tr>
            </tbody>
          </table>
        </WCard>
      </DataState>

      <!-- TAB PATRIMONIO: periodo, grafico e statistiche vivono tutti dentro
           il componente condiviso con la Dashboard. -->
      <AndamentoPatrimonio v-else-if="activeTab === 'patrimonio'" key="patrimonio" />

      <!-- TAB SUGGERIMENTI -->
      <DataState
        v-else
        key="suggerimenti"
        :stato="analisiStore.risorsaSuggerimenti.stato"
        :last-updated="analisiStore.risorsaSuggerimenti.lastUpdated"
        messaggio-errore="Non è stato possibile caricare i suggerimenti."
        skeleton-type="card"
        @riprova="analisiStore.risorsaSuggerimenti.riprova()"
      >
        <template #vuoto>
          <WCard class="empty-ok">
            <CheckCircle2 class="empty-icon empty-icon--inline" :size="20" :stroke-width="1.75" />
            Tutto sotto controllo! Continua così.
          </WCard>
        </template>

        <div class="sug-list">
          <SuggerimentoCard
            v-for="(s, i) in analisiStore.suggerimenti"
            :key="i"
            v-bind="s"
          />
        </div>
      </DataState>
    </Transition>

    <div class="export-section">
      <WButton variant="secondary" size="md" @click="esportaDati">
        <DownloadIcon :size="16" :stroke-width="1.75" />
        Esporta dati (JSON)
      </WButton>
    </div>

    <MovimentoForm
      :open="formOpen"
      :tipo="formTipo"
      :movimento="movimentoEdit"
      @close="formOpen = false; movimentoEdit = null"
      @saved="onMovimentoSaved"
    />
  </div>
</template>

<style scoped>
.page-header { margin-bottom: 1rem; }
.page-title-row { display: flex; align-items: center; gap: 0.625rem; flex-wrap: wrap; margin-bottom: 0.75rem; }
.page-title { font-size: 1.5rem; font-weight: 700; color: var(--text-primary); }
.empty-hint { margin: 0.5rem auto 0.75rem; max-width: 32rem; font-size: var(--text-xs); line-height: 1.55; color: var(--text-muted); }
.periodo-tabs, .sub-tabs, .tab-nav { display: flex; gap: 0.375rem; flex-wrap: wrap; margin-bottom: 1rem; }
.periodo-tabs button, .sub-tabs button, .tab-nav button {
  padding: 0.5rem 0.875rem; border-radius: 999px; border: 1px solid var(--border);
  background: var(--bg-input); color: var(--text-secondary); font-size: var(--text-xs); cursor: pointer; min-height: 44px;
}
.periodo-tabs button.active, .sub-tabs button.active, .tab-nav button.active {
  background: var(--accent-green); color: var(--accent-on); border-color: var(--accent-green); font-weight: 600;
}
.periodo-tabs button:focus-visible, .sub-tabs button:focus-visible, .tab-nav button:focus-visible {
  outline: none; box-shadow: var(--focus-ring-tight);
}
.custom-dates { display: flex; gap: 0.5rem; margin-bottom: 1rem; }
/* .form-input: aspetto condiviso in assets/styles/main.css */
.form-input { min-height: 44px; }
.quantita-picker {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.75rem 1rem;
  margin-bottom: 1rem;
}
.quantita-picker__preset { margin-bottom: 0; }
.quantita-picker__libero {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: var(--text-xs);
  color: var(--text-muted);
}
.quantita-picker__libero .filtro-select { width: auto; min-width: 4.5rem; }
.quantita-fissa {
  margin-bottom: 1rem;
  font-size: var(--text-xs);
  color: var(--text-muted);
}
/* Stesso chevron dei campi condivisi (assets/styles/main.css): qui la select
   e' fuori dal sistema .form-select perche' e' larga quanto il contenuto. */
.filtro-select {
  background: var(--glass-interactive-bg);
  border: 1px solid var(--glass-interactive-border);
  border-radius: var(--radius-md);
  box-shadow: var(--glass-highlight);
  padding: 0.5rem 2.25rem 0.5rem 0.875rem;
  color: var(--text-primary);
  font-size: 16px;
  min-height: 44px;
  cursor: pointer;
  -webkit-appearance: none;
  appearance: none;
  background-image:
    linear-gradient(45deg, transparent calc(50% - 0.7px), currentColor calc(50% - 0.7px), currentColor calc(50% + 0.7px), transparent calc(50% + 0.7px)),
    linear-gradient(135deg, transparent calc(50% - 0.7px), currentColor calc(50% - 0.7px), currentColor calc(50% + 0.7px), transparent calc(50% + 0.7px));
  background-position: right 1.08rem center, right 0.65rem center;
  background-size: 7px 7px, 7px 7px;
  background-repeat: no-repeat;
  transition: border-color var(--dur-fast) var(--ease-out), background-color var(--dur-fast) var(--ease-out);
}
.filtro-select:focus {
  outline: none;
  border-color: var(--accent-green);
  box-shadow: var(--focus-ring), var(--glass-highlight);
}
.chart-card { margin-bottom: 1rem; }
.chart-skeleton { min-height: 220px; border-radius: var(--radius-lg); }
.donut-wrap { position: relative; max-width: 280px; margin: 0 auto; }
.donut-center { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; pointer-events: none; }
/* deroga: didascalia sopra il valore del donut, già leggibile a --text-base in .donut-value accanto.
   Senza maiuscolo l'etichetta perdeva l'unica cosa che la distingueva dal
   testo normale: il peso prende il posto della forma delle lettere. */
.donut-label { font-size: var(--text-micro); font-weight: 600; color: var(--text-muted); }
.donut-value { font-size: 1rem; font-weight: 700; color: var(--text-primary); }
.cat-list { display: flex; flex-direction: column; gap: 0.5rem; }
.cat-block { display: flex; flex-direction: column; gap: 0.375rem; }
.cat-row {
  display: grid;
  grid-template-columns: auto 1fr auto auto;
  gap: 0.5rem;
  align-items: center;
  width: 100%;
  padding: 0.625rem;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  cursor: pointer;
  font-size: 0.875rem;
  color: var(--text-primary);
  text-align: left;
  font-family: inherit;
}
.cat-row__name { min-width: 0; }
.cat-row.highlighted { border-color: var(--accent-green); }
.cat-row.expanded { background: rgba(0, 212, 170, 0.06); }
.cat-row:focus-visible { outline: none; box-shadow: var(--focus-ring); }
.cat-row-skeleton { height: 56px; border-radius: var(--radius-md); }
.cat-transactions {
  margin: 0;
  padding: 0.875rem;
  border: 1px solid color-mix(in srgb, var(--accent-green) 25%, var(--border));
  border-radius: var(--radius-md);
  background: var(--bg-card);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.03);
}
.cat-transactions__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.75rem;
  margin-bottom: 0.625rem;
  padding-bottom: 0.625rem;
  border-bottom: 1px solid var(--border);
}
.cat-transactions__title {
  margin: 0 0 0.15rem;
  font-size: 0.875rem;
  font-weight: 700;
  color: var(--text-primary);
}
.cat-transactions__close {
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--bg-input);
  color: var(--text-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}
.cat-transactions__close:focus-visible { outline: none; box-shadow: var(--focus-ring-tight); }
.cat-transactions__hint {
  font-size: var(--text-xs);
  color: var(--text-muted);
  margin: 0;
  line-height: 1.4;
}
.cat-transactions__list {
  max-height: min(360px, 45vh);
  overflow-y: auto;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
  padding-right: 0.125rem;
}
.cat-transactions__group + .cat-transactions__group {
  margin-top: 0.875rem;
}
.cat-transactions__group-label {
  margin: 0 0 0.375rem;
  padding: 0 0.125rem;
  font-size: var(--text-xs);
  font-weight: 700;
  letter-spacing: var(--tracking-wide);
  color: var(--text-muted);
}
.cat-transactions__group :deep(.analisi-mov-row) {
  margin-bottom: 0.375rem;
}
.cat-transactions__group :deep(.analisi-mov-row:last-child) {
  margin-bottom: 0;
}
.cat-transactions__empty {
  text-align: center;
  padding: 1.25rem 0.5rem;
  color: var(--text-secondary);
  font-size: 0.875rem;
}
.cat-transactions__skeleton { height: 72px; border-radius: 12px; }
.cat-bullet { width: 10px; height: 10px; border-radius: 50%; }
.cat-importo { font-weight: 600; }
.cat-pct { color: var(--text-muted); font-size: var(--text-xs); }
.cat-bar { grid-column: 1 / -1; height: 4px; background: var(--bg-input); border-radius: 2px; overflow: hidden; }
.cat-bar div { height: 100%; border-radius: 2px; }
.cat-row-icon { color: var(--text-muted); }
.data-table { width: 100%; border-collapse: collapse; font-size: 0.875rem; }
.data-table th, .data-table td { padding: 0.625rem; text-align: left; border-bottom: 1px solid var(--border); color: var(--text-primary); }
.stats-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 0.75rem; margin: 1rem 0; }
@media (min-width: 768px) { .stats-grid { grid-template-columns: repeat(4, 1fr); } }
/* deroga: didascalia sopra il valore in .stat-val, già leggibile a --text-base */
.stat-label { display: block; font-size: var(--text-micro); color: var(--text-muted); margin-bottom: 0.25rem; }
.stat-val { font-size: 1rem; font-weight: 700; color: var(--text-primary); }
.variazione { text-align: center; font-size: 1.125rem; font-weight: 600; margin-top: 0.5rem; }
.positive { color: var(--positive); }
.negative { color: var(--negative); }
.sug-list { display: flex; flex-direction: column; gap: 0.75rem; }
.periodo-tabs button, .sub-tabs button, .tab-nav button {
  display: inline-flex; align-items: center; gap: 0.375rem;
}
.tab-nav button.active .tab-icon { color: var(--accent-text); }
.tab-icon { stroke: currentColor; flex-shrink: 0; }
.empty-icon { display: block; margin: 0 auto 1rem; color: var(--text-muted); stroke: currentColor; }
.empty-icon--inline { display: inline; margin: 0 0.375rem 0 0; vertical-align: middle; color: var(--positive); }
.empty-state, .empty-ok { text-align: center; padding: 3rem 1rem; color: var(--text-secondary); }
.empty-ok { display: flex; align-items: center; justify-content: center; gap: 0.375rem; }
.link-accent { color: var(--accent-text); text-decoration: none; font-weight: 500; }
.export-section { margin-top: 2rem; text-align: center; }
.mt-4 { margin-top: 1rem; }
.fade-enter-active, .fade-leave-active { transition: opacity 0.2s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
