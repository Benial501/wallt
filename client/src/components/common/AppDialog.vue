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
}
.transaction-dialog[open] { display: grid; place-items: center; }
.transaction-dialog::backdrop { background: rgb(10 17 26 / 45%); backdrop-filter: blur(5px); -webkit-backdrop-filter: blur(5px); }
.transaction-dialog__panel {
  width: 100%; max-width: 520px; max-height: 100%; min-height: 0;
  display: flex; flex-direction: column; overflow: hidden;
  background: var(--bg-card);
  background: linear-gradient(145deg, color-mix(in srgb, var(--bg-card) 94%, white), color-mix(in srgb, var(--bg-card) 94%, transparent));
  backdrop-filter: blur(24px); -webkit-backdrop-filter: blur(24px);
  border: 1px solid color-mix(in srgb, var(--border) 75%, white 25%);
  border-radius: 26px; box-shadow: 0 24px 80px rgb(0 0 0 / 20%);
}
.transaction-dialog__header { flex-shrink: 0; display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 16px 20px; border-bottom: 1px solid var(--border); }
.transaction-dialog__header h2 { font-size: 1.0625rem; font-weight: 650; letter-spacing: -.02em; }
.transaction-dialog__header button { display: grid; place-items: center; width: 44px; height: 44px; border-radius: 50%; border: 1px solid var(--border); background: var(--bg-input); color: var(--text-secondary); cursor: pointer; }
.transaction-dialog__body { padding: 20px; overflow-y: auto; min-height: 0; overscroll-behavior: contain; -webkit-overflow-scrolling: touch; }
.transaction-dialog__header button:focus-visible { outline: 2px solid var(--accent-green); outline-offset: 3px; }
.transaction-dialog-enter-active, .transaction-dialog-leave-active { transition: opacity 180ms ease; }
.transaction-dialog-enter-active .transaction-dialog__panel, .transaction-dialog-leave-active .transaction-dialog__panel { transition: transform 180ms ease; }
.transaction-dialog-enter-from, .transaction-dialog-leave-to { opacity: 0; }
.transaction-dialog-enter-from .transaction-dialog__panel, .transaction-dialog-leave-to .transaction-dialog__panel { transform: translateY(8px) scale(.99); }
@media (max-width: 767px) {
  .transaction-dialog { padding: max(12px, env(safe-area-inset-top)) 0 0; }
  .transaction-dialog[open] { align-items: end; }
  .transaction-dialog__panel { max-width: none; border-radius: 26px 26px 0 0; }
  .transaction-dialog__body { padding: 16px max(20px, env(safe-area-inset-right)) max(24px, env(safe-area-inset-bottom)) max(20px, env(safe-area-inset-left)); }
}
@media (prefers-reduced-motion: reduce) {
  .transaction-dialog, .transaction-dialog__panel { transition: none !important; }
}
</style>
