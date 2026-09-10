<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import { Bar, Line } from 'vue-chartjs';
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement, PointElement, LineElement, Filler,
} from 'chart.js';
import WCard from '@/components/common/WCard.vue';
import WButton from '@/components/common/WButton.vue';
import WModal from '@/components/common/WModal.vue';
import { useScommesseStore } from '@/stores/scommesse.store';
import { useContiStore } from '@/stores/conti.store';
import { useToastStore } from '@/stores/toast.store';
import { useValuta } from '@/composables/useValuta';
import { useChartTheme } from '@/composables/useChartTheme';
import { formatData } from '@/utils/formatters';
import { BarChart3, TrendingUp, ClipboardList, Dices, Trophy, TrendingDown, ArrowDownCircle, ArrowUpCircle, AlertTriangle, X } from '@/utils/appIcons';
import dayjs from 'dayjs';

ChartJS.register(CategoryScale, LinearScale, BarElement, PointElement, LineElement, Filler);

const scommesseStore = useScommesseStore();
const contiStore = useContiStore();
const toastStore = useToastStore();
const { formatValuta } = useValuta();
const { baseOptions } = useChartTheme();

const activeTab = ref('panoramica');
const showNuovaPiattaforma = ref(false);
const showMovimento = ref(false);
const loading = ref(false);

const filtroTipo = ref('');
const filtroPiattaforma = ref('');
const filtroPeriodo = ref('mese');
const periodoAnalisi = ref('mese');

const piattaformaForm = ref({ nome: '', saldo_iniziale: 0, limite_mensile: null });
const movForm = ref({
  tipo: 'deposito',
  piattaforma_id: null,
  importo: null,
  data: dayjs().format('YYYY-MM-DD'),
  nota: '',
  conto_collegato_id: null,
});

const tabs = [
  { id: 'panoramica', label: 'Panoramica', icon: BarChart3 },
  { id: 'analisi', label: 'Analisi', icon: TrendingUp },
  { id: 'storico', label: 'Storico', icon: ClipboardList },
];

const MOVIMENTO_ICONS = {
  deposito: ArrowDownCircle,
  prelievo: ArrowUpCircle,
  vincita: Trophy,
  perdita: TrendingDown,
};

const TIPO_OPS = [
  { id: 'deposito', label: 'Deposito', desc: 'Metti soldi sulla piattaforma', icon: ArrowDownCircle },
  { id: 'prelievo', label: 'Prelievo', desc: 'Ritira soldi dalla piattaforma', icon: ArrowUpCircle },
  { id: 'vincita', label: 'Vincita', desc: 'Hai vinto una scommessa', icon: Trophy },
  { id: 'perdita', label: 'Perdita', desc: 'Hai perso una scommessa', icon: TrendingDown },
];

const pan = computed(() => scommesseStore.panoramica);
const analisi = computed(() => scommesseStore.analisi);

const piattaformaSelezionata = computed(() =>
  scommesseStore.piattaforme.find((p) => p.id === movForm.value.piattaforma_id)
);

const getDateRange = (periodo) => {
  const now = dayjs();
  if (periodo === 'mese') return { da: now.startOf('month').format('YYYY-MM-DD'), a: now.format('YYYY-MM-DD') };
  if (periodo === 'trimestre') return { da: now.subtract(3, 'month').format('YYYY-MM-DD'), a: now.format('YYYY-MM-DD') };
  return { da: now.subtract(1, 'year').format('YYYY-MM-DD'), a: now.format('YYYY-MM-DD') };
};

const barAnalisiData = computed(() => ({
  labels: ['Vincite', 'Perdite'],
  datasets: [{
    data: [analisi.value.totale_vincite || 0, analisi.value.totale_perdite || 0],
    backgroundColor: ['#00D4AA', '#FF4757'],
  }],
}));

const barOptions = computed(() => ({
  ...baseOptions.value,
  plugins: { ...baseOptions.value.plugins, legend: { display: false } },
}));

const lineAnalisiData = computed(() => {
  const perPiatt = analisi.value.per_piattaforma || [];
  return {
    labels: perPiatt.map((p) => p.nome),
    datasets: [{
      label: 'Bilancio netto',
      data: perPiatt.map((p) => p.bilancio_netto),
      borderColor: '#00D4AA',
      backgroundColor: 'rgba(0,212,170,0.15)',
      fill: true,
      tension: 0.4,
    }],
  };
});

