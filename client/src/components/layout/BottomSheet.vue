<script setup>
defineProps({
  open: { type: Boolean, default: false },
  title: { type: String, default: '' },
  elevated: { type: Boolean, default: false },
});

defineEmits(['close']);
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
        <div class="sheet">
          <div class="sheet__handle" />
          <h3 v-if="title" class="sheet__title">{{ title }}</h3>
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
  margin-bottom: 1rem;
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
