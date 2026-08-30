<script setup>
import { computed } from 'vue';
import { useValuta } from '@/composables/useValuta';
import { Calendar, PieChart, ArrowDown, ArrowUp } from '@/utils/appIcons';

const props = defineProps({
  title: { type: String, required: true },
  value: { type: [String, Number], default: '' },
  type: {
    type: String,
    default: 'saldo',
    validator: (v) => ['saldo', 'distribuzione', 'uscite-oggi', 'entrate-oggi', 'fisse', 'variabili'].includes(v),
  },
  percent: { type: Number, default: 0 },
  progressPercent: { type: Number, default: 0 },
  trendPositive: { type: Boolean, default: true },
});

const { formatValuta } = useValuta();

const themeClass = computed(() => `category-card--${props.type}`);

const displayValue = computed(() => {
  if (typeof props.value === 'number') {
    if (props.type === 'uscite-oggi') return `-${formatValuta(props.value)}`;
    if (props.type === 'entrate-oggi') return `+${formatValuta(props.value)}`;
    return formatValuta(props.value);
  }
  return props.value;
});

const ringStyle = computed(() => ({
  background: `conic-gradient(var(--positive) ${Math.min(props.percent, 100) * 3.6}deg, var(--chart-track) 0deg)`,
}));

const barHeights = [40, 65, 45, 80, 55];
</script>

<template>
  <article class="category-card" :class="themeClass">
    <ArrowDown v-if="type === 'uscite-oggi'" class="category-card__icon-top category-card__icon-top--down" :size="16" :stroke-width="2" />
    <ArrowUp v-if="type === 'entrate-oggi'" class="category-card__icon-top category-card__icon-top--up" :size="16" :stroke-width="2" />
    <Calendar v-if="type === 'fisse'" class="category-card__icon-top" :size="16" :stroke-width="1.75" />
    <PieChart v-if="type === 'variabili'" class="category-card__icon-top" :size="16" :stroke-width="1.75" />

    <p class="category-card__title">{{ title }}</p>
    <p
      class="category-card__value tabular-nums"
      :class="{
        'category-card__value--expense': type === 'uscite-oggi',
        'category-card__value--income': type === 'entrate-oggi',
      }"
    >
      {{ displayValue }}
    </p>

    <div class="category-card__viz">
      <template v-if="type === 'saldo'">
        <svg class="category-card__line" viewBox="0 0 100 32" fill="none">
          <path
            :d="trendPositive ? 'M2 26 L20 22 L38 24 L56 14 L74 16 L98 6' : 'M2 8 L20 12 L38 10 L56 20 L74 18 L98 24'"
            stroke="#3B82F6"
            stroke-width="2.5"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </template>

      <template v-else-if="type === 'distribuzione'">
        <div class="category-card__ring" :style="ringStyle">
          <div class="category-card__ring-inner">
            <span class="category-card__pct tabular-nums">{{ percent }}%</span>
          </div>
        </div>
      </template>

      <template v-else-if="type === 'uscite-oggi' || type === 'entrate-oggi'">
        <div class="category-card__bars">
          <div
            v-for="(h, i) in barHeights"
            :key="i"
            class="category-card__bar"
            :style="{ height: `${h}%`, background: type === 'uscite-oggi' ? '#FBBF24' : '#2DD4BF' }"
          />
        </div>
      </template>

      <template v-else-if="type === 'fisse' || type === 'variabili'">
        <div class="category-card__progress-list">
          <div class="category-card__progress-row">
            <div class="category-card__progress-track">
              <div
                class="category-card__progress-fill"
                :style="{ width: `${Math.min(progressPercent, 100)}%`, background: type === 'fisse' ? '#A78BFA' : '#F87171' }"
              />
            </div>
          </div>
          <div class="category-card__progress-row">
            <div class="category-card__progress-track">
              <div
                class="category-card__progress-fill category-card__progress-fill--dim"
                :style="{ width: `${Math.min(progressPercent * 0.6, 100)}%`, background: type === 'fisse' ? '#A78BFA' : '#F87171' }"
              />
            </div>
          </div>
          <span class="category-card__progress-label">Di questo mese</span>
        </div>
      </template>
    </div>
  </article>
