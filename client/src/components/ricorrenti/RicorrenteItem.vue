<script setup>
import { computed } from 'vue';
import WCard from '@/components/common/WCard.vue';
import WButton from '@/components/common/WButton.vue';
import { formatData } from '@/utils/formatters';
import { presentaRicorrente } from '@/utils/ricorrenti';
import {
  ArrowDownCircle,
  ArrowUpCircle,
  Calendar,
  Pencil,
  Trash2,
  Wallet,
} from '@/utils/appIcons';

const props = defineProps({
  movimento: { type: Object, required: true },
  valuta: { type: String, default: 'EUR' },
});

defineEmits(['modifica', 'elimina', 'cambia-stato']);

const presentazione = computed(() => presentaRicorrente(props.movimento));
const isEntrata = computed(() => props.movimento.tipo === 'entrata');

const GIORNI_SETTIMANA_BREVI = { 1: 'Lun', 2: 'Mar', 3: 'Mer', 4: 'Gio', 5: 'Ven', 6: 'Sab', 7: 'Dom' };
const MESI_BREVI = {
  1: 'Gen', 2: 'Feb', 3: 'Mar', 4: 'Apr', 5: 'Mag', 6: 'Giu',
  7: 'Lug', 8: 'Ago', 9: 'Set', 10: 'Ott', 11: 'Nov', 12: 'Dic',
};

/** Badge calendario: adatta cifra/etichetta alla frequenza (settimanale mostra il giorno, annuale giorno+mese, spesa programmata la data fissa). */
const badgeCalendario = computed(() => {
  const freq = props.movimento.ricorrente_frequenza;
  if (freq === 'una_tantum') {
    const iso = props.movimento.ricorrente_data;
    if (!iso) return { cifra: '—', etichetta: 'programmata' };
    const [, mese, giorno] = iso.split('-').map(Number);
    return { cifra: `${giorno} ${MESI_BREVI[mese] || ''}`, etichetta: 'programmata' };
  }
  if (freq === 'settimanale') {
    return { cifra: GIORNI_SETTIMANA_BREVI[props.movimento.ricorrente_giorno] || '—', etichetta: 'ogni settimana' };
  }
  if (freq === 'annuale') {
    const giorno = props.movimento.ricorrente_giorno || 1;
    const mese = MESI_BREVI[props.movimento.ricorrente_mese] || '';
    return { cifra: `${giorno} ${mese}`, etichetta: 'ogni anno' };
  }
  return { cifra: props.movimento.ricorrente_giorno || 1, etichetta: 'ogni mese' };
});
const importoFormattato = computed(() => new Intl.NumberFormat('it-IT', {
  style: 'currency',
  currency: props.valuta,
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
}).format(Number(props.movimento.importo) || 0));
</script>

<template>
  <WCard class="ricorrente-card" padding="0">
    <div class="ricorrente-card__calendario" aria-hidden="true">
      <span :class="{ 'ricorrente-card__calendario--compatto': movimento.ricorrente_frequenza === 'annuale' || movimento.ricorrente_frequenza === 'una_tantum' }">{{ badgeCalendario.cifra }}</span>
      <small>{{ badgeCalendario.etichetta }}</small>
    </div>

    <div class="ricorrente-card__corpo">
      <div class="ricorrente-card__testa">
        <div>
          <h2>{{ presentazione.descrizione }}</h2>
          <p class="ricorrente-card__tipo" :class="{ 'ricorrente-card__tipo--entrata': isEntrata }">
            <component :is="isEntrata ? ArrowDownCircle : ArrowUpCircle" :size="16" :stroke-width="1.8" aria-hidden="true" />
            {{ presentazione.tipoLabel }}
          </p>
        </div>
        <div class="ricorrente-card__importo" :class="{ 'ricorrente-card__importo--entrata': isEntrata }">
          {{ importoFormattato }}
        </div>
      </div>

      <dl class="ricorrente-card__dati">
        <div>
          <dt><Calendar :size="15" aria-hidden="true" /> Frequenza</dt>
          <dd>
            {{ movimento.ricorrente_frequenza === 'una_tantum' && presentazione.prossimaEsecuzione
              ? formatData(presentazione.prossimaEsecuzione, 'medio')
              : presentazione.frequenzaLabel }}
          </dd>
        </div>
        <div v-if="presentazione.prossimaEsecuzione && movimento.ricorrente_frequenza !== 'una_tantum'">
          <dt><Calendar :size="15" aria-hidden="true" /> Prossima esecuzione</dt>
          <dd>{{ formatData(presentazione.prossimaEsecuzione, 'medio') }}</dd>
        </div>
        <div>
          <dt><Wallet :size="15" aria-hidden="true" /> Conto</dt>
          <dd>{{ presentazione.contoLabel }}</dd>
        </div>
        <div>
          <dt>Stato</dt>
          <dd><span class="ricorrente-card__stato" :class="{ 'ricorrente-card__stato--inattiva': movimento.stato_ricorrenza !== 'attiva' && movimento.stato_ricorrenza }">{{ presentazione.statoLabel }}</span></dd>
        </div>
      </dl>

      <div class="ricorrente-card__azioni">
        <WButton v-if="movimento.stato_ricorrenza === 'sospesa'" variant="secondary" size="md" @click="$emit('cambia-stato', movimento, 'attiva')">Riprendi</WButton>
        <WButton v-if="!movimento.stato_ricorrenza || movimento.stato_ricorrenza === 'attiva'" variant="secondary" size="md" @click="$emit('cambia-stato', movimento, 'sospesa')">Sospendi</WButton>
        <WButton v-if="movimento.stato_ricorrenza !== 'terminata'" variant="secondary" size="md" @click="$emit('cambia-stato', movimento, 'terminata')">Termina</WButton>
        <WButton variant="secondary" size="md" @click="$emit('modifica', movimento)">
          <Pencil :size="16" aria-hidden="true" />
          Modifica
        </WButton>
        <WButton variant="secondary" size="md" class="ricorrente-card__elimina" @click="$emit('elimina', movimento)">
          <Trash2 :size="16" aria-hidden="true" />
          Elimina
        </WButton>
      </div>
    </div>
  </WCard>
