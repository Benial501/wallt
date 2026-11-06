<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import HelpTrigger from '@/components/help/HelpTrigger.vue';
import SituazioneVideoGuida from '@/components/piano-smart/SituazioneVideoGuida.vue';
import { useAuthStore } from '@/stores/auth.store';
import { CirclePlay } from 'lucide-vue-next';
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
const authStore = useAuthStore();

// Il video si apre da solo la prima volta che la persona entra nella situazione,
// poi resta disponibile dal pulsante. La chiave è per utente: chi condivide il
// dispositivo con un nuovo account deve vederlo comunque. Se il browser non
// conserva nulla (navigazione privata), il peggio è rivederlo.
const videoAperto = ref(false);
const chiaveVideo = computed(() => `wallt_video_situazione_visto_${authStore.user?.id ?? 'anonimo'}`);
const segnaVisto = () => {
  try { localStorage.setItem(chiaveVideo.value, '1'); } catch { /* storage non disponibile */ }
};
const chiudiVideo = () => {
  videoAperto.value = false;
  segnaVisto();
};
const giaVisto = () => {
  try { return localStorage.getItem(chiaveVideo.value) === '1'; } catch { return true; }
};

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
  if (!giaVisto()) videoAperto.value = true;
  schede.value?.querySelector('[aria-pressed="true"]')?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
});
</script>

<template>
  <header class="page-header">
    <div>
      <div class="page-title-row">
        <h1 class="page-title">La tua situazione</h1>
        <HelpTrigger topic="piano-smart" />
        <button type="button" class="video-trigger" @click="videoAperto = true">
          <CirclePlay :size="15" :stroke-width="1.75" aria-hidden="true" />
          <span>Guarda il video</span>
        </button>
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

  <SituazioneVideoGuida :open="videoAperto" @close="chiudiVideo" />
</template>

<style scoped>
.page-header { display: flex; justify-content: space-between; gap: 1rem; align-items: flex-start; margin-bottom: 1.25rem; }
.page-title-row { display: flex; align-items: center; gap: .5rem; }
.video-trigger {
  display: inline-flex; align-items: center; gap: .3125rem; padding: .375rem .625rem; min-height: 32px;
  border-radius: 999px; border: 1px solid var(--border); background: var(--surface-subtle);
  color: var(--text-secondary); font: inherit; font-size: var(--text-xs); font-weight: 600; cursor: pointer;
}
.video-trigger:hover { color: var(--accent-text); background: var(--accent-light); }
.page-title-row { flex-wrap: wrap; }
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
