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
  z-index: 1000;
  display: flex;
  align-items: flex-end;
}

.sheet-overlay--elevated {
  z-index: 1100;
}

.sheet {
  width: 100%;
  background: var(--bg-card);
  border-radius: 24px 24px 0 0;
  padding: 0.75rem 1.5rem calc(2rem + env(safe-area-inset-bottom, 0px));
  max-height: 85vh;
  overflow-y: auto;
  border-top: 1px solid var(--border);
}

.sheet__handle {
  width: 40px;
  height: 4px;
  background: var(--border);
  border-radius: 2px;
  margin: 0 auto 1rem;
}

.sheet__title {
  font-size: 1.125rem;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 1rem;
}

.sheet-enter-active,
.sheet-leave-active {
  transition: all 0.3s ease;
}

.sheet-enter-active .sheet,
.sheet-leave-active .sheet {
  transition: transform 0.3s ease;
}

.sheet-enter-from .sheet,
.sheet-leave-to .sheet {
  transform: translateY(100%);
}

.sheet-enter-from,
.sheet-leave-to {
  opacity: 0;
}
</style>
