<script setup>
/**
 * «Vedi i dettagli»: tutto ciò che serve a chi vuole capire come nasce un
 * numero (grafici, medie, calcoli) resta qui, chiuso. La pagina si apre sulle
 * poche cose che chiunque capisce.
 */
</script>

<template>
  <details class="dettagli">
    <summary>Vedi i dettagli</summary>
    <div class="dettagli__corpo">
      <slot />
    </div>
  </details>
</template>

<style scoped>
.dettagli { margin-top: 1.25rem; }
.dettagli summary { display: flex; align-items: center; justify-content: center; min-height: 48px; border: 1px solid var(--divider); border-radius: var(--radius-md); color: var(--accent-text); font-size: var(--text-base); font-weight: 600; cursor: pointer; list-style: none; }
.dettagli summary::-webkit-details-marker { display: none; }
.dettagli summary::after { content: '▾'; margin-left: .5rem; }
.dettagli[open] summary::after { content: '▴'; }
.dettagli summary:focus-visible { outline: 2px solid var(--accent-green); outline-offset: 2px; }
.dettagli__corpo { margin-top: 1rem; }
</style>
