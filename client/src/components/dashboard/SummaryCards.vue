<script setup>
import { computed } from 'vue';
import { useValuta } from '@/composables/useValuta';
import { formatVariazione } from '@/utils/formatters';

const props = defineProps({
  entrate: { type: Number, default: 0 },
  uscite: { type: Number, default: 0 },
  variazionePercentuale: { type: Number, default: 0 },
  loading: { type: Boolean, default: false },
});

const { formatValuta } = useValuta();

const variazioneEntrate = computed(() => Math.abs(props.variazionePercentuale));
const variazioneUscite = computed(() => Math.abs(props.variazionePercentuale * 0.7));
const entratePositive = computed(() => props.variazionePercentuale >= 0);
</script>

<template>
  <div class="summary-cards">
    <article class="summary-card summary-card--income">
      <div class="summary-card__icon summary-card__icon--income">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <path d="M12 5v14M5 12l7 7 7-7" />
        </svg>
      </div>
      <p class="summary-card__label">Totale entrate</p>
      <p v-if="!loading" class="summary-card__amount tabular-nums">{{ formatValuta(entrate) }}</p>
      <div v-else class="summary-card__skeleton" />
      <p v-if="!loading" class="summary-card__footer summary-card__footer--income">
        <span>{{ formatVariazione(entratePositive ? variazioneEntrate : -variazioneEntrate) }}</span>
        <span class="summary-card__footer-icon">^</span>
        <span>Questo mese</span>
      </p>
    </article>

    <article class="summary-card summary-card--expense">
      <div class="summary-card__icon summary-card__icon--expense">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <path d="M12 19V5M5 12l7-7 7 7" />
        </svg>
      </div>
      <p class="summary-card__label">Totale uscite</p>
      <p v-if="!loading" class="summary-card__amount tabular-nums">{{ formatValuta(uscite) }}</p>
      <div v-else class="summary-card__skeleton" />
      <p v-if="!loading" class="summary-card__footer summary-card__footer--expense">
        <span>-{{ variazioneUscite.toFixed(1).replace('.', ',') }}%</span>
        <span class="summary-card__footer-icon">v</span>
        <span>Questo mese</span>
      </p>
    </article>
  </div>
</template>

<style scoped>
.summary-cards {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.75rem;
  margin-bottom: 1rem;
}

.summary-card {
  padding: 1rem;
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.04);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid rgba(255, 255, 255, 0.08);
  position: relative;
  overflow: hidden;
}

.summary-card::before {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.04), transparent 60%);
  pointer-events: none;
}

.summary-card__icon {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 0.625rem;
}

.summary-card__icon--income {
  background: rgba(16, 185, 129, 0.15);
  color: #10B981;
}

.summary-card__icon--expense {
  background: rgba(239, 68, 68, 0.15);
  color: #EF4444;
}

.summary-card__label {
  font-size: 0.6875rem;
  color: #94A3B8;
  margin-bottom: 0.25rem;
}

.summary-card__amount {
  font-size: 1.125rem;
  font-weight: 700;
  color: #fff;
  line-height: 1.2;
  margin-bottom: 0.5rem;
}

.summary-card__footer {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.625rem;
  font-weight: 500;
}

.summary-card__footer--income { color: #10B981; }
.summary-card__footer--expense { color: #EF4444; }

.summary-card__footer-icon {
  font-size: 0.75rem;
  font-weight: 700;
}

.summary-card__skeleton {
  height: 1.5rem;
  width: 70%;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.06);
  margin-bottom: 0.5rem;
  animation: pulse 2s ease-in-out infinite;
}

.tabular-nums {
  font-variant-numeric: tabular-nums;
}
</style>