</template>

<style scoped>
.ricorrente-card { display: grid; grid-template-columns: 112px minmax(0, 1fr); overflow: hidden; }
.ricorrente-card__calendario {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 0.125rem; padding: 1.25rem; border-right: 1px solid var(--divider);
  background: color-mix(in srgb, var(--accent-green) 9%, transparent);
  color: var(--text-primary);
}
.ricorrente-card__calendario span { font-size: 2rem; line-height: 1; font-weight: 750; letter-spacing: -0.04em; }
.ricorrente-card__calendario span.ricorrente-card__calendario--compatto { font-size: 1.25rem; white-space: nowrap; }
.ricorrente-card__calendario small { font-size: var(--text-xs); color: var(--text-muted); }
.ricorrente-card__corpo { min-width: 0; padding: 1.25rem; }
.ricorrente-card__testa { display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; }
.ricorrente-card__testa h2 { margin: 0; color: var(--text-primary); font-size: 1.0625rem; font-weight: 650; }
.ricorrente-card__tipo { display: inline-flex; align-items: center; gap: 0.35rem; margin: 0.35rem 0 0; color: var(--negative); font-size: var(--text-xs); }
.ricorrente-card__tipo--entrata { color: var(--positive); }
.ricorrente-card__importo { flex-shrink: 0; color: var(--negative); font-size: 1.125rem; font-weight: 700; }
.ricorrente-card__importo--entrata { color: var(--positive); }
.ricorrente-card__dati { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 1rem; margin: 1.25rem 0; }
.ricorrente-card__dati div { min-width: 0; }
.ricorrente-card__dati dt { display: flex; align-items: center; gap: 0.3rem; color: var(--text-muted); font-size: var(--text-xs); }
.ricorrente-card__dati dd { margin: 0.3rem 0 0; color: var(--text-primary); font-size: var(--text-xs); font-weight: 600; overflow-wrap: anywhere; }
.ricorrente-card__stato { display: inline-flex; align-items: center; gap: 0.35rem; }
.ricorrente-card__stato::before { content: ''; width: 0.5rem; height: 0.5rem; border-radius: 50%; background: var(--positive); }
.ricorrente-card__stato--inattiva::before { background: var(--text-muted); }
.ricorrente-card__azioni { display: flex; justify-content: flex-end; flex-wrap: wrap; gap: 0.625rem; }
.ricorrente-card__elimina { color: var(--negative); }

@media (max-width: 720px) {
  .ricorrente-card { grid-template-columns: 72px minmax(0, 1fr); }
  .ricorrente-card__calendario { padding: 1rem 0.5rem; justify-content: flex-start; padding-top: 1.35rem; }
  .ricorrente-card__calendario span { font-size: 1.5rem; }
  .ricorrente-card__calendario small { text-align: center; }
  .ricorrente-card__corpo { padding: 1rem; }
  .ricorrente-card__testa { flex-direction: column; gap: 0.75rem; }
  .ricorrente-card__dati { grid-template-columns: 1fr 1fr; gap: 0.875rem; }
  .ricorrente-card__azioni { justify-content: stretch; }
  .ricorrente-card__azioni :deep(.w-btn) { flex: 1; padding-inline: 0.75rem; }
}

@media (max-width: 390px) {
  .ricorrente-card { grid-template-columns: 1fr; }
  .ricorrente-card__calendario { flex-direction: row; justify-content: flex-start; padding: 0.75rem 1rem; border-right: 0; border-bottom: 1px solid var(--divider); }
}
</style>
