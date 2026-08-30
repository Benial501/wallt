<script setup>
import { computed } from 'vue';
import { SUGGESTION_ICON_MAP, resolveAppIcon } from '@/utils/appIcons';

const props = defineProps({
  tipo: { type: String, required: true },
  messaggio: { type: String, required: true },
  dettaglio: { type: String, default: '' },
  suggerimento: { type: String, default: '' },
  azione: { type: String, default: '' },
});

const tipoConfig = {
  alert: { icon: SUGGESTION_ICON_MAP.alert, class: 'tipo-alert' },
  warning: { icon: SUGGESTION_ICON_MAP.warning, class: 'tipo-warning' },
  warning_scommesse: { icon: SUGGESTION_ICON_MAP.warning_scommesse, class: 'tipo-scommesse' },
  info: { icon: SUGGESTION_ICON_MAP.info, class: 'tipo-info' },
  positivo: { icon: SUGGESTION_ICON_MAP.positivo, class: 'tipo-positivo' },
  budget_alert: { icon: SUGGESTION_ICON_MAP.budget_alert, class: 'tipo-budget' },
  obiettivo_rischio: { icon: SUGGESTION_ICON_MAP.obiettivo_rischio, class: 'tipo-obiettivo' },
};

const config = computed(() => tipoConfig[props.tipo] || tipoConfig.info);
</script>

<template>
  <div class="sug-card stagger-item" :class="config.class">
    <component :is="resolveAppIcon(config.icon)" class="sug-icon" :size="22" :stroke-width="1.75" />
    <div class="sug-content">
      <p class="sug-messaggio">{{ messaggio }}</p>
      <p v-if="dettaglio" class="sug-dettaglio">{{ dettaglio }}</p>
      <p v-if="suggerimento" class="sug-azione">{{ suggerimento }}</p>
      <p v-if="azione" class="sug-azione">{{ azione }}</p>
    </div>
  </div>
</template>

<style scoped>
.sug-card {
  display: flex;
  gap: 0.75rem;
  padding: 1rem;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  border-left-width: 4px;
}
.tipo-alert { border-left-color: var(--negative); }
.tipo-warning { border-left-color: var(--warning); }
.tipo-scommesse { border-left-color: var(--negative); }
.tipo-info { border-left-color: var(--accent-blue, #74B9FF); }
.tipo-positivo { border-left-color: var(--positive); }
.tipo-budget { border-left-color: var(--warning); }
.tipo-obiettivo { border-left-color: var(--accent-purple, #6C5CE7); }
.sug-icon { flex-shrink: 0; color: var(--text-secondary); stroke: currentColor; }
.tipo-alert .sug-icon { color: var(--negative); }
.tipo-warning .sug-icon, .tipo-budget .sug-icon { color: var(--warning); }
.tipo-positivo .sug-icon { color: var(--positive); }
.tipo-info .sug-icon { color: var(--accent-blue, #74B9FF); }
.tipo-obiettivo .sug-icon { color: var(--accent-purple, #6C5CE7); }
.sug-messaggio { font-weight: 600; font-size: 0.875rem; color: var(--text-primary); }
.sug-dettaglio { font-size: 0.8125rem; color: var(--text-secondary); margin-top: 0.25rem; }
.sug-azione { font-size: 0.8125rem; color: var(--accent-green); margin-top: 0.375rem; }
</style>
