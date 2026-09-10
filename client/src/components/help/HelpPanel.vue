<script setup>
import { ref, watch, nextTick, onBeforeUnmount, computed } from 'vue';
import { storeToRefs } from 'pinia';
import { useRouter } from 'vue-router';
import { useHelpStore } from '@/stores/help.store';
import { getHelpTopic } from '@/content/helpTopics';
import { X } from '@/utils/appIcons';

/**
 * Pannello di aiuto contestuale. Va montato una sola volta (AppLayout).
 *
 * WModal e BottomSheet non implementano focus trap, Escape né semantica
 * dialog completa: qui l'accessibilità è implementata a mano
 * (role dialog, aria-modal, focus iniziale, Tab confinato, Escape,
 * ritorno del focus, blocco dello scroll di fondo).
 */

const helpStore = useHelpStore();
const { panelOpen, activeTopic } = storeToRefs(helpStore);
const router = useRouter();

const panelRef = ref(null);
const closeRef = ref(null);
const titleId = 'help-panel-title';

let lastFocused = null;
let savedBodyOverflow = null;

const correlati = computed(() => (
  (activeTopic.value?.related || [])
    .map((id) => getHelpTopic(id))
    .filter(Boolean)
));

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

const focusableElements = () => {
  if (!panelRef.value) return [];
  return Array.from(panelRef.value.querySelectorAll(FOCUSABLE_SELECTOR))
    .filter((el) => el.getClientRects().length > 0);
};

const lockScroll = () => {
  if (savedBodyOverflow !== null) return;
  savedBodyOverflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';
};

const unlockScroll = () => {
  if (savedBodyOverflow === null) return;
  document.body.style.overflow = savedBodyOverflow;
  savedBodyOverflow = null;
};

const chiudi = () => helpStore.closePanel();

const onKeydown = (event) => {
  if (event.key === 'Escape') {
    event.stopPropagation();
    chiudi();
    return;
  }

  if (event.key !== 'Tab') return;

  const items = focusableElements();
  if (!items.length) {
    event.preventDefault();
    return;
  }

  const first = items[0];
  const last = items[items.length - 1];
  const active = document.activeElement;

  if (event.shiftKey && (active === first || !panelRef.value?.contains(active))) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && (active === last || !panelRef.value?.contains(active))) {
    event.preventDefault();
    first.focus();
  }
};

const vaiA = async (path) => {
  chiudi();
  await router.push(path);
};

watch(panelOpen, async (open) => {
  if (open) {
    lastFocused = document.activeElement;
    lockScroll();
    await nextTick();
    closeRef.value?.focus();
  } else {
    unlockScroll();
    if (lastFocused && typeof lastFocused.focus === 'function' && document.contains(lastFocused)) {
      lastFocused.focus();
    }
    lastFocused = null;
  }
});

// Cambio argomento a pannello aperto (link "Vedi anche"): riporta il focus
// e lo scroll all'inizio del nuovo contenuto.
watch(() => helpStore.activeTopicId, async (id, prev) => {
  if (!panelOpen.value || !id || id === prev) return;
  await nextTick();
  panelRef.value?.querySelector('.help-panel__body')?.scrollTo?.({ top: 0 });
  closeRef.value?.focus();
});

onBeforeUnmount(unlockScroll);
</script>

