<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import { Doughnut, Bar, Line } from 'vue-chartjs';
import {
  Chart as ChartJS, ArcElement, Tooltip, Legend,
  CategoryScale, LinearScale, BarElement, PointElement, LineElement, Filler,
} from 'chart.js';
import WCard from '@/components/common/WCard.vue';
import WButton from '@/components/common/WButton.vue';
import WModal from '@/components/common/WModal.vue';
import WSkeleton from '@/components/common/WSkeleton.vue';
import { useInvestimentiStore } from '@/stores/investimenti.store';
import { useContiStore } from '@/stores/conti.store';
import { useToastStore } from '@/stores/toast.store';
import { useValuta } from '@/composables/useValuta';
import { useChartTheme } from '@/composables/useChartTheme';
import { formatData } from '@/utils/formatters';
import {
  Briefcase, BarChart3, ClipboardList, LineChart, Landmark, Package,
  ArrowDownCircle, ArrowUpCircle, TrendingUp, TrendingDown,
} from '@/utils/appIcons';
import dayjs from 'dayjs';

ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement, PointElement, LineElement, Filler);

const investimentiStore = useInvestimentiStore();
const contiStore = useContiStore();
const toastStore = useToastStore();
const { formatValuta } = useValuta();
const { baseOptions } = useChartTheme();

const activeTab = ref('portafoglio');
const loading = ref(false);
const showNuovo = ref(false);
const showMovimento = ref(false);
const showAggiornaSaldo = ref(false);
const periodoAnalisi = ref('mese');
const filtroTipo = ref('');
const filtroInv = ref('');

const invSelezionato = ref(null);
const saldoAggiornamento = ref(null);

const tabs = [
  { id: 'portafoglio', label: 'Portafoglio', icon: Briefcase },
  { id: 'analisi', label: 'Analisi', icon: BarChart3 },
  { id: 'storico', label: 'Storico', icon: ClipboardList },
];

const TIPI = [
  { id: 'azioni', label: 'Azioni', icon: BarChart3 },
  { id: 'etf', label: 'ETF', icon: Package },
  { id: 'crypto', label: 'Crypto', icon: TrendingUp },
  { id: 'fondi', label: 'Fondi', icon: Landmark },
  { id: 'obbligazioni', label: 'Obbligazioni', icon: ClipboardList },
  { id: 'altro', label: 'Altro', icon: Package },
];

const TIPO_OPS = [
  { id: 'versamento', label: 'Versamento', icon: ArrowDownCircle },
  { id: 'prelievo', label: 'Prelievo', icon: ArrowUpCircle },
  { id: 'rendimento', label: 'Rendimento', icon: TrendingUp },
  { id: 'perdita', label: 'Perdita', icon: TrendingDown },
];

const MOVIMENTO_ICONS = {
  versamento: ArrowDownCircle,
  prelievo: ArrowUpCircle,
  rendimento: TrendingUp,
  perdita: TrendingDown,
};

const COLORI = ['#6C5CE7', '#00D4AA', '#74B9FF', '#FECA57', '#FF4757', '#FF9F43'];

const nuovoForm = ref({ nome_piattaforma: '', tipo: 'azioni', saldo_iniziale: 0, colore: '#6C5CE7', note: '' });
const movForm = ref({
  tipo: 'versamento', importo: null, data: dayjs().format('YYYY-MM-DD'),
  nota: '', conto_collegato_id: null, saldo_dopo: null, usaSaldoDiretto: false,
});

const analisi = computed(() => investimentiStore.analisi);

const getDateRange = (periodo) => {
  const now = dayjs();
  if (periodo === 'mese') return { da: now.startOf('month').format('YYYY-MM-DD'), a: now.format('YYYY-MM-DD') };
  if (periodo === 'trimestre') return { da: now.subtract(3, 'month').format('YYYY-MM-DD'), a: now.format('YYYY-MM-DD') };
  if (periodo === 'anno') return { da: now.subtract(1, 'year').format('YYYY-MM-DD'), a: now.format('YYYY-MM-DD') };
  return { da: null, a: null };
};

