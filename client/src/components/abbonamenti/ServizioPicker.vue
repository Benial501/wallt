<script setup>
import { computed, ref } from 'vue';
import ServizioIcona from './ServizioIcona.vue';
import { CATALOGO_SERVIZI, GRUPPI_SERVIZI, ICONE_GENERICHE } from '@/utils/abbonamenti';

const props = defineProps({
  icona: { type: String, default: null },
});

defineEmits(['scegli-servizio', 'scegli-generica']);

const ricerca = ref('');
const testo = computed(() => ricerca.value.trim().toLowerCase());

const gruppi = computed(() => GRUPPI_SERVIZI
  .map((gruppo) => ({
    ...gruppo,
    voci: CATALOGO_SERVIZI.filter((voce) => voce.gruppo === gruppo.id && voce.nome.toLowerCase().includes(testo.value)),
  }))
  .filter((gruppo) => gruppo.voci.length > 0));

const generiche = computed(() => ICONE_GENERICHE.filter((voce) => voce.nome.toLowerCase().includes(testo.value)));
const nessuno = computed(() => gruppi.value.length === 0 && generiche.value.length === 0);
</script>

<template>
  <div class="servizio-picker">
    <input
      v-model="ricerca"
      class="form-input"
      type="search"
      placeholder="Cerca Netflix, Spotify, ChatGPT…"
      aria-label="Cerca un servizio"
    />
    <div class="servizio-picker__griglie">
      <section v-for="gruppo in gruppi" :key="gruppo.id" class="servizio-picker__gruppo">
        <h3>{{ gruppo.etichetta }}</h3>
        <div class="servizio-picker__griglia">
          <button
            v-for="voce in gruppo.voci"
            :key="voce.id"
            type="button"
            class="servizio-picker__voce"
            :class="{ 'servizio-picker__voce--scelta': props.icona === voce.id }"
            :aria-pressed="props.icona === voce.id"
            @click="$emit('scegli-servizio', voce)"
          >
            <ServizioIcona :icona="voce.id" :nome="voce.nome" :size="36" />
            <span>{{ voce.nome }}</span>
          </button>
        </div>
      </section>
      <section v-if="generiche.length" class="servizio-picker__gruppo">
        <h3>Icone generiche</h3>
        <div class="servizio-picker__griglia">
          <button
            v-for="voce in generiche"
            :key="voce.id"
            type="button"
            class="servizio-picker__voce"
            :class="{ 'servizio-picker__voce--scelta': props.icona === voce.id }"
            :aria-pressed="props.icona === voce.id"
            @click="$emit('scegli-generica', voce)"
          >
            <ServizioIcona :icona="voce.id" :nome="voce.nome" :size="36" />
            <span>{{ voce.nome }}</span>
          </button>
        </div>
      </section>
      <p v-if="nessuno" class="servizio-picker__nessuno">Non è in elenco: scrivi il nome qui sotto e scegli un’icona generica.</p>
    </div>
  </div>
</template>

<style scoped>
.servizio-picker { display: flex; flex-direction: column; gap: 0.5rem; }
.servizio-picker__griglie {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  max-height: 16rem;
  padding: 0.625rem;
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
  touch-action: pan-y;
  border: 1px solid var(--glass-secondary-border);
  border-radius: var(--radius-lg);
  background: var(--glass-secondary-bg);
}
.servizio-picker__gruppo h3 { margin: 0 0 0.375rem; color: var(--text-muted); font-size: var(--text-xs); font-weight: 600; }
.servizio-picker__griglia { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 0.25rem; }
.servizio-picker__voce {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.3125rem;
  min-width: 0;
  padding: 0.5rem 0.125rem;
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--text-secondary);
  font: inherit;
  font-size: var(--text-xs);
  line-height: 1.2;
  text-align: center;
  cursor: pointer;
  transition: background var(--dur-fast) var(--ease-out), border-color var(--dur-fast) var(--ease-out);
}
.servizio-picker__voce span:last-child { max-width: 100%; overflow-wrap: anywhere; }
@media (hover: hover) {
  .servizio-picker__voce:hover { background: var(--glass-interactive-bg); }
}
.servizio-picker__voce:focus-visible { outline: 2px solid var(--border-focus); outline-offset: 1px; }
.servizio-picker__voce--scelta {
  border-color: color-mix(in srgb, var(--accent-green) 55%, transparent);
  background: color-mix(in srgb, var(--accent-green) 12%, transparent);
  color: var(--text-primary);
  font-weight: 600;
}
.servizio-picker__nessuno { margin: 0; color: var(--text-muted); font-size: var(--text-xs); line-height: 1.45; }
</style>
