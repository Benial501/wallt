<script setup>
import { ref, computed } from 'vue';
import { getHelpTopic } from '@/content/helpTopics';
import { CircleHelp, ChevronDown, ChevronRight } from '@/utils/appIcons';

/**
 * Microtesto di aiuto espandibile, da usare DENTRO i form.
 * Non apre un secondo dialogo sopra la modale del form: espande il testo
 * in linea, così la bozza già compilata resta intatta.
 */
const props = defineProps({
  /** Id argomento: il testo viene preso dal catalogo. */
  topic: { type: String, default: null },
  /** In alternativa: titolo e testo espliciti. */
  label: { type: String, default: null },
  text: { type: String, default: null },
  /** Testo sempre visibile, senza espansione. */
  alwaysOpen: { type: Boolean, default: false },
});

const aperto = ref(false);

const topicData = computed(() => getHelpTopic(props.topic));
const titolo = computed(() => props.label || topicData.value?.title || 'Come funziona');
const testo = computed(() => (
  props.text
  || topicData.value?.summary
  || topicData.value?.paragraphs?.[0]
  || ''
));
const dettagli = computed(() => {
  if (props.text) return [];
  return (topicData.value?.paragraphs || []).filter((p) => p !== testo.value);
});

const visibile = computed(() => props.alwaysOpen || aperto.value);
</script>

<template>
  <div v-if="testo" class="help-note">
    <p v-if="alwaysOpen" class="help-note__static">
      <CircleHelp :size="14" :stroke-width="1.75" aria-hidden="true" />
      <span>{{ testo }}</span>
    </p>

    <template v-else>
      <button
        type="button"
        class="help-note__toggle"
        :aria-expanded="aperto ? 'true' : 'false'"
        @click="aperto = !aperto"
      >
        <CircleHelp :size="14" :stroke-width="1.75" aria-hidden="true" />
        <span class="help-note__toggle-label">{{ titolo }}</span>
        <component :is="aperto ? ChevronDown : ChevronRight" :size="14" :stroke-width="1.75" aria-hidden="true" />
      </button>

      <div v-if="visibile" class="help-note__body">
        <p class="help-note__text">{{ testo }}</p>
        <p v-for="(d, i) in dettagli" :key="i" class="help-note__text">{{ d }}</p>
      </div>
    </template>
  </div>
</template>

<style scoped>
.help-note { margin-top: 0.375rem; }

.help-note__toggle {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.375rem 0;
  background: none;
  border: none;
  color: var(--text-muted);
  font-family: inherit;
  font-size: 0.75rem;
  font-weight: 600;
  cursor: pointer;
  text-align: left;
  min-height: 32px;
}
.help-note__toggle:hover { color: var(--accent-green); }
.help-note__toggle:focus-visible { outline: 2px solid var(--border-focus); outline-offset: 2px; border-radius: 4px; }
.help-note__toggle svg { flex-shrink: 0; stroke: currentColor; }

.help-note__body {
  padding: 0.5rem 0.75rem;
  border-radius: var(--radius-sm);
  background: var(--surface-subtle);
  border: 1px solid var(--border);
}

.help-note__text {
  font-size: 0.75rem;
  line-height: 1.55;
  color: var(--text-secondary);
}
.help-note__text + .help-note__text { margin-top: 0.375rem; }

.help-note__static {
  display: flex;
  align-items: flex-start;
  gap: 0.375rem;
  font-size: 0.75rem;
  line-height: 1.5;
  color: var(--text-muted);
}
.help-note__static svg { flex-shrink: 0; margin-top: 0.125rem; stroke: currentColor; }
</style>
