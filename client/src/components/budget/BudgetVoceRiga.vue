<script setup>
/**
 * Una voce del budget (Bisogni, Desideri, Futuro) nella pagina principale:
 * usato su obiettivo, barra, nota e la frase che spiega cosa contiene la voce.
 * Tutta la riga apre il dettaglio della voce.
 */
import { computed } from 'vue';
import { GLOSSARIO } from '@/content/glossario';
import { useValuta } from '@/composables/useValuta';
import { coloreVoce } from '@/components/budget/coloriVoci';
import { descriviVoce } from '@/content/budgetConsigli';

const props = defineProps({
  voce: { type: String, required: true },
  /** voci.<voce> da GET /budget/stato */
  dati: { type: Object, required: true },
  /** Senza entrata gli obiettivi valgono zero: si mostra solo quanto è stato usato. */
  entrataMancante: { type: Boolean, default: false },
});
defineEmits(['apri']);

const { formatValuta } = useValuta();

const concetto = computed(() => GLOSSARIO[`budget_${props.voce}`]);
const descrizione = computed(() => descriviVoce(props.voce, props.dati, { formatValuta, entrataMancante: props.entrataMancante }));
const colore = computed(() => (descrizione.value.oltre ? 'var(--negative)' : coloreVoce(props.voce)));
</script>

<template>
  <button type="button" class="voce-riga" @click="$emit('apri', voce)">
    <span class="voce-riga__testa">
      <span class="voce-riga__nome">
        <span class="voce-riga__punto" :style="{ background: coloreVoce(voce) }" aria-hidden="true" />
        {{ concetto.etichetta }}
      </span>
      <span v-if="descrizione.mostraObiettivo" class="voce-riga__cifre">{{ formatValuta(dati.usato) }} di {{ formatValuta(dati.obiettivo) }}</span>
    </span>
    <span v-if="descrizione.mostraObiettivo" class="voce-riga__barra" aria-hidden="true">
      <span class="voce-riga__riempimento" :style="{ width: descrizione.larghezza + '%', background: colore }" />
    </span>
    <span class="voce-riga__nota" :class="{ 'voce-riga__nota--oltre': descrizione.oltre }">{{ descrizione.nota }}</span>
    <span class="voce-riga__spiegazione">{{ concetto.descrizione }}</span>
  </button>
</template>

<style scoped>
.voce-riga {
  display: flex; flex-direction: column; gap: 0.375rem; width: 100%;
  padding: 0.875rem 0; background: none; border: 0; border-bottom: 1px solid var(--border);
  text-align: left; cursor: pointer; color: inherit; font: inherit;
}
.voce-riga:last-child { border-bottom: 0; }
.voce-riga:focus-visible { outline: 2px solid var(--border-focus); outline-offset: 4px; border-radius: 8px; }
.voce-riga__testa { display: flex; justify-content: space-between; align-items: baseline; gap: 0.5rem; flex-wrap: wrap; }
.voce-riga__nome { display: inline-flex; align-items: center; gap: 0.5rem; font-weight: 600; color: var(--text-primary); }
.voce-riga__punto { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
.voce-riga__cifre { font-size: var(--text-xs); color: var(--text-secondary); font-variant-numeric: tabular-nums; }
.voce-riga__barra { display: block; height: 8px; background: var(--bg-input); border-radius: 4px; overflow: hidden; }
.voce-riga__riempimento { display: block; height: 100%; border-radius: 4px; transition: width 0.5s ease; }
.voce-riga__nota { font-size: var(--text-xs); color: var(--text-secondary); }
.voce-riga__nota--oltre { color: var(--negative); font-weight: 600; }
.voce-riga__spiegazione { font-size: var(--text-xs); color: var(--text-muted); line-height: 1.45; }
@media (prefers-reduced-motion: reduce) { .voce-riga__riempimento { transition: none; } }
</style>