</template>

<style scoped>
.category-card {
  flex: 0 0 148px;
  width: 148px;
  min-height: 168px;
  padding: 0.875rem 0.75rem;
  border-radius: 20px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  box-shadow: var(--shadow-sm);
  scroll-snap-align: center;
  display: flex;
  flex-direction: column;
  position: relative;
  transition: transform 300ms ease-out;
}

.category-card:active {
  transform: scale(0.97);
}

.category-card--saldo {
  border: 1px solid rgba(59, 130, 246, 0.35);
  box-shadow: 0 0 20px rgba(59, 130, 246, 0.12);
}

.category-card--distribuzione {
  border: 1px solid rgba(16, 185, 129, 0.35);
  box-shadow: 0 0 20px rgba(16, 185, 129, 0.12);
}

.category-card--uscite-oggi {
  border: 1px solid rgba(251, 191, 36, 0.35);
  box-shadow: 0 0 20px rgba(251, 191, 36, 0.1);
}

.category-card--entrate-oggi {
  border: 1px solid rgba(45, 212, 191, 0.35);
  box-shadow: 0 0 20px rgba(45, 212, 191, 0.1);
}

.category-card--fisse {
  border: 1px solid rgba(167, 139, 250, 0.35);
  box-shadow: 0 0 20px rgba(167, 139, 250, 0.1);
}

.category-card--variabili {
  border: 1px solid rgba(248, 113, 113, 0.35);
  box-shadow: 0 0 20px rgba(248, 113, 113, 0.1);
}

.category-card__icon-top {
  position: absolute;
  top: 0.625rem;
  right: 0.625rem;
  opacity: 0.8;
  stroke: currentColor;
  color: var(--text-muted);
}
.category-card__icon-top--down { color: #FBBF24; }
.category-card__icon-top--up { color: #2DD4BF; }

.category-card__title {
  font-size: 0.6875rem;
  font-weight: 500;
  color: var(--text-subtle);
  line-height: 1.3;
  margin-bottom: 0.375rem;
  padding-right: 1rem;
}

.category-card__value {
  font-size: 0.9375rem;
  font-weight: 700;
  color: var(--text-primary);
  line-height: 1.2;
  margin-bottom: 0.5rem;
}

.category-card__value--expense { color: var(--text-primary); }
.category-card__value--income { color: var(--text-primary); }

.category-card__viz {
  flex: 1;
  display: flex;
  align-items: flex-end;
  min-height: 48px;
}

.category-card__line {
  width: 100%;
  height: 32px;
}

.category-card__ring {
  width: 52px;
  height: 52px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto;
}

.category-card__ring-inner {
  width: 38px;
  height: 38px;
  border-radius: 50%;
  background: var(--ring-center);
  display: flex;
  align-items: center;
  justify-content: center;
}

.category-card__pct {
  font-size: 0.6875rem;
  font-weight: 700;
  color: var(--positive);
}

.category-card__bars {
  display: flex;
  align-items: flex-end;
  gap: 4px;
  width: 100%;
  height: 40px;
}

.category-card__bar {
  flex: 1;
  border-radius: 3px 3px 0 0;
  min-height: 4px;
  opacity: 0.85;
}

.category-card__progress-list {
  width: 100%;
}

.category-card__progress-row {
  margin-bottom: 4px;
}

.category-card__progress-track {
  height: 4px;
  border-radius: 2px;
  background: var(--chart-track);
  overflow: hidden;
}

.category-card__progress-fill {
  height: 100%;
  border-radius: 2px;
  transition: width 400ms ease-out;
}

.category-card__progress-fill--dim {
  opacity: 0.5;
}

.category-card__progress-label {
  font-size: 0.5625rem;
  color: var(--text-muted);
  margin-top: 2px;
  display: block;
}

.tabular-nums {
  font-variant-numeric: tabular-nums;
}

@media (min-width: 768px) {
  .category-card {
    flex: 0 0 160px;
    width: 160px;
    min-height: 176px;
  }
}
</style>