const doughnutData = computed(() => ({
  labels: investimentiStore.investimenti.map((i) => i.nome_piattaforma),
  datasets: [{
    data: investimentiStore.investimenti.map((i) => parseFloat(i.saldo_attuale) || 0),
    backgroundColor: investimentiStore.investimenti.map((i) => i.colore || '#6C5CE7'),
    borderWidth: 0,
  }],
}));

const lineData = computed(() => {
  const mesi = analisi.value.andamento_mensile || [];
  let cum = 0;
  const data = mesi.map((m) => { cum += m.saldo_totale; return cum; });
  return {
    labels: mesi.map((m) => `${m.mese}/${m.anno}`),
    datasets: [{
      label: 'Saldo totale',
      data,
      borderColor: '#6C5CE7',
      backgroundColor: 'rgba(108, 92, 231, 0.15)',
      fill: true,
      tension: 0.4,
    }],
  };
});

const barMesiData = computed(() => {
  const mesi = analisi.value.andamento_mensile || [];
  return {
    labels: mesi.map((m) => `${m.mese}/${m.anno}`),
    datasets: [
      { label: 'Versamenti', data: mesi.map((m) => m.versamenti), backgroundColor: '#00D4AA' },
      { label: 'Prelievi', data: mesi.map((m) => m.prelievi), backgroundColor: '#FF4757' },
    ],
  };
});

const chartOpts = computed(() => ({ ...baseOptions.value, plugins: { ...baseOptions.value.plugins, legend: { display: false } } }));

const tipoLabel = (id) => TIPI.find((t) => t.id === id)?.label || id;

const tipoIcon = (tipo) => MOVIMENTO_ICONS[tipo] || ArrowDownCircle;

const importoClass = (tipo) => {
  if (tipo === 'versamento' || tipo === 'rendimento') return 'positive';
  return 'negative';
};

const importoPrefix = (tipo) => {
  if (tipo === 'versamento' || tipo === 'rendimento') return '+';
  return '-';
};

const caricaAnalisi = async () => {
  const range = getDateRange(periodoAnalisi.value);
  await investimentiStore.fetchAnalisi(range);
};

const caricaStorico = async () => {
  const params = {};
  if (filtroTipo.value) params.tipo = filtroTipo.value;
  const range = getDateRange('anno');
  params.da = range.da;
  params.a = range.a;
  if (filtroInv.value) {
    await investimentiStore.fetchMovimenti(filtroInv.value, params);
  } else {
    await investimentiStore.fetchAllMovimenti(params);
  }
};

watch([activeTab, periodoAnalisi], () => {
  if (activeTab.value === 'analisi') caricaAnalisi();
});

watch([activeTab, filtroTipo, filtroInv], () => {
  if (activeTab.value === 'storico') caricaStorico();
});

onMounted(async () => {
  await contiStore.fetchConti();
  await investimentiStore.fetchInvestimenti();
  if (activeTab.value === 'analisi') await caricaAnalisi();
});

const creaInvestimento = async () => {
  if (!nuovoForm.value.nome_piattaforma) return;
  loading.value = true;
  try {
    await investimentiStore.createInvestimento(nuovoForm.value);
    toastStore.success('Investimento aggiunto!');
    showNuovo.value = false;
    nuovoForm.value = { nome_piattaforma: '', tipo: 'azioni', saldo_iniziale: 0, colore: '#6C5CE7', note: '' };
  } catch (err) {
    toastStore.error(err.response?.data?.message || 'Errore');
  } finally {
    loading.value = false;
  }
};

const apriMovimento = (inv, tipo = 'versamento') => {
  invSelezionato.value = inv;
  movForm.value = {
    tipo,
    importo: null,
    data: dayjs().format('YYYY-MM-DD'),
    nota: '',
    conto_collegato_id: contiStore.contiAttivi[0]?.id || null,
    saldo_dopo: null,
    usaSaldoDiretto: false,
  };
  showMovimento.value = true;
};

