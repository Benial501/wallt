<script setup>
import { computed } from 'vue';
import { useHelpStore } from '@/stores/help.store';
import { getHelpTopic } from '@/content/helpTopics';
import { CircleHelp } from '@/utils/appIcons';

const props = defineProps({
  /** Id stabile dell'argomento in content/helpTopics.js */
  topic: { type: String, required: true },
  label: { type: String, default: 'Come funziona?' },
  /** 'inline' (testo con icona) oppure 'quiet' (solo icona con etichetta accessibile) */
  variant: { type: String, default: 'inline' },
});

const helpStore = useHelpStore();

const topicData = computed(() => getHelpTopic(props.topic));
const accessibleLabel = computed(() => (
  topicData.value ? `Aiuto: ${topicData.value.title}` : props.label
));

const apri = () => helpStore.openTopic(props.topic);
</script>

<template>
  <button
    v-if="topicData"
    type="button"
    class="help-trigger"
    :class="`help-trigger--${variant}`"
    :aria-label="accessibleLabel"
    @click="apri"
  >
    <CircleHelp :size="15" :stroke-width="1.75" aria-hidden="true" />
    <span v-if="variant !== 'quiet'" class="help-trigger__label">{{ label }}</span>
  </button>
</template>

<style scoped>
.help-trigger {
  display: inline-flex;
  align-items: center;
  gap: 0.3125rem;
  padding: 0.375rem 0.625rem;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: var(--surface-subtle);
  color: var(--text-secondary);
  font-family: inherit;
  font-size: 0.75rem;
  font-weight: 600;
  line-height: 1.2;
  cursor: pointer;
  transition: color 0.2s ease, border-color 0.2s ease, background 0.2s ease;
}

.help-trigger:hover {
  color: var(--accent-green);
  border-color: rgba(0, 168, 132, 0.35);
  background: var(--accent-light);
}

.help-trigger:focus-visible {
  outline: 2px solid var(--border-focus);
  outline-offset: 2px;
}

.help-trigger svg {
  flex-shrink: 0;
  stroke: currentColor;
}

/* Variante compatta: resta comunque un bersaglio touch adeguato. */
.help-trigger--quiet {
  padding: 0.5rem;
  min-width: 34px;
  min-height: 34px;
  justify-content: center;
}

@media (prefers-reduced-motion: reduce) {
  .help-trigger { transition: none; }
}
</style>