const tipoLabel = (tipo) => {
  const map = { deposito: 'Deposito', prelievo: 'Prelievo', vincita: 'Vincita', perdita: 'Perdita' };
  return map[tipo] || tipo;
};

const tipoIcon = (tipo) => MOVIMENTO_ICONS[tipo] || ArrowDownCircle;

const importoClass = (tipo) => {
  if (tipo === 'vincita' || tipo === 'prelievo') return 'positive';
  if (tipo === 'perdita' || tipo === 'deposito') return 'negative';
  return '';
};

const importoPrefix = (tipo) => {
  if (tipo === 'vincita' || tipo === 'prelievo') return '+';
  if (tipo === 'perdita' || tipo === 'deposito') return '-';
  return '';
};

const caricaStorico = async () => {
  const params = {};
  if (filtroTipo.value) params.tipo = filtroTipo.value;
  if (filtroPiattaforma.value) params.piattaforma_id = filtroPiattaforma.value;
  const range = getDateRange(filtroPeriodo.value);
  params.da = range.da;
  params.a = range.a;
  await scommesseStore.fetchMovimenti(params);
};

const caricaAnalisi = async () => {
  const range = getDateRange(periodoAnalisi.value);
  await scommesseStore.fetchAnalisi(range);
};

watch([activeTab, filtroTipo, filtroPiattaforma, filtroPeriodo], () => {
  if (activeTab.value === 'storico') caricaStorico();
});

watch([activeTab, periodoAnalisi], () => {
  if (activeTab.value === 'analisi') caricaAnalisi();
});

onMounted(async () => {
  await contiStore.fetchConti();
  await scommesseStore.fetchPiattaforme();
  await scommesseStore.fetchPanoramica();
  await scommesseStore.fetchMovimenti();
});

const creaPiattaforma = async () => {
  const nome = piattaformaForm.value.nome?.trim();
  if (!nome) return;
  loading.value = true;
  try {
    const payload = {
      nome,
      saldo_iniziale: Number(piattaformaForm.value.saldo_iniziale) || 0,
    };
    const limite = Number(piattaformaForm.value.limite_mensile);
    if (Number.isFinite(limite) && limite > 0) {
      payload.limite_mensile = limite;
    }
    await scommesseStore.createPiattaforma(payload);
    toastStore.success('Piattaforma aggiunta e collegata come conto scommesse');
    showNuovaPiattaforma.value = false;
    piattaformaForm.value = { nome: '', saldo_iniziale: 0, limite_mensile: null };
  } catch (err) {
    const apiMsg = err.response?.data?.message
      || err.response?.data?.errori?.[0]?.messaggio
      || err.response?.data?.error;
    toastStore.error(apiMsg || 'Errore nell\'aggiunta della piattaforma');
  } finally {
    loading.value = false;
  }
};

const apriMovimento = (tipo, piattaformaId = null) => {
  movForm.value = {
    tipo,
    piattaforma_id: piattaformaId || scommesseStore.piattaforme[0]?.id,
    importo: null,
    data: dayjs().format('YYYY-MM-DD'),
    nota: '',
    conto_collegato_id: tipo === 'deposito' || tipo === 'prelievo'
      ? (contiStore.contiAttivi[0]?.id || null)
      : null,
  };
  showMovimento.value = true;
};

const messaggiTipo = computed(() => {
  if (movForm.value.tipo === 'vincita') return 'I soldi vengono aggiunti al saldo della piattaforma';
  if (movForm.value.tipo === 'perdita') return 'I soldi vengono scalati dal saldo della piattaforma';
  if (movForm.value.tipo === 'prelievo') return 'Conto opzionale: se non scelto = contanti fisici';
  return null;
});

const confermaMovimento = async () => {
  if (!movForm.value.importo || !movForm.value.piattaforma_id) return;
  loading.value = true;
  try {
    const payload = { ...movForm.value };
    if (!payload.conto_collegato_id) delete payload.conto_collegato_id;
    await scommesseStore.addMovimento(payload);
    const labels = { deposito: 'Deposito', prelievo: 'Prelievo', vincita: 'Vincita', perdita: 'Perdita' };
    toastStore.success(`${labels[movForm.value.tipo]} registrato`);
    showMovimento.value = false;
    if (activeTab.value === 'analisi') await caricaAnalisi();
    if (activeTab.value === 'storico') await caricaStorico();
  } catch (err) {
    toastStore.error(err.response?.data?.message || 'Errore');
  } finally {
    loading.value = false;
  }
};

