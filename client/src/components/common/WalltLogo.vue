<script setup>
/**
 * Simbolo di brand WALLT: una "W" a tratto unico il cui ultimo segmento
 * prosegue oltre l'altezza della lettera e si chiude in una punta di freccia —
 * la stessa linea è insieme lettera e andamento in crescita, senza icone
 * letterali (portafogli/banconote/monete). Vettoriale (nessun asset raster),
 * nitido a qualsiasi risoluzione e dimensione.
 */
defineProps({
  // Solo simbolo, senza wordmark "WALLT" — per contesti compatti (mobile header).
  markOnly: { type: Boolean, default: false },
  // Altezza del simbolo in px; il wordmark si adatta di conseguenza via CSS.
  size: { type: Number, default: 28 },
});
</script>

<template>
  <span class="wallt-logo" :class="{ 'wallt-logo--compact': markOnly }">
    <svg
      class="wallt-logo__mark"
      :width="size"
      :height="size"
      viewBox="0 0 100 100"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M9,28 L28,74 L44,50 L60,74 L74,32"
        class="wallt-logo__stroke"
        stroke-width="11"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <path d="M69,34 L93,7 L96,32 L83,21 Z" class="wallt-logo__tip" />
    </svg>
    <span v-if="!markOnly" class="wallt-logo__word">WALLT</span>
    <span v-else class="sr-only">WALLT</span>
  </span>
</template>

<style scoped>
.wallt-logo {
  display: inline-flex;
  align-items: center;
  gap: 0.5em;
}

.wallt-logo__mark {
  display: block;
  flex-shrink: 0;
  filter: drop-shadow(0 0 5px var(--accent-glow));
  transition: filter 200ms ease-out, transform 200ms ease-out;
}

.wallt-logo__stroke {
  stroke: var(--accent-green);
}

.wallt-logo__tip {
  fill: var(--accent-green);
}

.wallt-logo__word {
  font-weight: 800;
  font-size: 1.25rem;
  letter-spacing: -0.02em;
  color: var(--text-primary);
  line-height: 1;
}

.wallt-logo--compact .wallt-logo__mark {
  filter: drop-shadow(0 0 4px var(--accent-glow));
}

/* L'hover si applica solo quando il logo è dentro un elemento interattivo
   (link/bottone del parent): il glow si intensifica leggermente, coerente
   con l'effetto già usato per lo stato attivo della bottom-nav. */
a:hover .wallt-logo__mark,
button:hover .wallt-logo__mark {
  filter: drop-shadow(0 0 9px var(--accent-glow));
  transform: translateY(-1px);
}

@media (prefers-reduced-motion: reduce) {
  .wallt-logo__mark {
    transition: none;
  }
}
</style>
