<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { useRouter } from 'vue-router';
import { Doughnut, Line } from 'vue-chartjs';
import {
  Chart as ChartJS, ArcElement, Tooltip, CategoryScale, LinearScale,
  PointElement, LineElement, Filler,
} from 'chart.js';
import DataState from '@/components/common/DataState.vue';
import HelpTrigger from '@/components/help/HelpTrigger.vue';
import { etichetta } from '@/content/glossario';
import { useNumberCounter } from '@/composables/useNumberCounter';
import { useValuta } from '@/composables/useValuta';
import { useChartTheme } from '@/composables/useChartTheme';
import { formatVariazione, formatData } from '@/utils/formatters';
import { getCategoriaUscita } from '@/utils/categorie';
import { PieChart, Dices, LineChart, ArrowDown, ArrowUp, Trophy, TrendingDown, Target, Calendar } from '@/utils/appIcons';

ChartJS.register(ArcElement, Tooltip, CategoryScale, LinearScale, PointElement, LineElement, Filler);

const CHART_COLORS = ['#00D4AA', '#FF4757', '#6C5CE7', '#74B9FF', '#FECA57', '#FF9F43', '#A29BFE', '#FD79A8'];

const props = defineProps({
  conti: { type: Array, default: () => [] },
  patrimonio: { type: Number, default: 0 },
  composizione: { type: Object, default: null },
  entrateMese: { type: Number, default: 0 },
  usciteMese: { type: Number, default: 0 },
  entrateOggi: { type: Number, default: 0 },
  usciteOggi: { type: Number, default: 0 },
  variazionePercentuale: { type: Number, default: 0 },
  trendPositive: { type: Boolean, default: true },
  andamentoPunti: { type: Array, default: () => [] },
  hasBudget: { type: Boolean, default: false },
  budgetStato: { type: Array, default: () => [] },
  budgetTotale: { type: Number, default: 0 },
  mostraScommesse: { type: Boolean, default: false },
  scommesseAttivo: { type: Boolean, default: false },
  scommesseAnalisi: { type: Object, default: () => ({}) },
  mostraInvestimenti: { type: Boolean, default: false },
  investimentiAttivo: { type: Boolean, default: false },
  investimentiAnalisi: { type: Object, default: () => ({}) },
  patrimonioInvestimenti: { type: Number, default: 0 },
  rendimentoInvestimenti: { type: Number, default: 0 },
  rendimentoInvestimentiPct: { type: Number, default: 0 },
  obiettiviAttivi: { type: Array, default: () => [] },
  obiettiviCompletatiCount: { type: Number, default: 0 },
  statoSaldo: { type: String, default: 'pronto' },
  lastUpdatedSaldo: { type: Number, default: null },
  statoConti: { type: String, default: 'pronto' },
  lastUpdatedConti: { type: Number, default: null },
  statoOggi: { type: String, default: 'pronto' },
  lastUpdatedOggi: { type: Number, default: null },
  statoBudgetSezione: { type: String, default: 'pronto' },
  lastUpdatedBudget: { type: Number, default: null },
  statoScommesse: { type: String, default: 'pronto' },
  lastUpdatedScommesse: { type: Number, default: null },
  statoInvestimenti: { type: String, default: 'pronto' },
  lastUpdatedInvestimenti: { type: Number, default: null },
  statoObiettivi: { type: String, default: 'pronto' },
  lastUpdatedObiettivi: { type: Number, default: null },
});

const emit = defineEmits(['riprova-saldo', 'riprova-conti', 'riprova-oggi', 'riprova-budget', 'riprova-scommesse', 'riprova-investimenti', 'riprova-obiettivi']);

const router = useRouter();
const { formatValuta } = useValuta();
const { baseOptions } = useChartTheme();
const trackRef = ref(null);
const activeIndex = ref(0);

const slides = computed(() => {
  const list = ['saldo', 'conti', 'budget', 'uscite-oggi', 'entrate-oggi', 'obiettivi'];
  if (props.mostraScommesse && props.scommesseAttivo) list.push('scommesse');
  if (props.mostraInvestimenti && props.investimentiAttivo) list.push('investimenti');
  return list;
});

const percentualeObiettivo = (obj) => {
  const target = parseFloat(obj.importo_target);
  const attuale = parseFloat(obj.importo_attuale);
  return target > 0 ? Math.min(100, Math.round((attuale / target) * 100)) : 0;
};

const obiettiviInEvidenza = computed(() =>
  [...props.obiettiviAttivi]
    .sort((a, b) => {
      if (a.deadline && b.deadline) return new Date(a.deadline) - new Date(b.deadline);
      if (a.deadline) return -1;
      if (b.deadline) return 1;
      return percentualeObiettivo(b) - percentualeObiettivo(a);
    })
    .slice(0, 3),
);

const obiettivoPrincipale = computed(() => obiettiviInEvidenza.value[0] || null);
const obiettiviSecondari = computed(() => obiettiviInEvidenza.value.slice(1));

