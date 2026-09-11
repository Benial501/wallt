<script setup>
import { computed } from 'vue';
import dayjs from 'dayjs';
import 'dayjs/locale/it';
import WSkeleton from '@/components/common/WSkeleton.vue';
import { AlertTriangle, AlertCircle, RefreshCw } from '@/utils/appIcons';

dayjs.locale('it');

/**
 * Traduce lo stato di una risorsa (utils/risorsa.js) in ciò che si vede.
 *
 * Il caso che questo componente esiste per risolvere è `errore-con-dati`:
 * la richiesta è fallita ma i dati precedenti sono ancora a schermo. Prima
 * quel caso non esisteva — un errore svuotava la pagina e l'utente credeva
 * di aver perso i propri dati.
 */
const props = defineProps({
  stato: { type: String, required: true },
  /** Istante dell'ultima risposta riuscita. Mai aggiornato da un fallimento. */
  lastUpdated: { type: Number, default: null },
  messaggioErrore: { type: String, default: 'Non è stato possibile caricare i dati.' },
  skeletonType: { type: String, default: 'text' },
  skeletonLines: { type: Number, default: 3 },
});

const emit = defineEmits(['riprova']);

/**
 * Orario assoluto e non relativo: "3 minuti fa" richiederebbe un timer per
 * restare vero, e invecchierebbe in silenzio appena la scheda perde il fuoco.
 */
const orarioAggiornamento = computed(() => {
  if (!props.lastUpdated) return '';
  const quando = dayjs(props.lastUpdated);
  return quando.isSame(dayjs(), 'day')
    ? `alle ${quando.format('HH:mm')}`
    : `il ${quando.format('D MMM')} alle ${quando.format('HH:mm')}`;
});
</script>

<template>
  <div class="data-state">
    <WSkeleton
      v-if="stato === 'caricamento'"
      :type="skeletonType"
      :lines="skeletonLines"
    />

    <div v-else-if="stato === 'errore'" class="data-state__errore" role="alert">
      <AlertTriangle
        class="data-state__errore-icona"
        :size="26"
        :stroke-width="1.75"
        aria-hidden="true"
      />
      <p class="data-state__errore-titolo">{{ messaggioErrore }}</p>
      <p class="data-state__errore-testo">
        Controlla la connessione e riprova. I tuoi dati non sono stati persi.
      </p>
      <button type="button" class="data-state__riprova" @click="emit('riprova')">
        <RefreshCw :size="15" :stroke-width="1.75" aria-hidden="true" />
        Riprova
      </button>
    </div>

    <slot v-else-if="stato === 'vuoto'" name="vuoto" />

    <template v-else>
      <div v-if="stato === 'errore-con-dati'" class="data-state__avviso" role="status">
        <AlertCircle
          class="data-state__avviso-icona"
          :size="16"
          :stroke-width="1.75"
          aria-hidden="true"
        />
        <div class="data-state__avviso-testo">
          <p class="data-state__avviso-titolo">Dati non aggiornati</p>
          <p class="data-state__avviso-dettaglio">
            Non è stato possibile aggiornare i dati. Stai visualizzando l'ultimo
            aggiornamento disponibile.
          </p>
          <p v-if="orarioAggiornamento" class="data-state__avviso-orario">
            Aggiornati {{ orarioAggiornamento }}
          </p>
        </div>
        <button
          type="button"
          class="data-state__riprova data-state__riprova--inline"
          @click="emit('riprova')"
        >
          <RefreshCw :size="14" :stroke-width="1.75" aria-hidden="true" />
          Riprova
        </button>
      </div>
      <slot />
    </template>
  </div>
</template>

<style scoped>
/* --- Errore senza dati precedenti: occupa il posto dei dati --------------- */
.data-state__errore {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 0.5rem;
  padding: 2rem 1.25rem;
  background: var(--glass-secondary-bg);
  border: 1px solid var(--glass-secondary-border);
  border-radius: var(--radius-lg);
}

.data-state__errore-icona { color: var(--warning); }

.data-state__errore-titolo {
  margin: 0;
  font-size: 0.9375rem;
  font-weight: 700;
  color: var(--text-primary);
}

.data-state__errore-testo {
  margin: 0;
  max-width: 28rem;
  font-size: 0.875rem;
  line-height: var(--leading-snug);
  color: var(--text-secondary);
}

/* --- Errore con dati precedenti: avviso sopra i dati, non al loro posto --- */
.data-state__avviso {
  display: flex;
  align-items: flex-start;
  gap: 0.625rem;
  margin-bottom: 0.75rem;
  padding: 0.625rem 0.75rem;
  background: var(--glass-secondary-bg);
  border: 1px solid var(--glass-secondary-border);
  border-left: 3px solid var(--warning);
  border-radius: var(--radius-md);
}

/* L'icona accompagna il testo: il significato non deve mai dipendere dal
   solo colore (regola ripresa poi dal blocco 5). */
.data-state__avviso-icona {
  flex-shrink: 0;
  margin-top: 0.0625rem;
  color: var(--warning);
}

.data-state__avviso-testo { flex: 1; min-width: 0; }

.data-state__avviso-titolo {
  margin: 0;
  font-size: 0.875rem;
  font-weight: 700;
  color: var(--text-primary);
}

.data-state__avviso-dettaglio {
  margin: 0.125rem 0 0;
  font-size: 0.875rem;
  line-height: var(--leading-snug);
  color: var(--text-secondary);
}

/* L'orario è un elemento a sé, non un inciso dentro la frase: la frase
   dell'avviso è vincolata alla lettera e deve restare intatta. */
.data-state__avviso-orario {
  margin: 0.25rem 0 0;
  font-size: 0.8125rem;
  color: var(--text-muted);
}

/* --- Riprova ------------------------------------------------------------- */
.data-state__riprova {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  /* 44px di area toccabile su mobile, come richiede il blocco 5. */
  min-height: 44px;
  padding: 0.5rem 0.875rem;
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--text-primary);
  background: var(--glass-interactive-bg);
  border: 1px solid var(--glass-interactive-border);
  border-radius: var(--radius-pill);
  cursor: pointer;
  transition: background var(--dur-fast) var(--ease-out);
}

.data-state__riprova:hover { background: var(--glass-interactive-bg-hover); }

.data-state__riprova:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
}

.data-state__riprova--inline {
  flex-shrink: 0;
  min-height: 36px;
  padding: 0.375rem 0.6875rem;
  font-size: 0.8125rem;
}

@media (max-width: 480px) {
  .data-state__avviso { flex-wrap: wrap; }
  .data-state__riprova--inline { margin-left: 1.625rem; }
}
</style>
