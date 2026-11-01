<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import HelpTrigger from '@/components/help/HelpTrigger.vue';
import { tabSituazione } from '@/utils/situazioneTab';

/**
 * Intestazione e schede di «La tua situazione». Oggi, Prossimi 30 giorni e Analisi
 * sono la stessa pagina; Programmate / Abbonamenti ha una rotta propria, perché non
 * dipende da ciò che il cruscotto carica: se la situazione non si legge, le scadenze
 * devono restare raggiungibili.
 */
const PROGRAMMATE = 'programmate';

const route = useRoute();
const router = useRouter();
const schede = ref(null);

const inProgrammate = computed(() => route.name === 'ricorrenti');
const attiva = computed(() => (inProgrammate.value ? PROGRAMMATE : tabSituazione(route.query)));

const vaiA = (scheda) => {
  if (scheda === attiva.value) return;
  if (scheda === PROGRAMMATE) {
    router.push({ name: 'ricorrenti' });
    return;
  }
  const query = scheda === 'today' ? {} : { tab: scheda };
  if (inProgrammate.value) router.push({ name: 'situazione', query });
  else router.replace({ query });
};

// Su un telefono le schede scorrono: quella aperta non deve restare fuori vista.
onMounted(() => {
  schede.value?.querySelector('[aria-pressed="true"]')?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
});
</script>

<template>
  <header class="page-header">
    <div>
      <div class="page-title-row">
        <h1 class="page-title">La tua situazione</h1>
        <HelpTrigger topic="piano-smart" />
      </div>
      <p class="page-sub">
        Capisci cosa sta succedendo ai tuoi soldi e decidi meglio come muoverti.
      </p>
    </div>
  </header>

  <div ref="schede" class="tabs" role="group" aria-label="Aree della tua situazione">
    <button
      type="button" :aria-pressed="attiva === 'today'"
      :class="{ active: attiva === 'today' }" @click="vaiA('today')"
    >Oggi</button>
    <button
      type="button" :aria-pressed="attiva === 'upcoming'"
      :class="{ active: attiva === 'upcoming' }" @click="vaiA('upcoming')"
    >Prossimi 30 giorni</button>
    <button
      type="button" :aria-pressed="attiva === 'analysis'"
      :class="{ active: attiva === 'analysis' }" @click="vaiA('analysis')"
    >Analisi</button>
    <button
      type="button" :aria-pressed="attiva === PROGRAMMATE"
      :class="{ active: attiva === PROGRAMMATE }" @click="vaiA(PROGRAMMATE)"
    >Programmate / Abbonamenti</button>
  </div>
</template>

<style scoped>
.page-header { display: flex; justify-content: space-between; gap: 1rem; align-items: flex-start; margin-bottom: 1.25rem; }
.page-title-row { display: flex; align-items: center; gap: .5rem; }
.page-title { font-size: 1.5rem; font-weight: 700; color: var(--text-primary); }
.page-sub { color: var(--text-secondary); line-height: 1.55; font-size: var(--text-sm); }

.tabs { display: flex; gap: .4rem; overflow-x: auto; border-bottom: 1px solid var(--divider); margin-bottom: 1.25rem; scrollbar-width: thin; }
.tabs button { flex: 0 0 auto; white-space: nowrap; border: 0; background: none; padding: .75rem 1rem; min-height: 44px; color: var(--text-muted); font: inherit; cursor: pointer; border-bottom: 2px solid transparent; }
.tabs button.active { color: var(--accent-text); border-color: var(--accent-green); font-weight: 700; }

@media (max-width: 600px) {
  .page-header { display: block; }
  .tabs { gap: .15rem; }
  .tabs button { padding: .75rem .6rem; }
}
</style>
