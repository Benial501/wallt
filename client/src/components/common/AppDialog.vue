<script setup>
import { ref, watch, nextTick, onBeforeUnmount } from 'vue';
import { X } from 'lucide-vue-next';
import { lockDialogScroll } from './dialogScrollLock';

const props = defineProps({ open: Boolean, title: { type: String, default: '' } });
const emit = defineEmits(['close']);
const dialog = ref(null);
// Il contenuto resta montato finche' l'animazione di uscita non e' finita,
// altrimenti il dialog si svuoterebbe a meta' chiusura. Deve essere un ref:
// il template ci si basa e una variabile normale non farebbe ri-renderizzare.
const contentMounted = ref(false);
let releaseScroll;
let previousFocus;

function release() {
  dialog.value?.close();
  releaseScroll?.();
  releaseScroll = undefined;
  contentMounted.value = false;
  if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
  previousFocus = undefined;
}

watch(() => props.open, async (open) => {
  if (!open) return;
  await nextTick();
  if (!props.open || !dialog.value) return;
  if (!releaseScroll) {
    previousFocus = document.activeElement;
    releaseScroll = lockDialogScroll();
  }
  contentMounted.value = true;
  dialog.value.showModal();
  dialog.value.focus({ preventScroll: true });
}, { immediate: true });

function afterLeave() {
  if (!props.open) release();
}
onBeforeUnmount(release);
</script>

<template>
  <Teleport to="body">
    <Transition name="transaction-dialog" @after-leave="afterLeave">
      <dialog
        v-show="open" ref="dialog" class="transaction-dialog"
        :aria-label="title" tabindex="-1"
        @cancel.prevent="emit('close')"
        @click.self="emit('close')"
      >
        <section class="transaction-dialog__panel">
          <header class="transaction-dialog__header">
            <h2>{{ title }}</h2>
            <button type="button" aria-label="Chiudi" @click="emit('close')"><X :size="20" :stroke-width="1.75" /></button>
          </header>
          <div class="transaction-dialog__body"><slot v-if="open || contentMounted" /></div>
        </section>
      </dialog>
    </Transition>
  </Teleport>
</template>

<style scoped>
.transaction-dialog {
  position: fixed; inset: 0; margin: 0; padding: max(16px, env(safe-area-inset-top)) max(16px, env(safe-area-inset-right)) max(16px, env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left));
  width: 100%; max-width: none; height: 100%; height: 100dvh; max-height: none;
  border: 0; background: transparent; color: var(--text-primary);
  overflow: hidden; overscroll-behavior: none;
  /* La cornice non scorre: qualunque trascinamento su di essa non deve
     muovere nulla. Il corpo interno riabilita il solo pan verticale. */
  touch-action: none;
}
.transaction-dialog[open] { display: grid; place-items: center; }
/* Velatura sfocata, non un nero pieno: la pagina sotto resta percepibile e il
   pannello sembra sollevato. */
.transaction-dialog::backdrop {
  background: var(--overlay);
  backdrop-filter: blur(8px) saturate(140%);
  -webkit-backdrop-filter: blur(8px) saturate(140%);
}
/* Livello "elevated" del sistema del vetro: qui sopra si compila un form,
   quindi la superficie e' la piu' opaca della scala. */
.transaction-dialog__panel {
  width: 100%; max-width: 520px; max-height: 100%; min-height: 0;
  display: flex; flex-direction: column; overflow: hidden;
  background: var(--glass-elevated-bg);
  backdrop-filter: blur(var(--blur-xl)) saturate(var(--glass-saturate));
  -webkit-backdrop-filter: blur(var(--blur-xl)) saturate(var(--glass-saturate));
  border: 1px solid var(--glass-elevated-border);
  border-radius: var(--radius-2xl);
  box-shadow: var(--glass-shadow-elevated);
}
@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
  .transaction-dialog__panel { background: var(--glass-elevated-solid); }
}
.transaction-dialog__header { flex-shrink: 0; display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 16px 20px; border-bottom: 1px solid var(--divider); }
.transaction-dialog__header h2 { font-size: 1.0625rem; font-weight: 650; letter-spacing: var(--tracking-title); }
.transaction-dialog__header button {
  display: grid; place-items: center; width: 44px; height: 44px; border-radius: 50%;
  border: 1px solid var(--glass-interactive-border); background: var(--glass-interactive-bg);
  color: var(--text-secondary); cursor: pointer;
  transition: background var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out);
}
@media (hover: hover) {
  .transaction-dialog__header button:hover { background: var(--glass-interactive-bg-hover); color: var(--text-primary); }
}
.transaction-dialog__header button:active { transform: scale(0.94); }
.transaction-dialog__body { padding: 20px; overflow-y: auto; overflow-x: hidden; min-height: 0; overscroll-behavior: contain; touch-action: pan-y; -webkit-overflow-scrolling: touch; }
.transaction-dialog__header button:focus-visible { outline: 2px solid var(--accent-green); outline-offset: 3px; }
.transaction-dialog-enter-active, .transaction-dialog-leave-active { transition: opacity var(--dur-base) var(--ease-out); }
.transaction-dialog-enter-active .transaction-dialog__panel { transition: transform var(--dur-slow) var(--ease-spring); }
.transaction-dialog-leave-active .transaction-dialog__panel { transition: transform var(--dur-fast) var(--ease-out); }
.transaction-dialog-enter-from, .transaction-dialog-leave-to { opacity: 0; }
.transaction-dialog-enter-from .transaction-dialog__panel, .transaction-dialog-leave-to .transaction-dialog__panel { transform: translateY(12px) scale(.98); }
@media (max-width: 767px) {
  .transaction-dialog { padding: max(12px, env(safe-area-inset-top)) 0 0; }
  .transaction-dialog[open] { align-items: end; }
  .transaction-dialog__panel { max-width: none; border-radius: var(--radius-2xl) var(--radius-2xl) 0 0; }
  .transaction-dialog__body { padding: 16px max(20px, env(safe-area-inset-right)) max(24px, env(safe-area-inset-bottom)) max(20px, env(safe-area-inset-left)); }
  /* Da sotto, come un foglio: e' il gesto che il layout a bottom sheet
     suggerisce, e sostituisce il semplice sollevamento del desktop. */
  .transaction-dialog-enter-from .transaction-dialog__panel, .transaction-dialog-leave-to .transaction-dialog__panel { transform: translateY(100%) scale(1); }
}
@media (prefers-reduced-motion: reduce) {
  .transaction-dialog, .transaction-dialog__panel { transition: none !important; }
  .transaction-dialog-enter-from .transaction-dialog__panel, .transaction-dialog-leave-to .transaction-dialog__panel { transform: none; }
}
</style>
