<script setup>
/**
 * Il contrassegno "PREMIUM" accanto a una funzione a pagamento.
 *
 * Usato con moderazione, per scelta: il brief chiede di non riempire l'app di
 * banner, e Premium va presentato dove l'utente INCONTRA la funzione — la
 * pagina Conti e la pagina del piano — non su ogni schermata. Questo
 * componente esiste proprio perché quel contrassegno abbia una forma sola e
 * non venga reinventato ogni volta che serve.
 */
defineProps({
  /** 'default' accanto a un titolo, 'inline' dentro una riga di testo. */
  variante: { type: String, default: 'default' },
});
</script>

<template>
  <span class="premium-badge" :class="`premium-badge--${variante}`">Premium</span>
</template>

<style scoped>
.premium-badge {
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;
  padding: 0.125rem 0.5rem;
  border-radius: var(--radius-pill);
  /* Il pavimento tipografico informativo è --text-xs (14px); il contrassegno
     è un'etichetta e non testo da leggere, quindi usa --text-micro con la
     deroga prevista da Coding Rule 19. */
  font-size: var(--text-micro); /* deroga: etichetta, non testo informativo */
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  /* Token già dichiarati e verificati: il contrassegno non introduce una
     nuova coppia testo/superficie, quindi `tests/contrasto.test.js` non ha
     bisogno di una voce in più. */
  color: var(--text-primary);
  background: var(--glass-interactive-bg);
  border: 1px solid var(--glass-interactive-border);
  white-space: nowrap;
}

.premium-badge--inline {
  margin-left: 0.375rem;
  vertical-align: middle;
}
</style>
