<script setup>
import { X } from '@/utils/appIcons';

defineProps({
  open: { type: Boolean, default: false },
  title: { type: String, default: '' },
});

defineEmits(['close']);
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="open" class="w-modal-overlay" @click.self="$emit('close')">
        <div class="w-modal">
          <div class="w-modal__header">
            <h3 v-if="title" class="w-modal__title">{{ title }}</h3>
            <button class="w-modal__close" aria-label="Chiudi" @click="$emit('close')">
              <X :size="18" :stroke-width="1.75" />
            </button>
          </div>
          <div class="w-modal__body">
            <slot />
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.w-modal-overlay {
  position: fixed;
  inset: 0;
  background: var(--overlay);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 1rem;
}

.w-modal {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-xl);
  width: 100%;
  max-width: 480px;
  max-height: 90vh;
  overflow-y: auto;
  box-shadow: var(--shadow-card);
}

.w-modal__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1.25rem 1.5rem;
  border-bottom: 1px solid var(--border);
}

.w-modal__title {
  font-size: 1.125rem;
  font-weight: 600;
  color: var(--text-primary);
}

.w-modal__close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  padding: 0.25rem;
}
.w-modal__close svg { stroke: currentColor; }

.w-modal__close:hover {
  color: var(--text-primary);
}

.w-modal__body {
  padding: 1.5rem;
}

.modal-enter-active,
.modal-leave-active {
  transition: all 0.25s ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-from .w-modal,
.modal-leave-to .w-modal {
  transform: scale(0.95);
}
</style>