const slideCount = computed(() => slides.value.length);

const patrimonioTarget = computed(() => props.patrimonio || 0);
const { displayValue: animatedPatrimonio } = useNumberCounter(patrimonioTarget, { duration: 900 });

const sparklinePath = computed(() => {
  const pts = props.andamentoPunti;
  if (!pts.length) {
    return props.trendPositive
      ? 'M2 22 L20 18 L40 20 L60 12 L80 14 L98 6'
      : 'M2 8 L20 12 L40 10 L60 18 L80 16 L98 22';
  }
  const values = pts.map((p) => parseFloat(p.patrimonio) || 0);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  return values.map((v, i) => {
    const x = 2 + (i / Math.max(values.length - 1, 1)) * 96;
    const y = 28 - ((v - min) / range) * 22;
    return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(' ');
});

const budgetChartItems = computed(() =>
  props.budgetStato
    .filter((c) => parseFloat(c.budget_importo) > 0)
    .slice(0, 6),
);

const budgetDoughnutData = computed(() => ({
  labels: budgetChartItems.value.map(
    (c) => getCategoriaUscita(c.categoria)?.nome || c.categoria,
  ),
  datasets: [{
    data: budgetChartItems.value.map((c) => parseFloat(c.budget_importo) || 0),
    backgroundColor: budgetChartItems.value.map((_, i) => CHART_COLORS[i % CHART_COLORS.length]),
    borderWidth: 0,
  }],
}));

const doughnutOptions = {
  responsive: true,
  maintainAspectRatio: true,
  cutout: '68%',
  plugins: { legend: { display: false }, tooltip: { enabled: true } },
  animation: { duration: 600 },
};

const investimentiLineData = computed(() => {
  const mesi = props.investimentiAnalisi?.andamento_mensile || [];
  let cum = 0;
  const data = mesi.map((m) => {
    cum += parseFloat(m.saldo_totale) || 0;
    return cum;
  });
  return {
    labels: mesi.map((m) => `${m.mese}/${String(m.anno).slice(-2)}`),
    datasets: [{
      label: 'Patrimonio',
      data,
      borderColor: '#6C5CE7',
      backgroundColor: 'rgba(108, 92, 231, 0.12)',
      fill: true,
      tension: 0.35,
      pointRadius: 2,
    }],
  };
});

const lineChartOptions = computed(() => {
  const base = baseOptions.value || {};
  const scales = base.scales || {};
  const xScale = scales.x || {};
  const yScale = scales.y || {};
  return {
    ...base,
    maintainAspectRatio: false,
    plugins: { ...(base.plugins || {}), legend: { display: false } },
    scales: {
      x: { ...xScale, ticks: { ...(xScale.ticks || {}), maxTicksLimit: 5 } },
      y: { ...yScale, ticks: { ...(yScale.ticks || {}), maxTicksLimit: 4 } },
    },
  };
});

const scommesseVincite = computed(() => parseFloat(props.scommesseAnalisi?.totale_vincite) || 0);
const scommessePerdite = computed(() => parseFloat(props.scommesseAnalisi?.totale_perdite) || 0);
const scommesseBilancio = computed(() => parseFloat(props.scommesseAnalisi?.bilancio_netto) || 0);

const onScroll = () => {
  const el = trackRef.value;
  if (!el) return;
  const width = el.clientWidth;
  if (!width) return;
  activeIndex.value = Math.min(
    Math.max(Math.round(el.scrollLeft / width), 0),
    slideCount.value - 1,
  );
};

const scrollToSlide = (index) => {
  const el = trackRef.value;
  if (!el) return;
  el.scrollTo({ left: index * el.clientWidth, behavior: 'smooth' });
};

watch(slideCount, () => {
  if (activeIndex.value >= slideCount.value) {
    activeIndex.value = 0;
    scrollToSlide(0);
  }
});

onMounted(() => {
  trackRef.value?.addEventListener('scroll', onScroll, { passive: true });
});

onUnmounted(() => {
  trackRef.value?.removeEventListener('scroll', onScroll);
});
</script>

<template>
  <section class="w-overview">
    <div class="w-overview__card">
      <div
        ref="trackRef"
        class="w-overview__track flex overflow-x-auto snap-x snap-mandatory"
        @scroll="onScroll"
      >
        <!-- Patrimonio totale -->
        <div v-if="slides.includes('saldo')" class="w-overview__slide w-full shrink-0 snap-center">
          <DataState
            :stato="statoSaldo"
            :last-updated="lastUpdatedSaldo"
            messaggio-errore="Non è stato possibile caricare il patrimonio."
            skeleton-type="text"
            :skeleton-lines="3"
            @riprova="emit('riprova-saldo')"
          >
            <p class="w-overview__eyebrow">
              {{ etichetta('patrimonio_totale') }}
              <HelpTrigger topic="patrimonio-come-si-calcola" variant="quiet" />
            </p>
            <p class="w-overview__amount tabular-nums">{{ formatValuta(animatedPatrimonio) }}</p>
            <p v-if="composizione" class="w-overview__composizione">
              {{ etichetta('componente_conti') }} <span class="tabular-nums">{{ formatValuta(composizione.conti) }}</span>
              ·
              {{ etichetta('componente_investimenti') }} <span class="tabular-nums">{{ formatValuta(composizione.investimenti) }}</span>
            </p>
            <p class="w-overview__variation" :class="trendPositive ? 'is-positive' : 'is-negative'">
              {{ formatVariazione(variazionePercentuale) }} questo mese
            </p>
            <svg class="w-overview__sparkline" viewBox="0 0 100 32" fill="none" aria-hidden="true">
              <path
                :d="sparklinePath"
                stroke="var(--accent-green)"
                stroke-width="2.5"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
            <div class="w-overview__split">
              <div class="w-overview__split-item">
                <span class="w-overview__split-label">Entrate mese</span>
                <span class="w-overview__split-val is-positive tabular-nums">{{ formatValuta(entrateMese) }}</span>
              </div>
              <div class="w-overview__split-divider" />
              <div class="w-overview__split-item">
                <span class="w-overview__split-label">Uscite mese</span>
                <span class="w-overview__split-val is-negative tabular-nums">{{ formatValuta(usciteMese) }}</span>
              </div>
            </div>
          </DataState>
        </div>

        <!-- Saldi dei singoli conti: seconda scheda della panoramica -->
        <div class="w-overview__slide w-full shrink-0 snap-center">
          <p class="w-overview__eyebrow">I miei conti</p>
          <DataState
            :stato="statoConti"
            :last-updated="lastUpdatedConti"
            messaggio-errore="Non è stato possibile caricare i tuoi conti."
            skeleton-type="text"
            :skeleton-lines="4"
            @riprova="emit('riprova-conti')"
          >
            <template #vuoto>
              <div class="w-overview__cta-empty">
                <p class="w-overview__cta-title">I tuoi conti, a colpo d’occhio</p>
                <p class="w-overview__cta-desc">Aggiungi un conto per visualizzare qui il suo saldo.</p>
                <button type="button" class="w-overview__cta-btn" @click="router.push('/conti')">Aggiungi un conto</button>
              </div>
            </template>

            <p class="w-overview__subtitle">Quanto hai su ogni conto</p>
            <div class="w-overview__accounts-scroll" tabindex="0" role="region" aria-label="Saldi dei conti">
              <ul class="w-overview__accounts">
                <li v-for="conto in conti" :key="conto.id" class="w-overview__account">
                  <span class="w-overview__account-mark" :style="{ backgroundColor: conto.colore || 'var(--accent-green)' }" aria-hidden="true" />
                  <span class="w-overview__account-name">{{ conto.nome }}</span>
                  <span class="w-overview__account-balance tabular-nums" :class="{ 'is-negative': Number(conto.saldo) < 0 }">{{ formatValuta(conto.saldo) }}</span>
                </li>
              </ul>
            </div>
            <button type="button" class="w-overview__link-btn" @click="router.push('/conti')">Gestisci conti →</button>
          </DataState>
        </div>

        <!-- Budget -->
        <div v-if="slides.includes('budget')" class="w-overview__slide w-full shrink-0 snap-center">
          <DataState
            :stato="statoBudgetSezione"
            :last-updated="lastUpdatedBudget"
            messaggio-errore="Non è stato possibile caricare il budget."
            skeleton-type="text"
            :skeleton-lines="2"
            @riprova="emit('riprova-budget')"
          >
            <template #vuoto>
              <div class="w-overview__cta-empty">
                <PieChart class="w-overview__cta-icon" :size="32" :stroke-width="1.5" />
                <p class="w-overview__cta-title">Pianifica il tuo budget</p>
                <p class="w-overview__cta-desc">Suddividi le spese per categoria e tieni tutto sotto controllo.</p>
                <button type="button" class="w-overview__cta-btn" @click="router.push('/budget')">
                  Crea budget
                </button>
              </div>
            </template>

            <template v-if="hasBudget && budgetChartItems.length">
              <p class="w-overview__eyebrow">Budget del mese</p>
              <p class="w-overview__subtitle">Totale · {{ formatValuta(budgetTotale) }}</p>
              <div class="w-overview__doughnut-wrap">
                <Doughnut :data="budgetDoughnutData" :options="doughnutOptions" />
              </div>
              <ul class="w-overview__legend">
                <li v-for="(item, i) in budgetChartItems" :key="item.categoria">
                  <span class="w-overview__legend-dot" :style="{ background: CHART_COLORS[i % CHART_COLORS.length] }" />
                  <span class="w-overview__legend-name">
                    {{ getCategoriaUscita(item.categoria)?.nome || item.categoria }}
                  </span>
                  <span class="w-overview__legend-pct tabular-nums">
                    {{ Math.round(item.percentuale_usata || 0) }}%
                  </span>
                </li>
              </ul>
              <button type="button" class="w-overview__link-btn" @click="router.push('/budget')">
                Vedi budget →
              </button>
            </template>
            <div v-else class="w-overview__cta-empty">
              <PieChart class="w-overview__cta-icon" :size="32" :stroke-width="1.5" />
              <p class="w-overview__cta-title">Pianifica il tuo budget</p>
              <p class="w-overview__cta-desc">Suddividi le spese per categoria e tieni tutto sotto controllo.</p>
              <button type="button" class="w-overview__cta-btn" @click="router.push('/budget')">
                Crea budget
              </button>
            </div>
          </DataState>
        </div>

        <!-- Uscite oggi -->
        <div v-if="slides.includes('uscite-oggi')" class="w-overview__slide w-full shrink-0 snap-center">
          <DataState
            :stato="statoOggi"
            :last-updated="lastUpdatedOggi"
            messaggio-errore="Non è stato possibile caricare le uscite di oggi."
            skeleton-type="text"
            :skeleton-lines="3"
            @riprova="emit('riprova-oggi')"
          >
            <p class="w-overview__eyebrow">Uscite di oggi</p>
            <div class="w-overview__hero-stat w-overview__hero-stat--out">
              <ArrowUp class="w-overview__hero-icon" :size="28" :stroke-width="1.75" />
              <p class="w-overview__hero-val is-negative tabular-nums">-{{ formatValuta(usciteOggi) }}</p>
            </div>
            <p class="w-overview__hint-block">
              {{ usciteOggi > 0 ? 'Spese registrate oggi sulle tue uscite.' : 'Nessuna uscita registrata oggi.' }}
            </p>
            <button type="button" class="w-overview__link-btn" @click="router.push('/movimenti')">
              Vedi movimenti →
            </button>
          </DataState>
        </div>

        <!-- Entrate oggi -->
        <div v-if="slides.includes('entrate-oggi')" class="w-overview__slide w-full shrink-0 snap-center">
          <DataState
            :stato="statoOggi"
            :last-updated="lastUpdatedOggi"
            messaggio-errore="Non è stato possibile caricare le entrate di oggi."
            skeleton-type="text"
            :skeleton-lines="3"
            @riprova="emit('riprova-oggi')"
          >
            <p class="w-overview__eyebrow">Entrate di oggi</p>
            <div class="w-overview__hero-stat w-overview__hero-stat--in">
              <ArrowDown class="w-overview__hero-icon" :size="28" :stroke-width="1.75" />
              <p class="w-overview__hero-val is-positive tabular-nums">+{{ formatValuta(entrateOggi) }}</p>
            </div>
            <p class="w-overview__hint-block">
              {{ entrateOggi > 0 ? 'Entrate registrate oggi.' : 'Nessuna entrata registrata oggi.' }}
            </p>
            <button type="button" class="w-overview__link-btn" @click="router.push({ path: '/movimenti', query: { action: 'entrata' } })">
              Aggiungi entrata →
            </button>
          </DataState>
        </div>

        <!-- Obiettivi -->
        <div v-if="slides.includes('obiettivi')" class="w-overview__slide w-full shrink-0 snap-center">
          <DataState
            :stato="statoObiettivi"
            :last-updated="lastUpdatedObiettivi"
            messaggio-errore="Non è stato possibile caricare gli obiettivi."
            skeleton-type="text"
            :skeleton-lines="2"
            @riprova="emit('riprova-obiettivi')"
          >
            <template #vuoto>
              <div class="w-overview__cta-empty">
                <Target class="w-overview__cta-icon" :size="32" :stroke-width="1.5" />
                <p class="w-overview__cta-title">Fissa un obiettivo di risparmio</p>
                <p class="w-overview__cta-desc">
                  Traccia i progressi verso ciò che conta per te: vacanze, auto, fondo emergenza…
                </p>
                <button type="button" class="w-overview__cta-btn" @click="router.push('/obiettivi')">
                  Crea obiettivo
                </button>
              </div>
            </template>

            <template v-if="obiettiviAttivi.length">
              <p class="w-overview__eyebrow">
                <Target :size="14" :stroke-width="1.75" class="w-overview__eyebrow-icon" />
                Obiettivi
                <span v-if="obiettiviCompletatiCount" class="w-overview__eyebrow-badge">
                  {{ obiettiviCompletatiCount }} completati
                </span>
              </p>
              <div v-if="obiettivoPrincipale" class="w-overview__goal-main">
                <span class="w-overview__goal-emoji">{{ obiettivoPrincipale.icona || '🎯' }}</span>
                <p class="w-overview__goal-name">{{ obiettivoPrincipale.nome }}</p>
                <div class="w-overview__goal-bar">
                  <div
                    class="w-overview__goal-bar-fill"
                    :style="{ width: percentualeObiettivo(obiettivoPrincipale) + '%' }"
                  />
                </div>
                <div class="w-overview__goal-meta">
                  <span class="tabular-nums">
                    {{ formatValuta(obiettivoPrincipale.importo_attuale) }}
                    / {{ formatValuta(obiettivoPrincipale.importo_target) }}
                  </span>
                  <span class="w-overview__goal-pct tabular-nums">
                    {{ percentualeObiettivo(obiettivoPrincipale) }}%
                  </span>
                </div>
                <p v-if="obiettivoPrincipale.deadline" class="w-overview__goal-deadline">
                  <Calendar :size="13" :stroke-width="1.75" />
                  {{ formatData(obiettivoPrincipale.deadline) }}
                </p>
              </div>
              <ul v-if="obiettiviSecondari.length" class="w-overview__goal-list">
                <li v-for="obj in obiettiviSecondari" :key="obj.id">
                  <span class="w-overview__goal-list-emoji">{{ obj.icona || '🎯' }}</span>
                  <div class="w-overview__goal-list-body">
                    <span class="w-overview__goal-list-name">{{ obj.nome }}</span>
                    <div class="w-overview__goal-bar w-overview__goal-bar--sm">
                      <div
                        class="w-overview__goal-bar-fill"
                        :style="{ width: percentualeObiettivo(obj) + '%' }"
                      />
                    </div>
                  </div>
                  <span class="w-overview__goal-list-pct tabular-nums">{{ percentualeObiettivo(obj) }}%</span>
                </li>
              </ul>
              <button type="button" class="w-overview__link-btn" @click="router.push('/obiettivi')">
                Vedi tutti gli obiettivi →
              </button>
            </template>
            <div v-else class="w-overview__cta-empty">
              <Target class="w-overview__cta-icon" :size="32" :stroke-width="1.5" />
              <p class="w-overview__cta-title">Fissa un obiettivo di risparmio</p>
              <p class="w-overview__cta-desc">
                Traccia i progressi verso ciò che conta per te: vacanze, auto, fondo emergenza…
              </p>
              <button type="button" class="w-overview__cta-btn" @click="router.push('/obiettivi')">
                Crea obiettivo
              </button>
            </div>
          </DataState>
        </div>

        <!-- Scommesse -->
        <div v-if="slides.includes('scommesse')" class="w-overview__slide w-full shrink-0 snap-center">
          <DataState
            :stato="statoScommesse"
            :last-updated="lastUpdatedScommesse"
            messaggio-errore="Non è stato possibile caricare le scommesse."
            skeleton-type="text"
            :skeleton-lines="2"
            @riprova="emit('riprova-scommesse')"
          >
            <p class="w-overview__eyebrow">
              <Dices :size="14" :stroke-width="1.75" class="w-overview__eyebrow-icon" />
              Scommesse · questo mese
            </p>
            <div class="w-overview__feature-grid">
              <div class="w-overview__feature-card w-overview__feature-card--in">
                <Trophy :size="18" :stroke-width="1.75" />
                <span class="w-overview__feature-label">Vincite</span>
                <span class="w-overview__feature-val is-positive tabular-nums">+{{ formatValuta(scommesseVincite) }}</span>
              </div>
              <div class="w-overview__feature-card w-overview__feature-card--out">
                <TrendingDown :size="18" :stroke-width="1.75" />
                <span class="w-overview__feature-label">Perdite</span>
                <span class="w-overview__feature-val is-negative tabular-nums">-{{ formatValuta(scommessePerdite) }}</span>
              </div>
            </div>
            <div class="w-overview__net-box" :class="scommesseBilancio >= 0 ? 'is-positive' : 'is-negative'">
              <span class="w-overview__net-label">Bilancio netto</span>
              <span class="w-overview__net-val tabular-nums">{{ formatValuta(scommesseBilancio) }}</span>
            </div>
            <button type="button" class="w-overview__link-btn" @click="router.push('/scommesse')">
              Apri scommesse →
            </button>
          </DataState>
        </div>

        <!-- Investimenti -->
        <div v-if="slides.includes('investimenti')" class="w-overview__slide w-full shrink-0 snap-center">
          <DataState
            :stato="statoInvestimenti"
            :last-updated="lastUpdatedInvestimenti"
            messaggio-errore="Non è stato possibile caricare gli investimenti."
            skeleton-type="text"
            :skeleton-lines="2"
            @riprova="emit('riprova-investimenti')"
          >
            <p class="w-overview__eyebrow">
              <LineChart :size="14" :stroke-width="1.75" class="w-overview__eyebrow-icon" />
              Investimenti
            </p>
            <p class="w-overview__amount w-overview__amount--sm tabular-nums">{{ formatValuta(patrimonioInvestimenti) }}</p>
            <p
              class="w-overview__variation"
              :class="rendimentoInvestimenti >= 0 ? 'is-positive' : 'is-negative'"
            >
              {{ rendimentoInvestimenti >= 0 ? '+' : '' }}{{ formatValuta(rendimentoInvestimenti) }}
              ({{ rendimentoInvestimentiPct }}%)
            </p>
            <div
              v-if="investimentiAnalisi?.andamento_mensile?.length"
              class="w-overview__line-wrap"
            >
              <Line :data="investimentiLineData" :options="lineChartOptions" />
            </div>
            <p v-else class="w-overview__hint-block">Andamento patrimonio investito nel tempo.</p>
            <button type="button" class="w-overview__link-btn" @click="router.push('/investimenti')">
              Vedi portafoglio →
            </button>
          </DataState>
        </div>
      </div>
    </div>

    <div class="w-overview__dots" role="tablist" aria-label="Panoramica dashboard">
      <button
        v-for="(slide, i) in slides"
        :key="slide"
        type="button"
        class="w-overview__dot"
        :class="{ 'w-overview__dot--active': activeIndex === i }"
        :aria-label="slide"
        :aria-selected="activeIndex === i"
        @click="scrollToSlide(i)"
      />
    </div>
  </section>
</template>

<style scoped>
.w-overview { margin-bottom: 1.25rem; }

.w-overview__card {
  background: var(--glass-primary-bg);
  backdrop-filter: blur(var(--blur-md)) saturate(var(--glass-saturate));
  -webkit-backdrop-filter: blur(var(--blur-md)) saturate(var(--glass-saturate));
  border: 1px solid var(--glass-primary-border);
  border-radius: var(--radius-2xl);
  box-shadow: var(--shadow-md), var(--glass-highlight);
  overflow: hidden;
}

@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
  .w-overview__card { background: var(--glass-primary-solid); }
}

.w-overview__track {
  scroll-behavior: smooth;
  -webkit-overflow-scrolling: touch;
}

.w-overview__slide {
  padding: 1.375rem 1.25rem 1.25rem;
  min-height: 280px;
  display: flex;
  flex-direction: column;
}

/* DataState diventa l'unico figlio diretto della slide al posto del
   `<template>` di prima: deve restare un contenitore flex-column che
   riempie l'altezza disponibile, altrimenti `margin-top: auto` (split,
   link-btn) e `flex: 1` (cta-empty) smettono di ancorare i loro elementi
   in fondo alla scheda. */
.w-overview__slide > .data-state {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}

.w-overview__eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  /* deroga: occhiello che introduce lo slide ("Patrimonio totale",
     "I miei conti", "Budget del mese"…). Non porta informazione propria:
     il contenuto vero dello slide — importo, lista, grafico o griglia —
     sta subito sotto e resta al pavimento. */
  font-size: var(--text-micro);
  font-weight: 600;
  letter-spacing: 0.06em;
  color: var(--text-muted);
  margin-bottom: 0.375rem;
}

