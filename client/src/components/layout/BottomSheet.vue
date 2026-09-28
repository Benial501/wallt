<script setup>
import { nextTick, ref, useId, watch } from 'vue';
import { X } from '@/utils/appIcons';

const props = defineProps({
  open: { type: Boolean, default: false },
  title: { type: String, default: '' },
  elevated: { type: Boolean, default: false },
});

const emit = defineEmits(['close']);
const titleId = useId();
const sheetRef = ref(null);
let elementoApertura = null;

watch(() => props.open, async (open, previousOpen) => {
  if (typeof document === 'undefined') return;

  if (open) {
    elementoApertura = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    await nextTick();
    sheetRef.value?.focus();
    return;
  }

  if (previousOpen) {
    const elemento = elementoApertura;
    elementoApertura = null;
    await nextTick();
    if (elemento?.isConnected) elemento.focus();
  }
});

const gestisciTastiera = (event) => {
  if (event.key === 'Escape') {
    event.preventDefault();
    emit('close');
    return;
  }

  if (event.key !== 'Tab') return;

  const elementi = [...(sheetRef.value?.querySelectorAll(
    'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
  ) || [])].filter((elemento) => elemento.getClientRects().length > 0);
  const primo = elementi[0];
  const ultimo = elementi[elementi.length - 1];

  if (!primo || !ultimo) {
    event.preventDefault();
    sheetRef.value?.focus();
  } else if (!sheetRef.value.contains(document.activeElement)) {
    event.preventDefault();
    (event.shiftKey ? ultimo : primo).focus();
  } else if (event.shiftKey && document.activeElement === primo) {
    event.preventDefault();
    ultimo.focus();
  } else if (!event.shiftKey && document.activeElement === ultimo) {
    event.preventDefault();
    primo.focus();
  }
};
</script>

<template>
  <Teleport to="body">
    <Transition name="sheet">
      <div
        v-if="open"
        class="sheet-overlay"
        :class="{ 'sheet-overlay--elevated': elevated }"
        @click.self="$emit('close')"
      >
        <div
          ref="sheetRef"
          class="sheet"
          role="dialog"
          aria-modal="true"
          :aria-labelledby="title ? titleId : undefined"
          :aria-label="title ? undefined : 'Pannello'"
          tabindex="-1"
          @keydown="gestisciTastiera"
        >
          <div class="sheet__handle" />
          <div v-if="title" class="sheet__header">
            <h3 :id="titleId" class="sheet__title">{{ title }}</h3>
            <button type="button" class="sheet__close" aria-label="Chiudi" @click="emit('close')">
              <X :size="20" :stroke-width="1.75" aria-hidden="true" />
            </button>
          </div>
          <slot />
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.sheet-overlay {
  position: fixed;
  inset: 0;
  background: var(--overlay);
  backdrop-filter: blur(8px) saturate(140%);
  -webkit-backdrop-filter: blur(8px) saturate(140%);
  z-index: 1000;
  display: flex;
  align-items: flex-end;
  justify-content: center;
}

.sheet-overlay--elevated {
  z-index: 1100;
}

/* Livello "elevated": foglio che sale dal basso, come i pannelli di sistema. */
.sheet {
  width: 100%;
  background: var(--glass-elevated-bg);
  backdrop-filter: blur(var(--blur-xl)) saturate(var(--glass-saturate));
  -webkit-backdrop-filter: blur(var(--blur-xl)) saturate(var(--glass-saturate));
  border-radius: var(--radius-2xl) var(--radius-2xl) 0 0;
  padding: 0.625rem 1.25rem calc(1.75rem + env(safe-area-inset-bottom, 0px));
  max-height: min(85vh, 85dvh);
  overflow-y: auto;
  overscroll-behavior: contain;
  border: 1px solid var(--glass-elevated-border);
  border-bottom: none;
  box-shadow: var(--glass-shadow-elevated);
}

@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
  .sheet { background: var(--glass-elevated-solid); }
}

.sheet__handle {
  width: 36px;
  height: 5px;
  background: var(--border-strong);
  border-radius: var(--radius-pill);
  margin: 0 auto 0.875rem;
}

.sheet__title {
  font-size: 1.0625rem;
  font-weight: 650;
  letter-spacing: var(--tracking-title);
  color: var(--text-primary);
  margin: 0;
}

.sheet__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  margin-bottom: 0.75rem;
}

.sheet__close {
  display: grid;
  place-items: center;
  flex: 0 0 auto;
  width: 44px;
  height: 44px;
  border: 1px solid var(--glass-interactive-border);
  border-radius: 50%;
  background: var(--glass-interactive-bg);
  color: var(--text-secondary);
  cursor: pointer;
}

.sheet__close:hover {
  color: var(--text-primary);
  background: var(--glass-interactive-bg-hover);
}

.sheet__close:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
}

.sheet-enter-active,
.sheet-leave-active {
  transition: opacity var(--dur-base) var(--ease-out);
}

.sheet-enter-active .sheet {
  transition: transform var(--dur-slow) var(--ease-spring);
}

.sheet-leave-active .sheet {
  transition: transform var(--dur-base) var(--ease-out);
}

.sheet-enter-from .sheet,
.sheet-leave-to .sheet {
  transform: translateY(100%);
}

.sheet-enter-from,
.sheet-leave-to {
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .sheet-enter-from .sheet,
  .sheet-leave-to .sheet { transform: none; }
}
</style>
