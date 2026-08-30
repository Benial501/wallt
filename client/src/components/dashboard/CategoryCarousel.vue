<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue';
import CategoryCard from './CategoryCard.vue';

const props = defineProps({
  cards: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false },
});

const trackRef = ref(null);
const activeIndex = ref(0);

const updateActiveIndex = () => {
  const track = trackRef.value;
  if (!track || !props.cards.length) return;

  const cardWidth = track.firstElementChild?.offsetWidth || 148;
  const gap = 12;
  const index = Math.round(track.scrollLeft / (cardWidth + gap));
  activeIndex.value = Math.min(Math.max(index, 0), props.cards.length - 1);
};

const scrollToIndex = (i) => {
  const cardWidth = trackRef.value?.firstElementChild?.offsetWidth || 148;
  trackRef.value?.scrollTo({ left: i * (cardWidth + 12), behavior: 'smooth' });
};

onMounted(() => {
  trackRef.value?.addEventListener('scroll', updateActiveIndex, { passive: true });
});

onUnmounted(() => {
  trackRef.value?.removeEventListener('scroll', updateActiveIndex);
});

watch(() => props.cards.length, () => {
  activeIndex.value = 0;
});
</script>

<template>
  <section class="category-carousel">
    <div v-if="loading" class="category-carousel__skeleton">
      <div v-for="i in 4" :key="i" class="category-carousel__skeleton-card" />
    </div>

    <template v-else>
      <div class="category-carousel__dots" role="tablist" aria-label="Categorie dashboard">
        <button
          v-for="(_, i) in cards"
          :key="i"
          type="button"
          class="category-carousel__dot"
          :class="{ 'category-carousel__dot--active': i === activeIndex }"
          :aria-label="`Categoria ${i + 1}`"
          :aria-selected="i === activeIndex"
          @click="scrollToIndex(i)"
        />
      </div>

      <div ref="trackRef" class="category-carousel__track">
        <CategoryCard
          v-for="card in cards"
          :key="card.id"
          v-bind="card"
        />
      </div>
    </template>
  </section>
</template>

<style scoped>
.category-carousel {
  margin-bottom: 1rem;
}

.category-carousel__dots {
  display: flex;
  justify-content: center;
  gap: 0.375rem;
  margin-bottom: 0.625rem;
}

.category-carousel__dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  border: none;
  padding: 0;
  background: var(--chart-track);
  cursor: pointer;
  transition: all 300ms ease-out;
}

.category-carousel__dot--active {
  width: 18px;
  border-radius: 3px;
  background: #3B82F6;
}

.category-carousel__track {
  display: flex;
  gap: 0.75rem;
  overflow-x: auto;
  scroll-snap-type: x mandatory;
  scroll-behavior: smooth;
  -webkit-overflow-scrolling: touch;
  padding: 0.25rem 0 0.5rem;
  scrollbar-width: none;
}

.category-carousel__track::-webkit-scrollbar {
  display: none;
}

.category-carousel__skeleton {
  display: flex;
  gap: 0.75rem;
  overflow: hidden;
}

.category-carousel__skeleton-card {
  flex: 0 0 148px;
  height: 168px;
  border-radius: 20px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  animation: pulse 2s ease-in-out infinite;
}
</style>