.w-overview__eyebrow-icon { stroke: currentColor; flex-shrink: 0; }

.w-overview__eyebrow-badge {
  margin-left: 0.375rem;
  padding: 0.125rem 0.4375rem;
  border-radius: 999px;
  font-size: var(--text-xs);
  font-weight: 600;
  letter-spacing: 0;
  text-transform: none;
  color: var(--positive);
  background: rgba(0, 168, 132, 0.1);
  border: 1px solid rgba(0, 168, 132, 0.15);
}

.w-overview__goal-main {
  text-align: center;
  padding: 0.75rem 0.5rem 0.875rem;
  border-radius: 1rem;
  background: var(--surface-subtle);
  border: 1px solid var(--border);
  margin-bottom: 0.625rem;
}

.w-overview__goal-emoji {
  font-size: 2rem;
  line-height: 1;
  display: block;
  margin-bottom: 0.375rem;
}

.w-overview__goal-name {
  font-size: 1rem;
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: 0.625rem;
}

.w-overview__goal-bar {
  height: 8px;
  background: var(--bg-input);
  border-radius: 999px;
  overflow: hidden;
  margin-bottom: 0.375rem;
}

.w-overview__goal-bar--sm { height: 5px; margin-bottom: 0; }

.w-overview__goal-bar-fill {
  height: 100%;
  background: var(--accent-green);
  border-radius: 999px;
  transition: width 0.5s ease;
}

