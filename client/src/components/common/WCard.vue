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
/* Livello "primary" del sistema del vetro: e' la card di pagina piu' usata. */
.w-card {
  position: relative;
  background: var(--glass-primary-bg);
  border: 1px solid var(--glass-primary-border);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-sm), var(--glass-highlight);
  backdrop-filter: blur(var(--blur-md)) saturate(var(--glass-saturate));
  -webkit-backdrop-filter: blur(var(--blur-md)) saturate(var(--glass-saturate));
  transition:
    transform var(--dur-base) var(--ease-out),
    box-shadow var(--dur-base) var(--ease-out),
    border-color var(--dur-base) var(--ease-out);
}

@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
  .w-card { background: var(--glass-primary-solid); }
}

/* Il sollevamento e' minimo di proposito: due pixel bastano a comunicare che
   l'elemento risponde, di piu' diventa un rimbalzo. */
@media (hover: hover) {
  .w-card--hoverable:hover {
    transform: translateY(-2px);
    border-color: var(--border-strong);
    box-shadow: var(--shadow-lg), var(--glass-highlight-strong);
  }
}

.w-card--hoverable:active {
  transform: translateY(0) scale(0.995);
  transition-duration: var(--dur-instant);
}
</style>
