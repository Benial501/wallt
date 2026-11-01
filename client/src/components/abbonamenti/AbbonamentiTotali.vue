<script setup>
import { formatValuta } from '@/utils/formatters';
import { GLOSSARIO } from '@/content/glossario';

defineProps({
  totali: { type: Object, required: true },
  valuta: { type: String, default: 'EUR' },
});
</script>

<template>
  <section class="abbonamenti-totali" aria-labelledby="abbonamenti-totali-titolo">
    <h2 id="abbonamenti-totali-titolo">Quanto spendi in abbonamenti</h2>
    <dl class="abbonamenti-totali__coppia">
      <div>
        <dt>{{ GLOSSARIO.abbonamenti_al_mese.etichetta }}</dt>
        <dd>{{ formatValuta(totali.al_mese, valuta) }}</dd>
      </div>
      <div>
        <dt>{{ GLOSSARIO.abbonamenti_all_anno.etichetta }}</dt>
        <dd>{{ formatValuta(totali.all_anno, valuta) }}</dd>
      </div>
    </dl>
    <p v-if="totali.se_tutti_12_mesi !== null" class="abbonamenti-totali__nota">
      {{ formatValuta(totali.se_tutti_12_mesi, valuta) }} se anche quelli a tempo durassero tutto l’anno.
    </p>
  </section>
</template>

<style scoped>
.abbonamenti-totali {
  padding: 1rem;
  border: 1px solid color-mix(in srgb, var(--accent-green) 28%, var(--border));
  border-radius: var(--radius-lg);
  background: color-mix(in srgb, var(--accent-green) 8%, transparent);
}
.abbonamenti-totali h2 { margin: 0 0 0.75rem; color: var(--text-primary); font-size: var(--text-sm); font-weight: 650; }
.abbonamenti-totali__coppia { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; margin: 0; }
.abbonamenti-totali__coppia div { min-width: 0; }
.abbonamenti-totali__coppia dt { color: var(--text-secondary); font-size: var(--text-xs); }
.abbonamenti-totali__coppia dd { margin: 0.15rem 0 0; color: var(--text-primary); font-size: 1.375rem; font-weight: 750; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.abbonamenti-totali__nota { margin: 0.625rem 0 0; color: var(--text-secondary); font-size: var(--text-xs); line-height: 1.45; }
</style>