.w-overview__goal-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: var(--text-xs);
  color: var(--text-secondary);
}

.w-overview__goal-pct {
  font-weight: 700;
  color: var(--accent-text);
}

.w-overview__goal-deadline {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  margin-top: 0.375rem;
  font-size: var(--text-xs);
  color: var(--text-muted);
}

.w-overview__goal-deadline svg { stroke: currentColor; flex-shrink: 0; }

.w-overview__goal-list {
  list-style: none;
  padding: 0;
  margin: 0 0 0.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.w-overview__goal-list li {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.625rem;
  border-radius: 0.75rem;
  background: var(--surface-subtle);
  border: 1px solid var(--border);
}

.w-overview__goal-list-emoji { font-size: 1.125rem; flex-shrink: 0; }

.w-overview__goal-list-body { flex: 1; min-width: 0; }

.w-overview__goal-list-name {
  display: block;
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-bottom: 0.25rem;
}

.w-overview__goal-list-pct {
  font-size: var(--text-xs);
  font-weight: 700;
  color: var(--accent-text);
  flex-shrink: 0;
}

.w-overview__amount {
  font-size: clamp(1.75rem, 7vw, 2.25rem);
  font-weight: 800;
  color: var(--text-primary);
  line-height: 1.1;
  letter-spacing: -0.02em;
}

.w-overview__amount--sm { font-size: clamp(1.375rem, 5vw, 1.75rem); }

.w-overview__variation {
  font-size: var(--text-xs);
  margin-top: 0.25rem;
  margin-bottom: 0.75rem;
}

.w-overview__variation.is-positive { color: var(--accent-text); }
.w-overview__variation.is-negative { color: var(--negative); }

.w-overview__subtitle {
  font-size: var(--text-xs);
  color: var(--text-secondary);
  margin-bottom: 0.75rem;
}

.w-overview__accounts-scroll {
  max-height: 230px;
  overflow-y: auto;
  overscroll-behavior-y: contain;
  margin-bottom: 0.75rem;
}

.w-overview__accounts-scroll:focus-visible {
  outline: 2px solid var(--accent-green);
  outline-offset: -2px;
  border-radius: 0.75rem;
}

.w-overview__accounts { list-style: none; margin: 0; padding: 0; }
.w-overview__account {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.875rem 0.25rem;
  border-bottom: 1px solid var(--border);
}
.w-overview__account:last-child { border-bottom: none; }
.w-overview__account-mark { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
.w-overview__account-name { flex: 1; min-width: 0; overflow-wrap: anywhere; color: var(--text-secondary); font-size: 0.875rem; }
.w-overview__account-balance { flex-shrink: 0; font-weight: 700; font-size: clamp(0.875rem, 3.5vw, 1.0625rem); color: var(--text-primary); }
.w-overview__account-balance.is-negative { color: var(--negative); }

.w-overview__sparkline {
  width: 100%;
  height: 36px;
  margin-bottom: 1rem;
}

.w-overview__split {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  gap: 0.75rem;
  align-items: center;
  padding: 0.875rem 1rem;
  border-radius: 1rem;
  background: var(--surface-subtle);
  border: 1px solid var(--border);
  margin-top: auto;
}

.w-overview__split-divider {
  width: 1px;
  height: 36px;
  background: var(--divider);
}

.w-overview__split-label {
  display: block;
  /* deroga: etichetta ("Entrate mese"/"Uscite mese") accanto al relativo
     .w-overview__split-val, già leggibile a 1rem in grassetto. */
  font-size: var(--text-micro);
  color: var(--text-muted);
  margin-bottom: 0.125rem;
}

.w-overview__split-val { font-size: 1rem; font-weight: 700; }
.w-overview__split-val.is-positive { color: var(--accent-text); }
.w-overview__split-val.is-negative { color: var(--negative); }

.w-overview__doughnut-wrap {
  width: 130px;
  height: 130px;
  margin: 0 auto 0.625rem;
}

.w-overview__legend {
  list-style: none;
  padding: 0;
  margin: 0 0 0.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}

.w-overview__legend li {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: var(--text-xs);
}

.w-overview__legend-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.w-overview__legend-name {
  flex: 1;
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.w-overview__legend-pct {
  font-weight: 600;
  color: var(--text-primary);
  font-size: var(--text-xs);
}

.w-overview__hero-stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  flex: 1;
  padding: 1.5rem 1rem;
  border-radius: 1rem;
  margin: 0.5rem 0;
}

.w-overview__hero-stat--in {
  background: rgba(0, 168, 132, 0.08);
  border: 1px solid rgba(0, 168, 132, 0.15);
}

.w-overview__hero-stat--out {
  background: rgba(220, 38, 38, 0.06);
  border: 1px solid rgba(220, 38, 38, 0.12);
}

.w-overview__hero-stat--in .w-overview__hero-icon { color: var(--positive); stroke: currentColor; }
.w-overview__hero-stat--out .w-overview__hero-icon { color: var(--negative); stroke: currentColor; }

.w-overview__hero-val {
  font-size: clamp(1.5rem, 6vw, 2rem);
  font-weight: 800;
  letter-spacing: -0.02em;
}

.w-overview__hint-block {
  font-size: var(--text-xs);
  color: var(--text-secondary);
  text-align: center;
  margin-bottom: 0.75rem;
}

.w-overview__feature-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.625rem;
  margin: 0.5rem 0 0.75rem;
}

.w-overview__feature-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.25rem;
  padding: 0.875rem 0.5rem;
  border-radius: 0.875rem;
  border: 1px solid var(--border);
  background: var(--surface-subtle);
}

