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
/* La velatura non e' un nero pieno: sfoca la pagina invece di cancellarla,
   cosi' il pannello sopra sembra sollevato e non incollato allo schermo. */
.w-modal-overlay {
  position: fixed;
  inset: 0;
  background: var(--overlay);
  backdrop-filter: blur(8px) saturate(140%);
  -webkit-backdrop-filter: blur(8px) saturate(140%);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 1rem;
}

/* Livello "elevated": e' la superficie piu' opaca del sistema, perche' qui
   sopra si legge e si compila. */
.w-modal {
  background: var(--glass-elevated-bg);
  border: 1px solid var(--glass-elevated-border);
  border-radius: var(--radius-2xl);
  width: 100%;
  max-width: 480px;
  max-height: min(90vh, 90dvh);
  overflow-y: auto;
  overscroll-behavior: contain;
  box-shadow: var(--glass-shadow-elevated);
  backdrop-filter: blur(var(--blur-xl)) saturate(var(--glass-saturate));
  -webkit-backdrop-filter: blur(var(--blur-xl)) saturate(var(--glass-saturate));
}

@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
  .w-modal { background: var(--glass-elevated-solid); }
}

.w-modal__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 1.125rem 1.25rem;
  border-bottom: 1px solid var(--divider);
}

.w-modal__title {
  font-size: 1.0625rem;
  font-weight: 650;
  letter-spacing: var(--tracking-title);
  color: var(--text-primary);
}

.w-modal__close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 34px;
  height: 34px;
  border-radius: 50%;
  background: var(--glass-interactive-bg);
  border: 1px solid var(--glass-interactive-border);
  color: var(--text-secondary);
  cursor: pointer;
  margin-left: auto;
  transition:
    background var(--dur-fast) var(--ease-out),
    color var(--dur-fast) var(--ease-out);
}
.w-modal__close svg { stroke: currentColor; }

@media (hover: hover) {
  .w-modal__close:hover {
    color: var(--text-primary);
    background: var(--glass-interactive-bg-hover);
  }
}

.w-modal__body {
  padding: 1.25rem;
}

@media (max-width: 480px) {
  .w-modal-overlay { padding: 0.75rem; }
  .w-modal__header { padding: 1rem; }
  .w-modal__body { padding: 1rem 1rem 1.25rem; }
}

/* Comparsa: la velatura sfuma, il pannello sale di pochi pixel e si posa.
   La curva spring da' il rientro morbido dei pannelli di sistema. */
.modal-enter-active,
.modal-leave-active {
  transition: opacity var(--dur-base) var(--ease-out);
}

.modal-enter-active .w-modal {
  transition: transform var(--dur-slow) var(--ease-spring);
}

.modal-leave-active .w-modal {
  transition: transform var(--dur-fast) var(--ease-out);
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-from .w-modal,
.modal-leave-to .w-modal {
  transform: translateY(10px) scale(0.97);
}

@media (prefers-reduced-motion: reduce) {
  .modal-enter-from .w-modal,
  .modal-leave-to .w-modal { transform: none; }
}
</style>
