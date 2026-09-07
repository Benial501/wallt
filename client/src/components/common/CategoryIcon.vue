<script setup>
import { computed } from 'vue';
import { Tag, House, ShoppingBasket, Car, ShoppingBag, Heart, Dumbbell, Music, Plane, Wallet, BookOpen, Gift, Briefcase, Coffee, Gamepad2, GraduationCap, PawPrint } from 'lucide-vue-next';
import { getCategoriaEntrata, getCategoriaUscita } from '@/utils/categorie';
const icons = { Tag, House, ShoppingBasket, Car, ShoppingBag, Heart, Dumbbell, Music, Plane, Wallet, BookOpen, Gift, Briefcase, Coffee, Gamepad2, GraduationCap, PawPrint };
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
  if (cat?.icona && cat.icona !== 'Tag') return icons[cat.icona] || Tag;
  if (cat?.isDefault === false) return icons[cat.icona] || Tag;
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
