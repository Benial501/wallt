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
  border: none;
  border-radius: var(--radius-md);
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
  font-family: inherit;
}

.w-btn:active:not(:disabled) {
  transform: scale(0.97);
  transition: transform 100ms ease;
}

.w-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.w-btn--sm { padding: 0.5rem 0.875rem; font-size: 0.8125rem; }
.w-btn--md { padding: 0.75rem 1.25rem; font-size: 0.875rem; }
.w-btn--lg { padding: 0.875rem 1.5rem; font-size: 0.9375rem; width: 100%; }

.w-btn--primary {
  background: linear-gradient(135deg, var(--accent-green), var(--accent-hover));
  color: #0A0A0F;
}

.w-btn--primary:hover:not(:disabled) {
  box-shadow: var(--shadow-glow);
  transform: translateY(-1px);
}

.w-btn--secondary {
  background: var(--bg-input);
  border: 1px solid var(--border);
  color: var(--text-primary);
}

.w-btn--secondary:hover:not(:disabled) {
  border-color: var(--accent-green);
}

.w-btn--danger {
  background: var(--negative);
  color: #fff;
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