const eliminaPiattaforma = async (p) => {
  if (!confirm(`Eliminare ${p.nome}?`)) return;
  await scommesseStore.deletePiattaforma(p.id);
  toastStore.success('Piattaforma eliminata');
};

const getPiattaformaPan = (id) => pan.value.piattaforme?.find((p) => p.id === id);
</script>

<template>
  <div class="scommesse-view animate-fade-in">
    <div v-if="!scommesseStore.loading && !scommesseStore.piattaforme.length" class="empty">
      <Dices class="empty-icon" :size="48" :stroke-width="1.5" />
      <h2>Tieni traccia delle tue scommesse</h2>
      <p>Monitora depositi, prelievi, vincite e perdite per ogni piattaforma</p>
      <WButton variant="primary" size="md" @click="showNuovaPiattaforma = true">Aggiungi piattaforma</WButton>
    </div>

    <template v-else>
      <div class="tab-nav">
        <button v-for="tab in tabs" :key="tab.id" :class="{ active: activeTab === tab.id }" @click="activeTab = tab.id">
          <component :is="tab.icon" class="tab-icon" :size="16" :stroke-width="1.75" />
          <span>{{ tab.label }}</span>
        </button>
      </div>

      <!-- PANORAMICA -->
      <div v-if="activeTab === 'panoramica'">
        <div v-if="pan.limite?.limite_raggiunto" class="alert alert--danger">
          <AlertTriangle :size="16" :stroke-width="1.75" />
          Limite mensile raggiunto ({{ formatValuta(pan.depositi_mese) }})
        </div>
        <div v-else-if="pan.limite?.vicino_limite" class="alert alert--warning">
          <AlertTriangle :size="16" :stroke-width="1.75" />
          Hai usato l'{{ Math.round(pan.limite.percentuale_limite) }}% del limite mensile
        </div>

        <WCard class="pan-card">
          <p class="pan-bilancio">
            Bilancio netto:
            <span :class="(pan.bilancio_netto || 0) >= 0 ? 'positive' : 'negative'">
              {{ formatValuta(pan.bilancio_netto) }}
            </span>
          </p>
          <p class="pan-detail pan-detail--icons">
            <span><Trophy :size="14" /> Vincite {{ formatValuta(pan.totale_vincite) }}</span>
            <span><TrendingDown :size="14" /> Perdite {{ formatValuta(pan.totale_perdite) }}</span>
          </p>
        </WCard>

        <div class="piattaforme-grid">
          <WCard v-for="p in scommesseStore.piattaforme" :key="p.id" class="piatt-card stagger-item">
            <div class="piatt-header">
              <h3>{{ p.nome }}</h3>
              <button class="del-btn" aria-label="Elimina" @click="eliminaPiattaforma(p)">
                <X :size="16" :stroke-width="1.75" />
              </button>
            </div>
            <p class="piatt-saldo">Saldo: <strong>{{ formatValuta(p.saldo) }}</strong></p>
            <p class="piatt-stats">Dep: {{ formatValuta(p.totale_depositato) }} · Prel: {{ formatValuta(p.totale_prelevato) }}</p>
            <p class="piatt-stats piatt-stats--icons">
              <span><Trophy :size="14" /> {{ formatValuta(p.totale_vincite) }}</span>
              <span><TrendingDown :size="14" /> {{ formatValuta(p.totale_perdite) }}</span>
            </p>
            <p class="piatt-bilancio" :class="(p.bilancio_reale ?? p.bilancio) >= 0 ? 'positive' : 'negative'">
              Bilancio: {{ formatValuta(p.bilancio_reale ?? p.bilancio) }}
            </p>
            <div v-if="p.limite_mensile" class="limite-bar-wrap">
              <div class="limite-bar" :style="{ width: Math.min(getPiattaformaPan(p.id)?.percentuale_limite || 0, 100) + '%' }" />
            </div>
            <div class="piatt-actions">
              <button @click="apriMovimento('deposito', p.id)">Deposito</button>
              <button @click="apriMovimento('prelievo', p.id)">Prelievo</button>
              <button @click="apriMovimento('vincita', p.id)">Vincita</button>
              <button @click="apriMovimento('perdita', p.id)">Perdita</button>
            </div>
          </WCard>
        </div>

        <WButton variant="secondary" size="md" class="mt-4" @click="showNuovaPiattaforma = true">+ Aggiungi piattaforma</WButton>
      </div>

      <!-- ANALISI -->
      <div v-else-if="activeTab === 'analisi'">
        <div class="periodo-tabs">
          <button :class="{ active: periodoAnalisi === 'mese' }" @click="periodoAnalisi = 'mese'">Mese</button>
          <button :class="{ active: periodoAnalisi === 'trimestre' }" @click="periodoAnalisi = 'trimestre'">Trimestre</button>
          <button :class="{ active: periodoAnalisi === 'anno' }" @click="periodoAnalisi = 'anno'">Anno</button>
        </div>

        <div class="stats-grid">
          <WCard><span class="stat-label"><Trophy :size="14" /> Vincite</span><span class="stat-val positive">{{ formatValuta(analisi.totale_vincite) }}</span></WCard>
          <WCard><span class="stat-label"><TrendingDown :size="14" /> Perdite</span><span class="stat-val negative">{{ formatValuta(analisi.totale_perdite) }}</span></WCard>
          <WCard><span class="stat-label">Bilancio netto</span><span class="stat-val" :class="(analisi.bilancio_netto || 0) >= 0 ? 'positive' : 'negative'">{{ formatValuta(analisi.bilancio_netto) }}</span></WCard>
          <WCard><span class="stat-label">% vittorie</span><span class="stat-val">{{ analisi.percentuale_vincite || 0 }}%</span></WCard>
        </div>

        <WCard class="chart-card">
          <h3 class="chart-title">Vincite vs Perdite</h3>
          <Bar :data="barAnalisiData" :options="barOptions" />
        </WCard>

        <WCard v-if="analisi.per_piattaforma?.length" class="chart-card">
          <h3 class="chart-title">Bilancio per piattaforma</h3>
          <Line :data="lineAnalisiData" :options="barOptions" />
        </WCard>

        <WCard v-if="analisi.sessione_migliore" class="sessione-card positive">
          Sessione migliore: +{{ formatValuta(analisi.sessione_migliore.importo) }} il {{ formatData(analisi.sessione_migliore.data, 'corto') }}
        </WCard>
        <WCard v-if="analisi.sessione_peggiore" class="sessione-card negative">
          Sessione peggiore: -{{ formatValuta(analisi.sessione_peggiore.importo) }} il {{ formatData(analisi.sessione_peggiore.data, 'corto') }}
        </WCard>
      </div>

      <!-- STORICO -->
      <div v-else>
        <div class="filtri">
          <select v-model="filtroTipo" class="form-input">
            <option value="">Tutti i tipi</option>
            <option value="deposito">Deposito</option>
            <option value="prelievo">Prelievo</option>
            <option value="vincita">Vincita</option>
            <option value="perdita">Perdita</option>
          </select>
          <select v-model="filtroPiattaforma" class="form-input">
            <option value="">Tutte le piattaforme</option>
            <option v-for="p in scommesseStore.piattaforme" :key="p.id" :value="p.id">{{ p.nome }}</option>
          </select>
          <div class="periodo-tabs">
            <button :class="{ active: filtroPeriodo === 'mese' }" @click="filtroPeriodo = 'mese'">Mese</button>
            <button :class="{ active: filtroPeriodo === 'trimestre' }" @click="filtroPeriodo = 'trimestre'">Trimestre</button>
            <button :class="{ active: filtroPeriodo === 'anno' }" @click="filtroPeriodo = 'anno'">Anno</button>
          </div>
        </div>

        <WCard v-if="scommesseStore.movimenti.length">
          <div v-for="m in scommesseStore.movimenti" :key="m.id" class="mov-row stagger-item">
            <component :is="tipoIcon(m.tipo)" :size="16" :stroke-width="1.75" />
            <span>{{ tipoLabel(m.tipo) }} {{ m.piattaforma?.nome }}</span>
            <span v-if="m.nota" class="mov-nota">{{ m.nota }}</span>
            <span :class="importoClass(m.tipo)">
              {{ importoPrefix(m.tipo) }}{{ formatValuta(m.importo) }}
            </span>
            <span class="mov-data">{{ formatData(m.data, 'corto') }}</span>
          </div>
        </WCard>
        <WCard v-else class="empty-small">Nessun movimento nel periodo selezionato</WCard>
      </div>
    </template>

    <WModal :open="showNuovaPiattaforma" title="Nuova piattaforma" @close="showNuovaPiattaforma = false">
      <div class="form-space">
        <input v-model="piattaformaForm.nome" class="form-input" placeholder="Nome (es: Snai, Bet365)" />
        <input v-model.number="piattaformaForm.saldo_iniziale" type="number" min="0" inputmode="decimal" class="form-input" placeholder="Saldo iniziale" />
        <input v-model.number="piattaformaForm.limite_mensile" type="number" min="0" inputmode="decimal" class="form-input" placeholder="Limite mensile (opzionale)" />
        <WButton variant="primary" size="lg" :loading="loading" @click="creaPiattaforma">Aggiungi</WButton>
      </div>
    </WModal>

    <WModal :open="showMovimento" title="Operazione scommesse" @close="showMovimento = false">
      <div class="form-space">
        <div class="tipo-grid">
          <button
            v-for="t in TIPO_OPS"
            :key="t.id"
            :class="{ active: movForm.tipo === t.id }"
            @click="movForm.tipo = t.id"
          >
            <component :is="t.icon" :size="18" :stroke-width="1.75" />
            <span>{{ t.label }}</span>
          </button>
        </div>
        <select v-model="movForm.piattaforma_id" class="form-input">
          <option v-for="p in scommesseStore.piattaforme" :key="p.id" :value="p.id">{{ p.nome }}</option>
        </select>
        <input v-model.number="movForm.importo" type="number" min="0" inputmode="decimal" class="form-input form-input--lg" placeholder="Importo" />
        <p v-if="piattaformaSelezionata && (movForm.tipo === 'prelievo' || movForm.tipo === 'perdita')" class="hint">
          Saldo disponibile: {{ formatValuta(piattaformaSelezionata.saldo) }}
        </p>
        <input v-model="movForm.data" type="date" class="form-input" />
        <template v-if="movForm.tipo === 'deposito' || movForm.tipo === 'prelievo'">
          <select v-model="movForm.conto_collegato_id" class="form-input">
            <option :value="null">Nessun conto (solo piattaforma)</option>
            <option v-for="c in contiStore.contiAttivi" :key="c.id" :value="c.id">{{ c.icona }} {{ c.nome }}</option>
          </select>
        </template>
        <input v-model="movForm.nota" class="form-input" placeholder="Nota (opzionale)" />
        <p v-if="messaggiTipo" class="hint">{{ messaggiTipo }}</p>
        <WButton variant="primary" size="lg" :loading="loading" @click="confermaMovimento">Conferma</WButton>
      </div>
    </WModal>
  </div>