<template>
  <Teleport to="body">
    <Transition name="help-panel">
      <div
        v-if="panelOpen && activeTopic"
        class="help-overlay"
        @click.self="chiudi"
      >
        <div
          ref="panelRef"
          class="help-panel"
          role="dialog"
          aria-modal="true"
          :aria-labelledby="titleId"
          @keydown="onKeydown"
        >
          <div class="help-panel__header">
            <div class="help-panel__heading">
              <p class="help-panel__eyebrow">Aiuto</p>
              <h2 :id="titleId" class="help-panel__title">{{ activeTopic.title }}</h2>
            </div>
            <button
              ref="closeRef"
              type="button"
              class="help-panel__close"
              aria-label="Chiudi l'aiuto"
              @click="chiudi"
            >
              <X :size="18" :stroke-width="1.75" aria-hidden="true" />
            </button>
          </div>

          <div class="help-panel__body">
            <p v-if="activeTopic.summary" class="help-panel__summary">{{ activeTopic.summary }}</p>

            <p
              v-for="(paragrafo, i) in activeTopic.paragraphs || []"
              :key="`p-${i}`"
              class="help-panel__text"
            >
              {{ paragrafo }}
            </p>

            <ul v-if="activeTopic.bullets?.length" class="help-panel__list">
              <li v-for="(bullet, i) in activeTopic.bullets" :key="`b-${i}`">{{ bullet }}</li>
            </ul>

            <div v-if="correlati.length" class="help-panel__related">
              <p class="help-panel__related-title">Vedi anche</p>
              <button
                v-for="rel in correlati"
                :key="rel.id"
                type="button"
                class="help-panel__related-btn"
                @click="helpStore.openTopic(rel.id)"
              >
                {{ rel.title }}
              </button>
            </div>
          </div>

          <div class="help-panel__footer">
            <button
              v-if="activeTopic.link"
              type="button"
              class="help-panel__action help-panel__action--primary"
              @click="vaiA(activeTopic.link.to)"
            >
              {{ activeTopic.link.label }}
            </button>
            <button
              type="button"
              class="help-panel__action"
              @click="vaiA('/aiuto')"
            >
              Apri la guida completa
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.help-overlay {
  position: fixed;
  inset: 0;
  z-index: 1200;
  background: var(--overlay);
  backdrop-filter: blur(8px) saturate(140%);
  -webkit-backdrop-filter: blur(8px) saturate(140%);
  display: flex;
  align-items: flex-end;
  justify-content: center;
}

.help-panel {
  display: flex;
  flex-direction: column;
  width: 100%;
  max-height: min(88vh, 88dvh);
  background: var(--glass-elevated-bg);
  backdrop-filter: blur(var(--blur-xl)) saturate(var(--glass-saturate));
  -webkit-backdrop-filter: blur(var(--blur-xl)) saturate(var(--glass-saturate));
  border: 1px solid var(--glass-elevated-border);
  border-bottom: none;
  border-radius: var(--radius-2xl) var(--radius-2xl) 0 0;
  box-shadow: var(--glass-shadow-elevated);
}

@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
  .help-panel { background: var(--glass-elevated-solid); }
}

.help-panel__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 1.25rem 1.25rem 0.875rem;
  border-bottom: 1px solid var(--divider);
}

.help-panel__eyebrow {
  font-size: 0.6875rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--accent-green);
  margin-bottom: 0.25rem;
}

.help-panel__title {
  font-size: 1.0625rem;
  font-weight: 650;
  letter-spacing: var(--tracking-title);
  color: var(--text-primary);
  line-height: var(--leading-snug);
}

.help-panel__close {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  border: 1px solid var(--glass-interactive-border);
  background: var(--glass-interactive-bg);
  color: var(--text-secondary);
  cursor: pointer;
  transition: background var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out);
}
.help-panel__close svg { stroke: currentColor; }
.help-panel__close:hover { color: var(--text-primary); background: var(--glass-interactive-bg-hover); }
.help-panel__close:active { transform: scale(0.92); }
.help-panel__close:focus-visible { outline: 2px solid var(--border-focus); outline-offset: 2px; }

.help-panel__body {
  flex: 1;
  overflow-y: auto;
  padding: 1rem 1.25rem 1.25rem;
  -webkit-overflow-scrolling: touch;
}

.help-panel__summary {
  font-size: 0.9375rem;
  font-weight: 600;
  color: var(--text-primary);
  line-height: 1.5;
  margin-bottom: 0.875rem;
}

.help-panel__text {
  font-size: 0.875rem;
  line-height: 1.6;
  color: var(--text-secondary);
  margin-bottom: 0.75rem;
}

.help-panel__list {
  margin: 0.25rem 0 0.75rem;
  padding-left: 1.125rem;
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}

.help-panel__list li {
  font-size: 0.875rem;
  line-height: 1.55;
  color: var(--text-secondary);
  list-style: disc;
}