.w-overview__feature-card svg { stroke: currentColor; }
.w-overview__feature-card--in svg { color: var(--positive); }
.w-overview__feature-card--out svg { color: var(--negative); }

.w-overview__feature-label {
  /* deroga: etichetta ("Vincite"/"Perdite") subito sopra il relativo
     .w-overview__feature-val, l'importo vero, già leggibile a 0.9375rem
     in grassetto. */
  font-size: var(--text-micro);
  /* Non piu' maiuscolo: senza il maiuscoletto forzato l'etichetta perdeva
     ogni gerarchia, quindi il peso prende il posto della forma delle
     lettere. Spaziatura ridotta di conseguenza. */
  font-weight: 600;
  letter-spacing: var(--tracking-wide);
  color: var(--text-muted);
}

.w-overview__feature-val { font-size: 0.9375rem; font-weight: 700; }

.w-overview__net-box {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.75rem 1rem;
  border-radius: 0.75rem;
  margin-bottom: 0.75rem;
  border: 1px solid var(--border);
  background: var(--surface-subtle);
}

.w-overview__net-box.is-positive { border-color: rgba(0, 168, 132, 0.2); }
.w-overview__net-box.is-negative { border-color: rgba(220, 38, 38, 0.2); }

/* deroga: etichetta ("Bilancio netto") accanto al relativo .w-overview__net-val,
   l'importo vero, già leggibile a 1.0625rem in grassetto. */
