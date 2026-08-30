<script setup>
defineProps({
  icon: { type: [Object, Function], required: true },
  size: { type: Number, default: 20 },
  strokeWidth: { type: Number, default: 1.75 },
  active: { type: Boolean, default: false },
});
</script>

<template>
  <component
    :is="icon"
    class="app-icon"
    :class="{ 'app-icon--active': active }"
    :size="size"
    :stroke-width="strokeWidth"
  />
</template>

<style scoped>
.app-icon {
  flex-shrink: 0;
  color: var(--text-muted);
  stroke: currentColor;
}

.app-icon--active {
  color: var(--accent-green);
  filter: drop-shadow(0 0 6px rgba(0, 212, 170, 0.35));
}
</style>