.help-panel__related {
  margin-top: 0.5rem;
  padding-top: 0.875rem;
  border-top: 1px solid var(--divider);
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
}

.help-panel__related-title {
  width: 100%;
  font-size: 0.75rem;
  font-weight: 700;
  color: var(--text-muted);
}

.help-panel__related-btn {
  padding: 0.4375rem 0.875rem;
  border-radius: var(--radius-pill);
  border: 1px solid var(--glass-interactive-border);
  background: var(--glass-interactive-bg);
  color: var(--text-secondary);
  font-family: inherit;
  font-size: 0.75rem;
  font-weight: 600;
  cursor: pointer;
  min-height: 34px;
  transition: background var(--dur-fast) var(--ease-out), border-color var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out);
}
@media (hover: hover) {
  .help-panel__related-btn:hover {
    color: var(--accent-green);
    background: var(--glass-interactive-bg-hover);
    border-color: color-mix(in srgb, var(--accent-green) 35%, transparent);
  }
}
.help-panel__related-btn:focus-visible { outline: 2px solid var(--border-focus); outline-offset: 2px; }

.help-panel__footer {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  padding: 0.875rem 1.25rem calc(1.25rem + env(safe-area-inset-bottom, 0px));
  border-top: 1px solid var(--divider);
}

.help-panel__action {
  flex: 1 1 auto;
  min-height: 44px;
  padding: 0.75rem 1rem;
  border-radius: var(--radius-md);
  border: 1px solid var(--glass-interactive-border);
  background: var(--glass-interactive-bg);
  box-shadow: var(--glass-highlight);
  color: var(--text-primary);
  font-family: inherit;
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
  transition: background var(--dur-fast) var(--ease-out), border-color var(--dur-fast) var(--ease-out), transform var(--dur-fast) var(--ease-out);
}
@media (hover: hover) {
  .help-panel__action:hover { background: var(--glass-interactive-bg-hover); border-color: color-mix(in srgb, var(--accent-green) 40%, transparent); }
}
.help-panel__action:active { transform: scale(0.98); }
.help-panel__action:focus-visible { outline: 2px solid var(--border-focus); outline-offset: 2px; }

.help-panel__action--primary {
  background: linear-gradient(180deg,
    color-mix(in srgb, var(--accent-green) 92%, white),
    var(--accent-green));
  border-color: transparent;
  color: var(--accent-on);
  box-shadow: var(--shadow-sm), inset 0 1px 0 rgba(255, 255, 255, 0.22);
}
@media (hover: hover) {
  .help-panel__action--primary:hover { background: var(--accent-green); filter: brightness(1.04); }
}

@media (min-width: 768px) {
  .help-overlay {
    align-items: center;
    padding: 1.5rem;
  }

  .help-panel {
    max-width: 520px;
    max-height: min(80vh, 80dvh);
    border-radius: var(--radius-2xl);
    border-bottom: 1px solid var(--glass-elevated-border);
  }

  .help-panel__footer {
    padding-bottom: 1.25rem;
  }
}

.help-panel-enter-active,
.help-panel-leave-active { transition: opacity var(--dur-base) var(--ease-out); }
.help-panel-enter-active .help-panel { transition: transform var(--dur-slow) var(--ease-spring); }
.help-panel-leave-active .help-panel { transition: transform var(--dur-fast) var(--ease-out); }
.help-panel-enter-from,
.help-panel-leave-to { opacity: 0; }
.help-panel-enter-from .help-panel,
.help-panel-leave-to .help-panel { transform: translateY(100%); }

@media (min-width: 768px) {
  .help-panel-enter-from .help-panel,
  .help-panel-leave-to .help-panel { transform: translateY(12px) scale(0.98); }
}

@media (prefers-reduced-motion: reduce) {
  .help-panel-enter-active,
  .help-panel-leave-active,
  .help-panel-enter-active .help-panel,
  .help-panel-leave-active .help-panel { transition: none; }
  .help-panel-enter-from .help-panel,
  .help-panel-leave-to .help-panel { transform: none; }
}
</style>
