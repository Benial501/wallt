<script setup>
import { useId } from 'vue';

/**
 * Versione vettoriale del simbolo usato nell'icona WALLT. La freccia nasce
 * direttamente dall'ultima asta della W, così il marchio resta leggibile e
 * coerente a ogni dimensione senza dipendere dall'asset raster.
 */
defineProps({
  // Solo simbolo, senza wordmark "WALLT" — per contesti compatti (mobile header).
  markOnly: { type: Boolean, default: false },
  // Altezza del simbolo in px; il wordmark si adatta di conseguenza via CSS.
  size: { type: Number, default: 28 },
});

const gradientId = `wallt-mark-gradient-${useId().replace(/:/g, '')}`;
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
      <defs>
        <linearGradient :id="gradientId" x1="18" y1="78" x2="86" y2="10" gradientUnits="userSpaceOnUse">
          <stop offset="0" stop-color="#2499ee" />
          <stop offset="0.55" stop-color="#27c7d5" />
          <stop offset="1" stop-color="#26db87" />
        </linearGradient>
      </defs>
      <path
        d="M15 35H28L39 64L50 35H63L72 60L82 32L75 27L96 8L98 37L89 31L76 69H65L56 47L47 69H34L15 35Z"
        :fill="`url(#${gradientId})`"
      />
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
  transition: transform 200ms ease-out;
}

.wallt-logo__word {
  font-weight: 800;
  font-size: 1.25rem;
  letter-spacing: -0.02em;
  color: var(--text-primary);
  line-height: 1;
}

a:hover .wallt-logo__mark,
button:hover .wallt-logo__mark {
  transform: translateY(-1px);
}

@media (prefers-reduced-motion: reduce) {
  .wallt-logo__mark {
    transition: none;
  }
}
</style>
