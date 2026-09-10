<script setup>
defineProps({
  variant: { type: String, default: 'primary' },
  size: { type: String, default: 'md' },
  loading: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
  type: { type: String, default: 'button' },
});

defineEmits(['click']);
</script>

<template>
  <button
    :type="type"
    class="w-btn"
    :class="[`w-btn--${variant}`, `w-btn--${size}`]"
    :disabled="disabled || loading"
    @click="$emit('click', $event)"
  >
    <span v-if="loading" class="w-btn__spinner" />
    <slot />
  </button>
</template>

<style scoped>
.w-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  font-weight: 600;
  letter-spacing: var(--tracking-tight);
  line-height: 1.2;
  cursor: pointer;
  font-family: inherit;
  /* 44px e' il bersaglio tattile minimo: vale anche per la taglia piccola,
     dove a scendere e' l'ingombro visivo, non l'area cliccabile. */
  min-height: 44px;
  transition:
    transform var(--dur-fast) var(--ease-out),
    box-shadow var(--dur-base) var(--ease-out),
    background var(--dur-fast) var(--ease-out),
    border-color var(--dur-fast) var(--ease-out),
    filter var(--dur-fast) var(--ease-out);
}

.w-btn:active:not(:disabled) {
  transform: scale(0.97);
  transition-duration: var(--dur-instant);
}

.w-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.w-btn--sm { padding: 0.5rem 0.875rem; font-size: 0.8125rem; min-height: 36px; }
.w-btn--md { padding: 0.75rem 1.25rem; font-size: 0.875rem; }
.w-btn--lg { padding: 0.875rem 1.5rem; font-size: 0.9375rem; width: 100%; min-height: 48px; }

/* Il primario e' l'unico elemento pieno della schermata: la gerarchia arriva
   dal contrasto, non da un alone colorato. */
.w-btn--primary {
  background: linear-gradient(180deg,
    color-mix(in srgb, var(--accent-green) 92%, white),
    var(--accent-green));
  color: var(--accent-on);
  box-shadow: var(--shadow-sm), inset 0 1px 0 rgba(255, 255, 255, 0.22);
}

@media (hover: hover) {
  .w-btn--primary:hover:not(:disabled) {
    box-shadow: var(--shadow-glow), inset 0 1px 0 rgba(255, 255, 255, 0.28);
    transform: translateY(-1px);
    filter: brightness(1.04);
  }
}

/* Secondario: vetro interattivo, stesso linguaggio di chip e campi. */
.w-btn--secondary {
  background: var(--glass-interactive-bg);
  border-color: var(--glass-interactive-border);
  color: var(--text-primary);
  box-shadow: var(--glass-highlight);
}

@media (hover: hover) {
  .w-btn--secondary:hover:not(:disabled) {
    background: var(--glass-interactive-bg-hover);
    border-color: color-mix(in srgb, var(--accent-green) 45%, transparent);
  }
}

.w-btn--danger {
  background: linear-gradient(180deg,
    color-mix(in srgb, var(--negative) 92%, white),
    var(--negative));
  color: #fff;
  box-shadow: var(--shadow-sm), inset 0 1px 0 rgba(255, 255, 255, 0.2);
}

@media (hover: hover) {
  .w-btn--danger:hover:not(:disabled) {
    filter: brightness(1.05);
    transform: translateY(-1px);
  }
}

.w-btn__spinner {
  width: 16px;
  height: 16px;
  border: 2px solid currentColor;
  border-top-color: transparent;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
</style>
