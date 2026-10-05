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
  <WCard class="scheduled-card" padding="md">
    <div class="scheduled-card__main">
      <div class="scheduled-card__icon" :class="{ 'scheduled-card__icon--income': isIncome }">
        <component :is="isIncome ? ArrowDownCircle : ArrowUpCircle" :size="20" aria-hidden="true" />
      </div>
      <div class="scheduled-card__details">
        <h2>{{ payment.descrizione || (isIncome ? 'Entrata programmata' : 'Spesa programmata') }}</h2>
        <p class="scheduled-card__amount" :class="{ 'scheduled-card__amount--income': isIncome }">{{ formatValuta(payment.importo, valuta) }}</p>
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
.scheduled-card { display: flex; align-items: center; justify-content: space-between; gap: 1rem; }
.scheduled-card__main { display: flex; align-items: flex-start; gap: 0.75rem; min-width: 0; }
.scheduled-card__icon { display: grid; place-items: center; width: 2.5rem; height: 2.5rem; border-radius: 0.75rem; color: var(--negative); background: color-mix(in srgb, var(--negative) 10%, transparent); flex: 0 0 auto; }
.scheduled-card__icon--income { color: var(--positive); background: color-mix(in srgb, var(--positive) 10%, transparent); }
.scheduled-card__details { min-width: 0; }
.scheduled-card h2 { margin: 0; color: var(--text-primary); font-size: 0.95rem; }
.scheduled-card__amount { margin: 0.25rem 0 0; color: var(--negative); font-weight: 700; font-variant-numeric: tabular-nums; }
.scheduled-card__amount--income { color: var(--positive); }
.scheduled-card__meta { display: flex; flex-wrap: wrap; gap: 0.4rem 0.85rem; margin-top: 0.5rem; color: var(--text-muted); font-size: var(--text-xs); }
.scheduled-card__meta span { display: inline-flex; align-items: center; gap: 0.25rem; }
.scheduled-card__plan { margin: 0.45rem 0 0; color: var(--text-secondary); font-size: var(--text-xs); }
.scheduled-card__actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 0.5rem; flex: 0 0 auto; }
@media (max-width: 680px) { .scheduled-card { align-items: stretch; flex-direction: column; } .scheduled-card__actions { justify-content: stretch; } .scheduled-card__actions > :deep(button) { flex: 1; } }
</style>
