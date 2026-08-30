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

.w-toast {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1.25rem;
  border-radius: var(--radius-md);
  background: var(--bg-card);
  border: 1px solid var(--border);
  box-shadow: var(--shadow-card);
  font-size: 0.875rem;
  color: var(--text-primary);
  pointer-events: auto;
}

.w-toast__icon { flex-shrink: 0; stroke: currentColor; }
.w-toast--success .w-toast__icon { color: var(--positive); }
.w-toast--error .w-toast__icon { color: var(--negative); }
.w-toast--warning .w-toast__icon { color: var(--warning); }
.w-toast--info .w-toast__icon { color: var(--text-muted); }

.w-toast--success { border-color: var(--positive); }
.w-toast--error { border-color: var(--negative); }
.w-toast--warning { border-color: var(--warning); }
.w-toast--info { border-color: var(--neutral); }

.toast-enter-active,
.toast-leave-active {
  transition: all 0.3s ease;
}

.toast-enter-from {
  opacity: 0;
  transform: translateY(-12px);
}

.toast-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
</style>
