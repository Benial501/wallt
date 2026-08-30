<script setup>
defineProps({
  hoverable: { type: Boolean, default: false },
  padding: { type: String, default: '1.25rem' },
});
</script>

<template>
  <div
    class="w-card"
    :class="{ 'w-card--hoverable': hoverable }"
    :style="{ padding }"
  >
    <slot />
  </div>
</template>

<style scoped>
.w-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.w-card--hoverable:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-card);
}
</style>
