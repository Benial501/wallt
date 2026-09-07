<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { useRouter } from 'vue-router';
import { Doughnut, Line } from 'vue-chartjs';
import {
  Chart as ChartJS, ArcElement, Tooltip, CategoryScale, LinearScale,
  PointElement, LineElement, Filler,
} from 'chart.js';
import WSkeleton from '@/components/common/WSkeleton.vue';
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
  loadingConti: { type: Boolean, default: false },
  patrimonio: { type: Number, default: 0 },
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
  loadingSaldo: { type: Boolean, default: false },
  loadingBudget: { type: Boolean, default: false },
  loadingOggi: { type: Boolean, default: false },
  loadingScommesse: { type: Boolean, default: false },
  loadingInvestimenti: { type: Boolean, default: false },
  obiettiviAttivi: { type: Array, default: () => [] },
  obiettiviCompletatiCount: { type: Number, default: 0 },
  loadingObiettivi: { type: Boolean, default: false },
});

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
        <!-- Saldo del conto -->
        <div v-if="slides.includes('saldo')" class="w-overview__slide w-full shrink-0 snap-center">
          <template v-if="loadingSaldo">
            <WSkeleton type="text" :lines="3" />
            <WSkeleton type="card" class="mt-3" />
          </template>
          <template v-else>
            <p class="w-overview__eyebrow">Saldo del conto</p>
            <p class="w-overview__amount tabular-nums">{{ formatValuta(animatedPatrimonio) }}</p>
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
          </template>
        </div>

        <!-- Saldi dei singoli conti: seconda scheda della panoramica -->
        <div class="w-overview__slide w-full shrink-0 snap-center">
          <p class="w-overview__eyebrow">I miei conti</p>
          <template v-if="loadingConti">
            <WSkeleton type="text" :lines="4" />
          </template>
          <template v-else-if="conti.length">
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
          </template>
          <div v-else class="w-overview__cta-empty">
            <p class="w-overview__cta-title">I tuoi conti, a colpo d’occhio</p>
            <p class="w-overview__cta-desc">Aggiungi un conto per visualizzare qui il suo saldo.</p>
            <button type="button" class="w-overview__cta-btn" @click="router.push('/conti')">Aggiungi un conto</button>
          </div>
        </div>

        <!-- Budget -->
        <div v-if="slides.includes('budget')" class="w-overview__slide w-full shrink-0 snap-center">
          <template v-if="loadingBudget">
            <WSkeleton type="text" :lines="2" />
            <div class="w-overview__chart-skeleton"><WSkeleton type="circle" /></div>
          </template>
          <template v-else-if="hasBudget && budgetChartItems.length">
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
        </div>

        <!-- Uscite oggi -->
        <div v-if="slides.includes('uscite-oggi')" class="w-overview__slide w-full shrink-0 snap-center">
          <template v-if="loadingOggi">
            <WSkeleton type="text" :lines="2" />
            <WSkeleton type="card" class="mt-3" />
          </template>
          <template v-else>
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
          </template>
        </div>

        <!-- Entrate oggi -->
        <div v-if="slides.includes('entrate-oggi')" class="w-overview__slide w-full shrink-0 snap-center">
          <template v-if="loadingOggi">
            <WSkeleton type="text" :lines="2" />
            <WSkeleton type="card" class="mt-3" />
          </template>
          <template v-else>
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
          </template>
        </div>

        <!-- Obiettivi -->
        <div v-if="slides.includes('obiettivi')" class="w-overview__slide w-full shrink-0 snap-center">
          <template v-if="loadingObiettivi">
            <WSkeleton type="text" :lines="2" />
            <WSkeleton type="card" class="mt-3" />
          </template>
          <template v-else-if="obiettiviAttivi.length">
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
        </div>

        <!-- Scommesse -->
        <div v-if="slides.includes('scommesse')" class="w-overview__slide w-full shrink-0 snap-center">
          <template v-if="loadingScommesse">
            <WSkeleton type="text" :lines="2" />
            <WSkeleton type="card" class="mt-3" />
          </template>
          <template v-else>
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
          </template>
        </div>

        <!-- Investimenti -->
        <div v-if="slides.includes('investimenti')" class="w-overview__slide w-full shrink-0 snap-center">
          <template v-if="loadingInvestimenti">
            <WSkeleton type="text" :lines="2" />
            <WSkeleton type="card" class="mt-3" />
          </template>
          <template v-else>
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
          </template>
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
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 1.5rem;
  box-shadow: var(--shadow-card);
  overflow: hidden;
}

.w-overview__track {
  scrollbar-width: none;
  -ms-overflow-style: none;
  scroll-behavior: smooth;
  -webkit-overflow-scrolling: touch;
}

.w-overview__track::-webkit-scrollbar { display: none; }

.w-overview__slide {
  padding: 1.375rem 1.25rem 1.25rem;
  min-height: 280px;
  display: flex;
  flex-direction: column;
}

.w-overview__eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-muted);
  margin-bottom: 0.375rem;
}

.w-overview__eyebrow-icon { stroke: currentColor; flex-shrink: 0; }

.w-overview__eyebrow-badge {
  margin-left: 0.375rem;
  padding: 0.125rem 0.4375rem;
  border-radius: 999px;
  font-size: 0.625rem;
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
  font-size: 0.8125rem;
  color: var(--text-secondary);
}

.w-overview__goal-pct {
  font-weight: 700;
  color: var(--accent-green);
}

.w-overview__goal-deadline {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  margin-top: 0.375rem;
  font-size: 0.75rem;
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
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-bottom: 0.25rem;
}

.w-overview__goal-list-pct {
  font-size: 0.6875rem;
  font-weight: 700;
  color: var(--accent-green);
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
  font-size: 0.8125rem;
  margin-top: 0.25rem;
  margin-bottom: 0.75rem;
}

.w-overview__variation.is-positive { color: var(--accent-green); }
.w-overview__variation.is-negative { color: var(--negative); }

.w-overview__subtitle {
  font-size: 0.8125rem;
  color: var(--text-secondary);
  margin-bottom: 0.75rem;
}

.w-overview__accounts-scroll {
  max-height: 230px;
  overflow-y: auto;
  overscroll-behavior-y: contain;
  scrollbar-width: thin;
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
  font-size: 0.6875rem;
  color: var(--text-muted);
  margin-bottom: 0.125rem;
}

.w-overview__split-val { font-size: 1rem; font-weight: 700; }
.w-overview__split-val.is-positive { color: var(--accent-green); }
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
  font-size: 0.75rem;
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
  font-size: 0.6875rem;
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
  font-size: 0.8125rem;
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
  font-size: 0.625rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
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

.w-overview__net-label { font-size: 0.8125rem; color: var(--text-secondary); }
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
  color: var(--accent-green);
  font-size: 0.8125rem;
  font-weight: 600;
  cursor: pointer;
  padding: 0.25rem 0;
  font-family: inherit;
}

.w-overview__link-btn:hover { text-decoration: underline; }

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
  font-size: 0.8125rem;
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

.w-overview__chart-skeleton {
  display: flex;
  justify-content: center;
  margin-top: 1rem;
}

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

.is-positive { color: var(--accent-green); }
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
</style>
