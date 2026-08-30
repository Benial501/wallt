<script setup>
import { computed } from 'vue';
import dayjs from 'dayjs';
import { useValuta } from '@/composables/useValuta';
import { ChevronRight } from '@/utils/appIcons';

const props = defineProps({
  movimento: { type: Object, required: true },
});

defineEmits(['click']);

const { formatValuta } = useValuta();

const dataLabel = computed(() => {
  const raw = props.movimento.dataLabel || props.movimento.data;
  if (!raw) return '';
  const d = dayjs(raw);
  if (!d.isValid()) return String(raw);
  const oggi = dayjs();
  if (d.isSame(oggi, 'day')) return 'Oggi';
  if (d.isSame(oggi.subtract(1, 'day'), 'day')) return 'Ieri';
  return d.format('DD/MM/YYYY');
});

const titolo = computed(() => {
  const desc = String(props.movimento.descrizione || '').trim();
  return desc || 'Transazione';
});

const sottotitolo = computed(() => props.movimento.conto?.nome || '');
</script>

<template>
  <button type="button" class="analisi-mov-row" @click="$emit('click', movimento)">
    <div class="analisi-mov-row__body">
      <div class="analisi-mov-row__top">
        <span class="analisi-mov-row__date">{{ dataLabel }}</span>
        <span class="analisi-mov-row__amount tabular-nums">-{{ formatValuta(movimento.importo) }}</span>
      </div>
      <p class="analisi-mov-row__title">{{ titolo }}</p>
      <p v-if="sottotitolo" class="analisi-mov-row__meta">{{ sottotitolo }}</p>
    </div>
    <span class="analisi-mov-row__edit" aria-hidden="true">
      <ChevronRight :size="16" :stroke-width="1.75" />
    </span>
  </button>
</template>

<style scoped>
.analisi-mov-row {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  width: 100%;
  padding: 0.75rem 0.875rem;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--bg-card);
  cursor: pointer;
  text-align: left;
  font-family: inherit;
  transition: background 0.15s ease, border-color 0.15s ease;
}

.analisi-mov-row:hover {
  background: var(--bg-card-hover, var(--bg-card));
  border-color: color-mix(in srgb, var(--accent-green) 35%, var(--border));
}

.analisi-mov-row__body {
  flex: 1;
  min-width: 0;
}

.analisi-mov-row__top {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.75rem;
  margin-bottom: 0.2rem;
}

.analisi-mov-row__date {
  font-size: 0.6875rem;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.02em;
  flex-shrink: 0;
}

.analisi-mov-row__amount {
  font-size: 0.875rem;
  font-weight: 700;
  color: var(--negative);
  flex-shrink: 0;
}

.analisi-mov-row__title {
  margin: 0;
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--text-primary);
  line-height: 1.35;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.analisi-mov-row__meta {
  margin: 0.2rem 0 0;
  font-size: 0.6875rem;
  color: var(--text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.analisi-mov-row__edit {
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
  background: var(--surface-inset, rgba(255, 255, 255, 0.04));
}

.tabular-nums {
  font-variant-numeric: tabular-nums;
}
</style>