.w-overview__net-label { font-size: var(--text-micro); color: var(--text-secondary); }
.w-overview__net-val { font-size: 1.0625rem; font-weight: 700; }
.w-overview__net-box.is-positive .w-overview__net-val { color: var(--positive); }
.w-overview__net-box.is-negative .w-overview__net-val { color: var(--negative); }

.w-overview__line-wrap {
  height: 120px;
  margin: 0.5rem 0 0.75rem;
}

.w-overview__link-btn {
  margin-top: auto;
  align-self: center;
  background: none;
  border: none;
  color: var(--accent-text);
  font-size: var(--text-xs);
  font-weight: 600;
  cursor: pointer;
  padding: 0.25rem 0;
  font-family: inherit;
}

.w-overview__link-btn:hover { text-decoration: underline; }
.w-overview__link-btn:focus-visible { outline: none; box-shadow: var(--focus-ring-tight); }

.w-overview__cta-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  flex: 1;
  padding: 1rem 0.5rem;
}

.w-overview__cta-icon {
  color: var(--text-muted);
  stroke: currentColor;
  margin-bottom: 0.75rem;
}

.w-overview__cta-title {
  font-size: 1rem;
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: 0.375rem;
}

.w-overview__cta-desc {
  font-size: var(--text-xs);
  color: var(--text-secondary);
  margin-bottom: 1rem;
  max-width: 240px;
  line-height: 1.4;
}

