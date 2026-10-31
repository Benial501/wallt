<script setup>
import { computed } from 'vue';
import { ICONE_SERVIZI } from './iconeServizi';
import { ICONE_GENERICHE_COMPONENTI } from './iconeGeneriche';

const props = defineProps({
  icona: { type: String, default: null },
  nome: { type: String, default: '' },
  size: { type: Number, default: 40 },
});

const servizio = computed(() => ICONE_SERVIZI[props.icona] || null);
const generica = computed(() => ICONE_GENERICHE_COMPONENTI[props.icona] || null);

const sigla = computed(() => (
  servizio.value?.sigla || (props.nome.trim()[0] || '?').toUpperCase()
));

const stileRiquadro = computed(() => ({
  width: `${props.size}px`,
  height: `${props.size}px`,
  ...(servizio.value ? { background: servizio.value.colore, color: servizio.value.testo } : {}),
}));

// La sigla sta al posto di un logo: segue il riquadro invece della scala del testo.
const stileSigla = computed(() => ({
  fontSize: `${Math.round(props.size * (sigla.value.length > 2 ? 0.3 : 0.42))}px`,
}));
</script>

<template>
  <span class="servizio-icona" :style="stileRiquadro" aria-hidden="true">
    <svg
      v-if="servizio?.path"
      viewBox="0 0 24 24"
      :width="size * 0.56"
      :height="size * 0.56"
      fill="currentColor"
    >
      <path :d="servizio.path" />
    </svg>
    <component :is="generica" v-else-if="generica" :size="size * 0.5" :stroke-width="1.75" />
    <span v-else class="servizio-icona__sigla" :style="stileSigla">{{ sigla }}</span>
  </span>
</template>

<style scoped>
.servizio-icona {
  flex-shrink: 0;
  display: inline-grid;
  place-items: center;
  border-radius: 28%;
  /* Il filo tiene visibile il riquadro nero di Netflix o Notion sul tema scuro. */
  border: 1px solid var(--border);
  color: var(--text-secondary);
  background: var(--surface-elevated);
  line-height: 1;
}
.servizio-icona__sigla { font-weight: 800; letter-spacing: -0.02em; }
</style>