</template>

<style scoped>
.empty { text-align: center; padding: 4rem 1rem; }
.empty-icon { display: block; margin: 0 auto 1rem; color: var(--text-muted); stroke: currentColor; }
.empty h2 { font-size: 1.25rem; color: var(--text-primary); margin-bottom: 0.5rem; }
.empty p { color: var(--text-secondary); margin-bottom: 1.5rem; }
.empty-small { text-align: center; padding: 2rem; color: var(--text-secondary); }
.tab-nav { display: flex; gap: 0.5rem; margin-bottom: 1.25rem; flex-wrap: wrap; }
.tab-nav button { padding: 0.5rem 1rem; border-radius: 999px; border: 1px solid var(--border); background: var(--bg-input); color: var(--text-secondary); cursor: pointer; min-height: 44px; display: inline-flex; align-items: center; gap: 0.375rem; }
.tab-nav button.active .tab-icon { color: var(--accent-on); }
.tab-icon { stroke: currentColor; flex-shrink: 0; }
.alert { padding: 0.875rem 1rem; border-radius: var(--radius-md); margin-bottom: 1rem; font-size: 0.875rem; display: flex; align-items: center; gap: 0.5rem; }
.pan-detail--icons, .piatt-stats--icons { display: flex; flex-wrap: wrap; gap: 0.75rem; }
.pan-detail--icons span, .piatt-stats--icons span { display: inline-flex; align-items: center; gap: 0.375rem; }
.stat-label { display: inline-flex !important; align-items: center; gap: 0.375rem; }
.stat-label svg { stroke: currentColor; }
.tipo-grid button { display: flex; flex-direction: column; align-items: center; gap: 0.375rem; }
.tipo-grid button svg { stroke: currentColor; color: var(--accent-green); }
.alert--danger { background: rgba(255, 71, 87, 0.15); border: 1px solid var(--negative); color: var(--negative); }
.alert--warning { background: rgba(255, 165, 2, 0.15); border: 1px solid var(--warning); color: var(--warning); }
.pan-card { text-align: center; padding: 1.5rem; margin-bottom: 1.5rem; }
.pan-bilancio { font-size: 1.125rem; font-weight: 700; color: var(--text-primary); }
.pan-detail { font-size: 0.875rem; color: var(--text-secondary); margin-top: 0.375rem; }
.piattaforme-grid { display: grid; grid-template-columns: 1fr; gap: 1rem; }
@media (min-width: 768px) { .piattaforme-grid { grid-template-columns: repeat(2, 1fr); } }
.piatt-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem; }
.piatt-header h3 { font-size: 1rem; font-weight: 700; color: var(--text-primary); }
.del-btn { background: none; border: none; color: var(--text-muted); cursor: pointer; min-width: 44px; min-height: 44px; display: inline-flex; align-items: center; justify-content: center; }
.del-btn svg { stroke: currentColor; }
.tab-nav button.active { background: var(--accent-green); color: var(--accent-on); border-color: var(--accent-green); font-weight: 600; }
.piatt-saldo { font-size: 0.9375rem; color: var(--text-primary); margin-bottom: 0.25rem; }
.piatt-stats, .piatt-bilancio { font-size: 0.8125rem; color: var(--text-secondary); margin-bottom: 0.25rem; }
.limite-bar-wrap { height: 6px; background: var(--bg-input); border-radius: 3px; margin: 0.75rem 0; }
.limite-bar { height: 100%; background: var(--warning); border-radius: 3px; }
.piatt-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; margin-top: 0.75rem; }
.piatt-actions button { padding: 0.5rem; border-radius: var(--radius-sm); border: 1px solid var(--border); background: var(--bg-input); color: var(--text-primary); cursor: pointer; font-size: 0.75rem; min-height: 44px; }
.periodo-tabs { display: flex; gap: 0.375rem; margin-bottom: 1rem; flex-wrap: wrap; }
.periodo-tabs button { padding: 0.5rem 0.875rem; border-radius: 999px; border: 1px solid var(--border); background: var(--bg-input); color: var(--text-secondary); cursor: pointer; min-height: 44px; }
.periodo-tabs button.active { background: var(--accent-green); color: var(--accent-on); border-color: var(--accent-green); }
.stats-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; margin-bottom: 1rem; }
.stat-label { display: block; font-size: 0.75rem; color: var(--text-muted); margin-bottom: 0.25rem; }
.stat-val { font-size: 1.125rem; font-weight: 700; color: var(--text-primary); }
.chart-card { margin-bottom: 1rem; padding: 1rem; }
.chart-title { font-size: 0.875rem; font-weight: 600; margin-bottom: 1rem; color: var(--text-primary); }
.sessione-card { margin-bottom: 0.75rem; padding: 1rem; font-size: 0.875rem; font-weight: 500; }
.filtri { display: flex; flex-direction: column; gap: 0.75rem; margin-bottom: 1rem; }
.mov-row { display: flex; align-items: center; gap: 0.5rem; padding: 0.75rem 0; border-bottom: 1px solid var(--border); font-size: 0.875rem; flex-wrap: wrap; }
.mov-nota { color: var(--text-muted); font-size: 0.75rem; flex: 1; }
.mov-data { margin-left: auto; color: var(--text-muted); font-size: 0.75rem; }
.positive { color: var(--positive); }
.negative { color: var(--negative); }
.form-space { display: flex; flex-direction: column; gap: 0.75rem; }
/* .form-input: aspetto condiviso in assets/styles/main.css */
.form-input { min-height: 44px; }
.form-input--lg { font-size: 1.5rem; font-weight: 700; text-align: center; }
.tipo-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; }
.tipo-grid button { padding: 0.75rem 0.5rem; border-radius: var(--radius-md); border: 1px solid var(--border); background: var(--bg-input); color: var(--text-secondary); cursor: pointer; font-size: 0.8125rem; min-height: 44px; }
.tipo-grid button.active { border-color: var(--accent-green); color: var(--accent-green); background: var(--accent-light); }
.hint { font-size: 0.8125rem; color: var(--text-muted); }
.mt-4 { margin-top: 1rem; }
</style>