const apriAggiornaSaldo = (inv) => {
  invSelezionato.value = inv;
  saldoAggiornamento.value = parseFloat(inv.saldo_attuale) || 0;
  showAggiornaSaldo.value = true;
};

const confermaMovimento = async () => {
  if (!invSelezionato.value) return;
  loading.value = true;
  try {
    const payload = {
      tipo: movForm.value.tipo,
      data: movForm.value.data,
      nota: movForm.value.nota,
    };
    if (movForm.value.usaSaldoDiretto && movForm.value.saldo_dopo !== null) {
      payload.saldo_dopo = movForm.value.saldo_dopo;
    } else if (movForm.value.importo) {
      payload.importo = movForm.value.importo;
    } else {
      toastStore.error('Inserisci importo o saldo');
      return;
    }
    if (movForm.value.conto_collegato_id) {
      payload.conto_collegato_id = movForm.value.conto_collegato_id;
    }
    await investimentiStore.addMovimento(invSelezionato.value.id, payload);
    toastStore.success('Operazione registrata');
    showMovimento.value = false;
    if (activeTab.value === 'analisi') await caricaAnalisi();
    if (activeTab.value === 'storico') await caricaStorico();
  } catch (err) {
    toastStore.error(err.response?.data?.message || 'Errore');
  } finally {
    loading.value = false;
  }
};

const confermaAggiornaSaldo = async () => {
  if (!invSelezionato.value || saldoAggiornamento.value === null) return;
  loading.value = true;
  try {
    await investimentiStore.addMovimento(invSelezionato.value.id, {
      tipo: 'rendimento',
      saldo_dopo: saldoAggiornamento.value,
      data: dayjs().format('YYYY-MM-DD'),
      nota: 'Aggiornamento saldo piattaforma',
    });
    toastStore.success('Saldo aggiornato');
    showAggiornaSaldo.value = false;
  } catch (err) {
    toastStore.error(err.response?.data?.message || 'Errore');
  } finally {
    loading.value = false;
  }
};

const messaggioTipo = computed(() => {
  if (movForm.value.tipo === 'rendimento') return 'I guadagni restano sulla piattaforma';
  if (movForm.value.tipo === 'perdita') return 'La perdita viene registrata sulla piattaforma';
  return null;
});
</script>

