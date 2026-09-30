<script setup>
import { useToastStore } from '@/stores/toast.store';
import { CheckCircle2, XCircle, Info, AlertTriangle, X } from '@/utils/appIcons';

const toastStore = useToastStore();

const icons = {
  success: CheckCircle2,
  error: XCircle,
  info: Info,
  warning: AlertTriangle,
};

/**
 * Come lo legge uno screen reader.
 *
 * `assertive` interrompe la lettura in corso: giusto per un errore, che spesso
 * contiene l'istruzione per rimediare, sbagliato per una conferma, che puo'
 * attendere la pausa successiva. Per la stessa ragione un errore e' `alert`
 * (annuncio immediato) mentre il resto e' `status`.
 */
const urgenza = (tipo) => (tipo === 'error' || tipo === 'warning' ? 'assertive' : 'polite');
const ruolo = (tipo) => (tipo === 'error' || tipo === 'warning' ? 'alert' : 'status');

const etichetta = {
  success: 'Operazione riuscita',
  error: 'Errore',
  warning: 'Attenzione',
  info: 'Informazione',
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
          :role="ruolo(toast.type)"
          :aria-live="urgenza(toast.type)"
          aria-atomic="true"
          @mouseenter="toastStore.trattieni(toast.id)"
          @mouseleave="toastStore.riprendi(toast.id)"
          @focusin="toastStore.trattieni(toast.id)"
          @focusout="toastStore.riprendi(toast.id)"
        >
          <component :is="icons[toast.type]" class="w-toast__icon" :size="18" :stroke-width="1.75" aria-hidden="true" />
          <!-- L'etichetta dice a voce cio' che l'icona e il colore dicono a
               vista: il significato non deve dipendere dal solo colore. -->
          <span class="w-toast__etichetta">{{ etichetta[toast.type] }}: </span>
          <span class="w-toast__testo">{{ toast.message }}</span>
          <button
            type="button"
            class="w-toast__chiudi"
            aria-label="Chiudi la notifica"
            @click="toastStore.rimuovi(toast.id)"
          >
            <X :size="15" :stroke-width="2" aria-hidden="true" />
          </button>
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
  /* Il contenitore lascia passare i click, i singoli toast no: senza questa
     coppia il pulsante di chiusura non sarebbe cliccabile. */
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

/* Visibile solo agli screen reader: a schermo il tipo lo dicono icona e
   bordo, ripeterlo per iscritto sarebbe rumore. */
.w-toast__etichetta {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  clip-path: inset(50%);
  white-space: nowrap;
  border: 0;
}

.w-toast__testo { flex: 1; min-width: 0; }

.w-toast__chiudi {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  /* 28px visivi dentro un'area toccabile piena: il bersaglio reale e' esteso
     dal padding negativo del margin, non dalla sola icona. */
  width: 28px;
  height: 28px;
  margin: -4px -6px -4px 0;
  padding: 0;
  background: none;
  border: none;
  border-radius: var(--radius-sm);
  color: var(--text-muted);
  cursor: pointer;
  transition: color var(--dur-fast) var(--ease-out), background var(--dur-fast) var(--ease-out);
}

/* Il bersaglio del dito e' 44px anche se il pulsante ne mostra 28: su un
   toast largo 288px (schermo da 320) non c'e' spazio per un pulsante grande,
   ma non c'e' motivo perche' l'area sensibile sia piccola quanto l'icona. */
.w-toast__chiudi::after {
  content: '';
  position: absolute;
  width: 44px;
  height: 44px;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
}

.w-toast__chiudi { position: relative; }

.w-toast__chiudi:hover {
  color: var(--text-primary);
  background: var(--glass-interactive-bg-hover);
}

.w-toast__chiudi:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring-tight);
  color: var(--text-primary);
}
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

@media (prefers-reduced-motion: reduce) {
  .toast-enter-active,
  .toast-leave-active { transition: opacity var(--dur-fast) linear; }
  .toast-enter-from,
  .toast-leave-to { transform: none; }
}
</style>
