<script setup>
import { Construction } from '@/utils/appIcons';

defineProps({
  title: { type: String, required: true },
});
</script>

<template>
  <div class="placeholder animate-fade-in">
    <Construction class="placeholder__icon" :size="48" :stroke-width="1.5" />
    <h1>{{ title }}</h1>
    <p>In arrivo nella prossima fase.</p>
  </div>
</template>

<style scoped>
.placeholder { text-align: center; padding: 4rem 1rem; color: var(--text-secondary); }
.placeholder__icon { display: block; margin: 0 auto 1rem; color: var(--text-muted); stroke: currentColor; }
.placeholder h1 { font-size: 1.5rem; font-weight: 600; color: var(--text-primary); margin-bottom: 0.5rem; }
</style>