<template>
  <div class="investimenti-view animate-fade-in">
    <header class="page-header">
      <h1 class="page-title">I miei investimenti</h1>
    </header>

    <WCard v-if="investimentiStore.loading" class="hero-card"><WSkeleton type="text" :lines="2" /></WCard>
    <WCard v-else class="hero-card">
      <p class="hero-label">PATRIMONIO INVESTITO</p>
      <p class="hero-amount">{{ formatValuta(investimentiStore.patrimonioInvestitoTotale) }}</p>
      <p class="hero-rend" :class="(investimentiStore.rendimentoTotale || 0) >= 0 ? 'positive' : 'negative'">
        Rendimento netto:
        {{ (investimentiStore.rendimentoTotale || 0) >= 0 ? '+' : '' }}{{ formatValuta(investimentiStore.rendimentoTotale) }}
        ({{ investimentiStore.rendimentoTotalePercentuale || 0 }}%)
      </p>
    </WCard>

    <div v-if="!investimentiStore.investimenti.length && !investimentiStore.loading" class="empty">
      <LineChart class="empty-icon" :size="48" :stroke-width="1.5" />
      <h2>Monitora i tuoi investimenti</h2>
      <p>Aggiungi le tue piattaforme e tieni traccia di versamenti, rendimenti e prelievi</p>
      <WButton variant="primary" size="md" @click="showNuovo = true">+ Nuovo investimento</WButton>
    </div>

    <template v-else>
      <div class="tab-nav">
        <button v-for="tab in tabs" :key="tab.id" :class="{ active: activeTab === tab.id }" @click="activeTab = tab.id">
          <component :is="tab.icon" class="tab-icon" :size="16" :stroke-width="1.75" />
          <span>{{ tab.label }}</span>
        </button>
      </div>

      <!-- PORTAFOGLIO -->
      <div v-if="activeTab === 'portafoglio'">
        <div class="inv-grid">
          <WCard v-for="inv in investimentiStore.investimenti" :key="inv.id" class="inv-card stagger-item">
            <div class="inv-header" :style="{ borderLeft: `4px solid ${inv.colore}` }">
              <div>
                <h3>{{ inv.nome_piattaforma }}</h3>
                <span class="inv-tipo">{{ tipoLabel(inv.tipo) }}</span>
              </div>
            </div>
            <p class="inv-saldo-label">Saldo attuale</p>
            <p class="inv-saldo">{{ formatValuta(inv.saldo_attuale) }}</p>
            <p class="inv-stats">Versato: {{ formatValuta(inv.totale_versato) }}</p>
            <p class="inv-rend" :class="(inv.rendimento_netto || 0) >= 0 ? 'positive' : 'negative'">
              Rendimento: {{ (inv.rendimento_netto || 0) >= 0 ? '+' : '' }}{{ formatValuta(inv.rendimento_netto) }}
              ({{ inv.rendimento_percentuale || 0 }}%)
            </p>
            <div class="inv-actions">
              <button @click="apriMovimento(inv)">+ Operazione</button>
              <button @click="apriAggiornaSaldo(inv)">Aggiorna saldo</button>
            </div>
          </WCard>
        </div>
        <WButton variant="secondary" size="md" class="mt-4" @click="showNuovo = true">+ Nuovo investimento</WButton>
      </div>

      <!-- ANALISI -->
      <div v-else-if="activeTab === 'analisi'">
        <div class="periodo-tabs">
          <button :class="{ active: periodoAnalisi === 'mese' }" @click="periodoAnalisi = 'mese'">3M</button>
          <button :class="{ active: periodoAnalisi === 'trimestre' }" @click="periodoAnalisi = 'trimestre'">6M</button>
          <button :class="{ active: periodoAnalisi === 'anno' }" @click="periodoAnalisi = 'anno'">1A</button>
        </div>
        <div class="stats-grid">
          <WCard><span class="stat-label">Versato</span><span class="stat-val">{{ formatValuta(analisi.totale_versato) }}</span></WCard>
          <WCard><span class="stat-label">Attuale</span><span class="stat-val">{{ formatValuta(analisi.patrimonio_attuale) }}</span></WCard>
          <WCard><span class="stat-label">Rendimento</span><span class="stat-val" :class="(analisi.rendimento_netto || 0) >= 0 ? 'positive' : 'negative'">{{ formatValuta(analisi.rendimento_netto) }}</span></WCard>
          <WCard><span class="stat-label">ROI</span><span class="stat-val">{{ analisi.rendimento_percentuale || 0 }}%</span></WCard>
        </div>
        <WCard v-if="investimentiStore.investimenti.length" class="chart-card">
          <h3 class="chart-title">Distribuzione portafoglio</h3>
          <Doughnut :data="doughnutData" :options="chartOpts" />
        </WCard>
        <WCard v-if="analisi.andamento_mensile?.length" class="chart-card">
          <h3 class="chart-title">Andamento saldo</h3>
          <Line :data="lineData" :options="chartOpts" />
        </WCard>
        <WCard v-if="analisi.andamento_mensile?.length" class="chart-card">
          <h3 class="chart-title">Versamenti vs Prelievi</h3>
          <Bar :data="barMesiData" :options="chartOpts" />
        </WCard>
        <WCard v-if="analisi.per_investimento?.length" class="roi-table">
          <div class="roi-header">| Piattaforma | Versato | Attuale | ROI |</div>
          <div v-for="inv in analisi.per_investimento" :key="inv.id" class="roi-row">
            <span>{{ inv.nome_piattaforma }}</span>
            <span>{{ formatValuta(inv.totale_versato) }}</span>
            <span>{{ formatValuta(inv.saldo_attuale) }}</span>
            <span :class="(inv.rendimento_percentuale || 0) >= 0 ? 'positive' : 'negative'">
              {{ (inv.rendimento_percentuale || 0) >= 0 ? '+' : '' }}{{ inv.rendimento_percentuale || 0 }}%
            </span>
          </div>
        </WCard>
      </div>

      <!-- STORICO -->
      <div v-else>
        <div class="filtri">
          <div class="filtro-tabs">
            <button :class="{ active: !filtroTipo }" @click="filtroTipo = ''">Tutti</button>
            <button :class="{ active: filtroTipo === 'versamento' }" @click="filtroTipo = 'versamento'">Versamenti</button>
            <button :class="{ active: filtroTipo === 'prelievo' }" @click="filtroTipo = 'prelievo'">Prelievi</button>
            <button :class="{ active: filtroTipo === 'rendimento' }" @click="filtroTipo = 'rendimento'">Rendimenti</button>
            <button :class="{ active: filtroTipo === 'perdita' }" @click="filtroTipo = 'perdita'">Perdite</button>
          </div>
          <select v-model="filtroInv" class="form-input">
            <option value="">Tutte le piattaforme</option>
            <option v-for="inv in investimentiStore.investimenti" :key="inv.id" :value="inv.id">{{ inv.nome_piattaforma }}</option>
          </select>
        </div>
        <WCard v-if="investimentiStore.movimenti.length">
          <div v-for="m in investimentiStore.movimenti" :key="m.id" class="mov-row stagger-item">
            <component :is="tipoIcon(m.tipo)" :size="16" :stroke-width="1.75" />
            <span>{{ m.tipo }} {{ m.investimento?.nome_piattaforma || m.investimento_nome }}</span>
            <span :class="importoClass(m.tipo)">{{ importoPrefix(m.tipo) }}{{ formatValuta(m.importo) }}</span>
            <span class="mov-data">{{ formatData(m.data, 'corto') }}</span>
          </div>
        </WCard>
        <WCard v-else class="empty-small">Nessun movimento</WCard>
      </div>
    </template>

    <WModal :open="showNuovo" title="Nuovo investimento" @close="showNuovo = false">
      <div class="form-space">
        <input v-model="nuovoForm.nome_piattaforma" class="form-input" placeholder="Nome piattaforma (es: eToro)" />
        <div class="tipo-grid">
          <button v-for="t in TIPI" :key="t.id" :class="{ active: nuovoForm.tipo === t.id }" @click="nuovoForm.tipo = t.id">
            <component :is="t.icon" :size="16" :stroke-width="1.75" />
            <span>{{ t.label }}</span>
          </button>
        </div>
        <input v-model.number="nuovoForm.saldo_iniziale" type="number" min="0" inputmode="decimal" class="form-input" placeholder="Saldo iniziale €" />
        <div class="colori">
          <button v-for="c in COLORI" :key="c" class="color-btn" :style="{ background: c }" :class="{ active: nuovoForm.colore === c }" @click="nuovoForm.colore = c" />
        </div>
        <input v-model="nuovoForm.note" class="form-input" placeholder="Note (opzionale)" />
        <WButton variant="primary" size="lg" :loading="loading" @click="creaInvestimento">Aggiungi investimento</WButton>
      </div>
    </WModal>

    <WModal :open="showMovimento" title="Operazione investimento" @close="showMovimento = false">
      <div class="form-space">
        <div class="tipo-grid">
          <button v-for="t in TIPO_OPS" :key="t.id" :class="{ active: movForm.tipo === t.id }" @click="movForm.tipo = t.id">
            <component :is="t.icon" :size="18" :stroke-width="1.75" />
            <span>{{ t.label }}</span>
          </button>
        </div>
        <label class="toggle-row">
          <input v-model="movForm.usaSaldoDiretto" type="checkbox" />
          <span>Aggiorna saldo direttamente</span>
        </label>
        <input v-if="movForm.usaSaldoDiretto" v-model.number="movForm.saldo_dopo" type="number" inputmode="decimal" class="form-input" :placeholder="`Saldo attuale su ${invSelezionato?.nome_piattaforma}`" />
        <input v-else v-model.number="movForm.importo" type="number" min="0" inputmode="decimal" class="form-input form-input--lg" placeholder="Importo €" />
        <input v-model="movForm.data" type="date" class="form-input" />
        <template v-if="movForm.tipo === 'versamento' || movForm.tipo === 'prelievo'">
          <select v-model="movForm.conto_collegato_id" class="form-input">
            <option :value="null">Nessun conto collegato</option>
            <option v-for="c in contiStore.contiAttivi" :key="c.id" :value="c.id">{{ c.icona }} {{ c.nome }}</option>
          </select>
        </template>
        <input v-model="movForm.nota" class="form-input" placeholder="Nota (opzionale)" />
        <p v-if="messaggioTipo" class="hint">{{ messaggioTipo }}</p>
        <WButton variant="primary" size="lg" :loading="loading" @click="confermaMovimento">Conferma</WButton>
      </div>
    </WModal>

    <WModal :open="showAggiornaSaldo" title="Aggiorna saldo" @close="showAggiornaSaldo = false">
      <div class="form-space">
        <p>Qual è il saldo attuale su <strong>{{ invSelezionato?.nome_piattaforma }}</strong>?</p>
        <input v-model.number="saldoAggiornamento" type="number" inputmode="decimal" class="form-input form-input--lg" placeholder="€" />
        <p class="hint">Il sistema calcola automaticamente rendimento o perdita rispetto al saldo precedente</p>
        <WButton variant="primary" size="lg" :loading="loading" @click="confermaAggiornaSaldo">Salva</WButton>
      </div>
    </WModal>
  </div>
