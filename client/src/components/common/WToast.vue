<script setup>
import { useToastStore } from '@/stores/toast.store';
import { CheckCircle2, XCircle, Info, AlertTriangle } from '@/utils/appIcons';

const toastStore = useToastStore();

const icons = {
  success: CheckCircle2,
  error: XCircle,
  info: Info,
  warning: AlertTriangle,
};
</script>

<template>
  <Teleport to="body">
    <div class="w-toast-container">
      <TransitionGroup name="toast">
        <div
          v-for="toast in toastStore.toasts"
          :key="toast.id"
          class="w-toast"
          :class="`w-toast--${toast.type}`"
        >
          <component :is="icons[toast.type]" class="w-toast__icon" :size="18" :stroke-width="1.75" />
          <span>{{ toast.message }}</span>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<style scoped>
.w-toast-container {
  position: fixed;
  top: 1rem;
  right: 1rem;
  z-index: 9999;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  pointer-events: none;
}

@media (max-width: 767px) {
  .w-toast-container {
    left: 1rem;
    right: 1rem;
    align-items: center;
  }
}

/* Livello "elevated": il toast compare sopra qualunque cosa, quindi la
   superficie deve reggere la lettura anche su una schermata affollata. */
.w-toast {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  padding: 0.8125rem 1.125rem;
  border-radius: var(--radius-lg);
  background: var(--glass-elevated-bg);
  backdrop-filter: blur(var(--blur-lg)) saturate(var(--glass-saturate));
  -webkit-backdrop-filter: blur(var(--blur-lg)) saturate(var(--glass-saturate));
  border: 1px solid var(--glass-elevated-border);
  box-shadow: var(--shadow-lg), var(--glass-highlight);
  font-size: 0.875rem;
  font-weight: 500;
  letter-spacing: var(--tracking-tight);
  color: var(--text-primary);
  pointer-events: auto;
  max-width: min(26rem, calc(100vw - 2rem));
}

@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
  .w-toast { background: var(--glass-elevated-solid); }
}

.w-toast__icon { flex-shrink: 0; stroke: currentColor; }
.w-toast--success .w-toast__icon { color: var(--positive); }
.w-toast--error .w-toast__icon { color: var(--negative); }
.w-toast--warning .w-toast__icon { color: var(--warning); }
.w-toast--info .w-toast__icon { color: var(--text-muted); }

.w-toast--success { border-color: color-mix(in srgb, var(--positive) 40%, var(--glass-elevated-border)); }
.w-toast--error { border-color: color-mix(in srgb, var(--negative) 40%, var(--glass-elevated-border)); }
.w-toast--warning { border-color: color-mix(in srgb, var(--warning) 40%, var(--glass-elevated-border)); }
.w-toast--info { border-color: color-mix(in srgb, var(--neutral) 40%, var(--glass-elevated-border)); }

.toast-enter-active {
  transition: opacity var(--dur-base) var(--ease-out), transform var(--dur-slow) var(--ease-spring);
}

.toast-leave-active {
  transition: opacity var(--dur-fast) var(--ease-out), transform var(--dur-fast) var(--ease-out);
}

.toast-enter-from {
  opacity: 0;
  transform: translateY(-14px) scale(0.96);
}

.toast-leave-to {
  opacity: 0;
  transform: translateY(-8px) scale(0.98);
}
</style>
