<script setup>
defineProps({
  type: { type: String, default: 'text' },
  lines: { type: Number, default: 1 },
});
</script>

<template>
  <div class="w-skeleton" :class="`w-skeleton--${type}`">
    <template v-if="type === 'text'">
      <div v-for="n in lines" :key="n" class="w-skeleton__line" :style="{ width: n === lines ? '70%' : '100%' }" />
    </template>
  </div>
</template>

<style scoped>
.w-skeleton__line,
.w-skeleton--card,
.w-skeleton--circle {
  background: linear-gradient(90deg, var(--bg-input) 25%, var(--bg-card) 50%, var(--bg-input) 75%);
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
  border-radius: var(--radius-sm);
}

.w-skeleton__line {
  height: 14px;
  margin-bottom: 0.5rem;
}

.w-skeleton--card {
  height: 120px;
  border-radius: var(--radius-lg);
}

.w-skeleton--circle {
  width: 48px;
  height: 48px;
  border-radius: 50%;
}
</style>
