<script setup>
/**
 * La riga colorata che dice in una frase come stai. Il colore accompagna il
 * testo e non lo sostituisce: chi non distingue il verde dal rosso legge
 * comunque la frase, e l'icona cambia con il tono.
 */
defineProps({
  tono: { type: String, default: 'neutro' },
  testo: { type: String, required: true },
});

const ICONE = { bene: '✓', attenzione: '!', male: '!', neutro: 'i' };
</script>

<template>
  <p class="stato" :class="`stato--${tono}`" role="status">
    <span class="stato__icona" aria-hidden="true">{{ ICONE[tono] ?? 'i' }}</span>
    <span>{{ testo }}</span>
  </p>
</template>

<style scoped>
.stato { display: flex; align-items: flex-start; gap: .65rem; margin: 0; padding: .85rem 1rem; border-radius: var(--radius-md); font-size: var(--text-base); line-height: 1.5; color: var(--text-primary); background: var(--surface-inset); }
/* Icona a contorno: il colore del tono sta sul segno, non sotto un testo
   bianco, così resta leggibile sia in tema chiaro sia in tema scuro. */
.stato__icona { display: grid; place-items: center; flex: 0 0 1.5rem; height: 1.5rem; border: 2px solid var(--text-secondary); border-radius: 50%; font-size: var(--text-xs); font-weight: 700; color: var(--text-secondary); }
.stato--bene { background: color-mix(in srgb, var(--positive) 12%, transparent); }
.stato--bene .stato__icona { border-color: var(--positive); color: var(--positive); }
.stato--attenzione { background: color-mix(in srgb, var(--warning) 14%, transparent); }
.stato--attenzione .stato__icona { border-color: var(--warning); color: var(--warning); }
.stato--male { background: color-mix(in srgb, var(--negative) 11%, transparent); }
.stato--male .stato__icona { border-color: var(--negative); color: var(--negative); }
</style>
