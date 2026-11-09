<script setup>
import { computed, ref } from 'vue';
import { CATEGORY_ICON_OPTIONS, resolveCategoryIcon } from '@/utils/categoryIcons';

const model = defineModel({ type: String, default: 'Tag' });
const props = defineProps({
  icons: { type: Array, default: () => CATEGORY_ICON_OPTIONS.map(icon => icon.id) },
  color: { type: String, default: '#3498DB' },
});
const search = ref('');
const selected = computed(() => CATEGORY_ICON_OPTIONS.find(icon => icon.id === model.value));
const options = computed(() => CATEGORY_ICON_OPTIONS.filter(icon =>
  props.icons.includes(icon.id) && icon.label.toLocaleLowerCase('it').includes(search.value.trim().toLocaleLowerCase('it')),
));
</script>

<template>
  <fieldset class="icon-picker">
    <legend>Icona</legend>
    <div class="icon-picker__preview" aria-live="polite">
      <span class="icon-picker__mark" :style="{ color }">
        <component :is="resolveCategoryIcon(model)" :size="26" :stroke-width="1.75" aria-hidden="true" />
      </span>
      <span>{{ selected?.label || 'Etichetta' }}</span>
    </div>
    <input v-model="search" type="search" class="form-input" placeholder="Cerca un’icona" aria-label="Cerca un’icona" />
    <div class="icon-picker__grid" role="group" aria-label="Icone disponibili">
      <label v-for="icon in options" :key="icon.id" class="icon-picker__option">
        <input v-model="model" type="radio" name="category-icon" :value="icon.id" />
        <span class="icon-picker__tile">
          <component :is="resolveCategoryIcon(icon.id)" :size="23" :stroke-width="1.75" aria-hidden="true" />
          <span>{{ icon.label }}</span>
        </span>
      </label>
      <p v-if="!options.length" class="icon-picker__empty">Nessuna icona trovata. Prova un altro nome.</p>
    </div>
  </fieldset>
</template>

<style scoped>
.icon-picker { min-width: 0; border: 0; padding: 0; margin: 0; }
legend { margin-bottom: 0.4375rem; font-size: 0.875rem; font-weight: 600; color: var(--text-primary); }
.icon-picker__preview { display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.75rem; color: var(--text-primary); font-size: 0.875rem; }
.icon-picker__mark { display: grid; place-items: center; width: 44px; height: 44px; border-radius: var(--radius-md); background: var(--glass-interactive-bg); }
.icon-picker__grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 0.375rem; max-height: 240px; overflow-y: auto; overscroll-behavior: contain; padding: 0.25rem; margin: 0.5rem -0.25rem 0; }
.icon-picker__option { position: relative; min-width: 0; cursor: pointer; }
.icon-picker__option input { position: absolute; width: 1px; height: 1px; opacity: 0; }
.icon-picker__tile { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0.375rem; min-height: 76px; height: 100%; padding: 0.5rem 0.25rem; border: 1px solid var(--glass-interactive-border); border-radius: var(--radius-sm); color: var(--text-secondary); }
.icon-picker__tile > span { max-width: 100%; overflow-wrap: anywhere; font-size: var(--text-xs); line-height: 1.3; text-align: center; }
.icon-picker__option input:checked + .icon-picker__tile { color: var(--accent-text); border-color: var(--accent-text); background: var(--glass-interactive-bg-active); }
.icon-picker__option input:focus-visible + .icon-picker__tile { outline: 2px solid var(--border-focus); outline-offset: 1px; }
.icon-picker__empty { grid-column: 1 / -1; padding: 0.75rem; color: var(--text-secondary); font-size: 0.875rem; }
@media (hover: hover) { .icon-picker__option:hover .icon-picker__tile { background: var(--glass-interactive-bg-hover); } }
@media (max-width: 360px) { .icon-picker__grid { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
</style>
