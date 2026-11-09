<script setup>
import { computed } from 'vue';
import { resolveCategoryIcon } from '@/utils/categoryIcons';
import { getCategoriaEntrata, getCategoriaUscita } from '@/utils/categorie';
import { getCategoryIconFromMovimento, getCategoryIcon, resolveAppIcon } from '@/utils/appIcons';

const props = defineProps({
  movimento: { type: Object, default: null },
  categoria: { type: String, default: '' },
  tipo: { type: String, default: 'uscita' },
  size: { type: Number, default: 18 },
  strokeWidth: { type: Number, default: 1.75 },
});

const icon = computed(() => {
  const tipo = props.movimento?.tipo || props.tipo;
  const id = props.movimento?.categoria || props.categoria;
  const cat = (tipo === 'entrata' ? getCategoriaEntrata : getCategoriaUscita)(id);
  if (cat?.icona && cat.icona !== 'Tag') return resolveCategoryIcon(cat.icona);
  if (cat?.isDefault === false) return resolveCategoryIcon(cat.icona);
  if (props.movimento) return resolveAppIcon(getCategoryIconFromMovimento(props.movimento));
  return resolveAppIcon(getCategoryIcon(props.categoria, props.tipo));
});
</script>

<template>
  <component :is="icon" class="category-icon" :size="size" :stroke-width="strokeWidth" />
</template>

<style scoped>
.category-icon {
  stroke: currentColor;
  flex-shrink: 0;
}
</style>