</template>

<style scoped>
.page-header { margin-bottom: 1rem; }
.page-title { font-size: 1.5rem; font-weight: 700; color: var(--text-primary); }
.hero-card { text-align: center; padding: 1.5rem; margin-bottom: 1.25rem; }
.hero-label { font-size: 0.6875rem; letter-spacing: 0.1em; color: var(--text-muted); }
.hero-amount { font-size: 2.5rem; font-weight: 800; color: var(--text-primary); margin: 0.5rem 0; }
.hero-rend { font-size: 0.875rem; }
.empty { text-align: center; padding: 3rem 1rem; }
.empty-icon { display: block; margin: 0 auto 1rem; color: var(--text-muted); stroke: currentColor; }
.tab-nav button { display: inline-flex; align-items: center; gap: 0.375rem; }
.tab-icon { stroke: currentColor; flex-shrink: 0; }
.tipo-grid button { display: flex; flex-direction: column; align-items: center; gap: 0.375rem; }
.tipo-grid button svg { stroke: currentColor; color: var(--accent-green); }
.empty h2 { color: var(--text-primary); margin-bottom: 0.5rem; }
.empty p { color: var(--text-secondary); margin-bottom: 1.5rem; }
.empty-small { text-align: center; padding: 2rem; color: var(--text-secondary); }
.tab-nav { display: flex; gap: 0.5rem; margin-bottom: 1.25rem; flex-wrap: wrap; }
.tab-nav button { padding: 0.5rem 1rem; border-radius: 999px; border: 1px solid var(--border); background: var(--bg-input); color: var(--text-secondary); cursor: pointer; min-height: 44px; }
.tab-nav button.active { background: var(--accent-green); color: var(--accent-on); border-color: var(--accent-green); font-weight: 600; }
.inv-grid { display: grid; grid-template-columns: 1fr; gap: 1rem; }
@media (min-width: 768px) { .inv-grid { grid-template-columns: repeat(2, 1fr); } }
.inv-card { padding: 0 !important; overflow: hidden; }
.inv-header { padding: 1rem 1rem 0.5rem; }
.inv-header h3 { font-size: 1rem; font-weight: 700; color: var(--text-primary); }
.inv-tipo { font-size: 0.75rem; color: var(--text-muted); }
.inv-saldo-label { padding: 0 1rem; font-size: 0.75rem; color: var(--text-muted); }
.inv-saldo { padding: 0 1rem; font-size: 1.5rem; font-weight: 800; color: var(--text-primary); }
.inv-stats, .inv-rend { padding: 0 1rem; font-size: 0.8125rem; color: var(--text-secondary); }
.inv-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; padding: 1rem; }
.inv-actions button { padding: 0.625rem; border-radius: var(--radius-sm); border: 1px solid var(--border); background: var(--bg-input); cursor: pointer; min-height: 44px; color: var(--text-primary); }
.periodo-tabs, .filtro-tabs { display: flex; gap: 0.375rem; flex-wrap: wrap; margin-bottom: 1rem; }
.periodo-tabs button, .filtro-tabs button { padding: 0.5rem 0.875rem; border-radius: 999px; border: 1px solid var(--border); background: var(--bg-input); color: var(--text-secondary); cursor: pointer; min-height: 44px; }
.periodo-tabs button.active, .filtro-tabs button.active { background: var(--accent-green); color: var(--accent-on); border-color: var(--accent-green); }
.stats-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; margin-bottom: 1rem; }
.stat-label { display: block; font-size: 0.75rem; color: var(--text-muted); }
.stat-val { font-size: 1.125rem; font-weight: 700; }
.chart-card { margin-bottom: 1rem; padding: 1rem; }
.chart-title { font-size: 0.875rem; font-weight: 600; margin-bottom: 1rem; }
.roi-table { padding: 1rem; }
.roi-header { font-size: 0.75rem; color: var(--text-muted); margin-bottom: 0.75rem; }
.roi-row { display: grid; grid-template-columns: 2fr 1fr 1fr 1fr; gap: 0.5rem; padding: 0.5rem 0; border-bottom: 1px solid var(--border); font-size: 0.8125rem; }
.filtri { display: flex; flex-direction: column; gap: 0.75rem; margin-bottom: 1rem; }
.mov-row { display: flex; align-items: center; gap: 0.5rem; padding: 0.75rem 0; border-bottom: 1px solid var(--border); font-size: 0.875rem; flex-wrap: wrap; }
.mov-data { margin-left: auto; color: var(--text-muted); font-size: 0.75rem; }
.positive { color: var(--positive); }
.negative { color: var(--negative); }
.form-space { display: flex; flex-direction: column; gap: 0.75rem; }
.form-input { width: 100%; background: var(--bg-input); border: 1px solid var(--border); border-radius: var(--radius-md); padding: 0.75rem; color: var(--text-primary); font-size: 16px; min-height: 44px; }
.form-input--lg { font-size: 1.5rem; font-weight: 700; text-align: center; }
.tipo-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; }
.tipo-grid button { padding: 0.75rem 0.5rem; border-radius: var(--radius-md); border: 1px solid var(--border); background: var(--bg-input); color: var(--text-secondary); cursor: pointer; font-size: 0.8125rem; min-height: 44px; }
.tipo-grid button.active { border-color: var(--accent-purple); color: var(--accent-purple); background: rgba(108, 92, 231, 0.1); }
.colori { display: flex; gap: 0.5rem; flex-wrap: wrap; }
.color-btn { width: 32px; height: 32px; border-radius: 50%; border: 2px solid transparent; cursor: pointer; }
.color-btn.active { border-color: var(--text-primary); }
.toggle-row { display: flex; align-items: center; gap: 0.5rem; font-size: 0.875rem; color: var(--text-secondary); }
.hint { font-size: 0.8125rem; color: var(--text-muted); }
.mt-4 { margin-top: 1rem; }
</style>
