<script setup>
import { computed } from 'vue';
import WCard from '@/components/common/WCard.vue';
import WButton from '@/components/common/WButton.vue';
import { formatData, formatValuta } from '@/utils/formatters';
import dayjs from 'dayjs';
import { Calendar, Wallet, ArrowDownCircle, ArrowUpCircle } from '@/utils/appIcons';

const props = defineProps({ payment: { type: Object, required: true }, valuta: { type: String, default: 'EUR' }, loading: { type: Boolean, default: false }, busy: { type: Boolean, default: false } });
defineEmits(['confirm', 'late', 'cancel', 'edit']);
const isIncome = computed(() => props.payment.tipo === 'entrata');
const isOverdue = computed(() => props.payment.data_scadenza < dayjs().format('YYYY-MM-DD'));
const isMarkedLate = computed(() => props.payment.stato === 'in_ritardo');
</script>

<template>
  <WCard class="scheduled-card" padding="1rem 1rem 0.5rem">
    <div class="scheduled-card__main">
      <div class="scheduled-card__icon" :class="{ 'scheduled-card__icon--income': isIncome }">
        <component :is="isIncome ? ArrowDownCircle : ArrowUpCircle" :size="20" aria-hidden="true" />
      </div>
      <div class="scheduled-card__details">
        <div class="scheduled-card__heading">
          <h2>{{ payment.descrizione || (isIncome ? 'Entrata programmata' : 'Spesa programmata') }}</h2>
          <p class="scheduled-card__amount" :class="{ 'scheduled-card__amount--income': isIncome }">{{ formatValuta(payment.importo, valuta) }}</p>
        </div>
        <div class="scheduled-card__meta">
          <span><Calendar :size="14" aria-hidden="true" /> {{ isMarkedLate || isOverdue ? 'In ritardo dal' : (isIncome ? 'Prevista per' : 'Scade il') }} {{ formatData(payment.data_scadenza, 'medio') }}</span>
          <span><Wallet :size="14" aria-hidden="true" /> {{ payment.conto?.nome || 'Conto' }}</span>
          <span v-if="payment.piano">{{ payment.piano.numero_pagamenti }} pagamenti · {{ Number(payment.piano.tasso_annuo).toLocaleString('it-IT') }}% annuo</span>
        </div>
        <p v-if="payment.piano" class="scheduled-card__plan">Totale previsto {{ formatValuta(payment.piano.totale_da_restituire, valuta) }} · interessi {{ formatValuta(payment.piano.interessi_stimati, valuta) }}</p>
      </div>
    </div>
    <div class="scheduled-card__actions">
      <WButton variant="primary" size="sm" :loading="loading" :disabled="busy && !loading" @click="$emit('confirm', payment)">{{ isIncome ? 'Segna come ricevuta' : 'Segna come pagata' }}</WButton>
      <WButton v-if="isIncome && !isMarkedLate" variant="secondary" size="sm" :disabled="busy" @click="$emit('late', payment)">Non è arrivata</WButton>
      <WButton variant="secondary" size="sm" :disabled="busy" @click="$emit('edit', payment)">Modifica</WButton>
      <WButton variant="secondary" size="sm" :disabled="busy" @click="$emit('cancel', payment)">{{ payment.piano ? 'Annulla piano' : 'Annulla' }}</WButton>
    </div>
  </WCard>
</template>

<style scoped>
.scheduled-card { display: flex; flex-direction: column; gap: 0.875rem; }
.scheduled-card__main { display: flex; align-items: flex-start; gap: 0.75rem; min-width: 0; }
.scheduled-card__icon { display: grid; place-items: center; width: 44px; height: 44px; border-radius: var(--radius-md); color: var(--negative); background: color-mix(in srgb, var(--negative) 10%, transparent); flex: 0 0 auto; }
.scheduled-card__icon--income { color: var(--positive); background: color-mix(in srgb, var(--positive) 10%, transparent); }
.scheduled-card__details { flex: 1; min-width: 0; }
.scheduled-card__heading { display: flex; align-items: baseline; justify-content: space-between; flex-wrap: wrap; gap: 0.375rem 1rem; }
.scheduled-card h2 { flex: 1; min-width: 0; margin: 0; color: var(--text-primary); font-size: 1rem; font-weight: 650; line-height: 1.4; overflow-wrap: anywhere; }
.scheduled-card__amount { margin: 0; color: var(--negative); font-size: 1.0625rem; font-weight: 700; font-variant-numeric: tabular-nums; }
.scheduled-card__amount--income { color: var(--positive); }
.scheduled-card__meta { display: flex; flex-wrap: wrap; gap: 0.4rem 0.85rem; margin-top: 0.5rem; color: var(--text-muted); font-size: var(--text-xs); line-height: 1.5; }
.scheduled-card__meta span { display: inline-flex; align-items: center; gap: 0.3rem; min-width: 0; overflow-wrap: anywhere; }
.scheduled-card__meta svg { flex-shrink: 0; }
.scheduled-card__plan { margin: 0.45rem 0 0; color: var(--text-secondary); font-size: var(--text-xs); line-height: 1.5; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.scheduled-card__actions { display: flex; align-items: center; flex-wrap: wrap; gap: 0.25rem; padding-top: 0.375rem; border-top: 1px solid var(--divider); }
.scheduled-card__actions :deep(.w-btn) { min-height: 44px; padding: 0.5rem 0.75rem; }
.scheduled-card__actions :deep(.w-btn--primary) { margin-right: auto; }
.scheduled-card__actions :deep(.w-btn--secondary) { background: transparent; border-color: transparent; box-shadow: none; color: var(--text-secondary); }
.scheduled-card__actions :deep(.w-btn:focus-visible) { box-shadow: var(--focus-ring-tight); }
@media (hover: hover) {
  .scheduled-card__actions :deep(.w-btn--secondary:hover:not(:disabled)) { background: var(--glass-interactive-bg-hover); }
}
@media (max-width: 480px) {
  .scheduled-card__heading { flex-direction: column; align-items: flex-start; gap: 0.25rem; }
  .scheduled-card__actions :deep(.w-btn) { flex: 1; }
  .scheduled-card__actions :deep(.w-btn--primary) { flex-basis: 100%; margin: 0 0 0.25rem; }
}
</style>