.w-overview__cta-btn {
  padding: 0.625rem 1.25rem;
  border-radius: 999px;
  border: none;
  background: var(--accent-green);
  color: var(--accent-on);
  font-weight: 600;
  font-size: 0.875rem;
  cursor: pointer;
  font-family: inherit;
}

.w-overview__cta-btn:focus-visible { outline: none; box-shadow: var(--focus-ring); }

.w-overview__dots {
  display: flex;
  justify-content: center;
  gap: 0.375rem;
  margin-top: 0.75rem;
  flex-wrap: wrap;
  max-width: 100%;
  padding: 0 0.5rem;
}

.w-overview__dot {
  width: 6px;
  height: 6px;
  border-radius: 999px;
  border: none;
  padding: 0;
  background: var(--chart-track);
  cursor: pointer;
  transition: all 300ms ease-out;
}

.w-overview__dot--active {
  width: 20px;
  background: var(--accent-green);
}

/* outline invece di box-shadow: i pallini sono minuscoli (6px) e vicini
   tra loro (6px di gap), un box-shadow finirebbe addosso al vicino. */
.w-overview__dot:focus-visible {
  outline: 2px solid var(--border-focus);
  outline-offset: 3px;
}

.is-positive { color: var(--accent-text); }
.is-negative { color: var(--negative); }
.tabular-nums { font-variant-numeric: tabular-nums; }

@media (min-width: 768px) {
  .w-overview__slide {
    min-height: 300px;
    padding: 1.5rem 1.5rem 1.375rem;
  }
  .w-overview__doughnut-wrap { width: 150px; height: 150px; }
  .w-overview__line-wrap { height: 140px; }
}

/* La composizione spiega il totale invece di lasciarlo da interpretare:
   quanta parte è sui conti e quanta è investita. */
.w-overview__composizione {
  margin-top: 0.25rem;
  font-size: 0.875rem;
  line-height: var(--leading-snug);
  color: var(--text-secondary);
}
</style>
