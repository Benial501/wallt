<script setup>
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import DataState from '@/components/common/DataState.vue';
import CategoryIcon from '@/components/common/CategoryIcon.vue';
import { useValuta } from '@/composables/useValuta';
import { ordinaProssimeSpese } from '@/utils/ricorrenti';
import dayjs from 'dayjs';

/**
 * Le spese che stanno per uscire dal conto. Non ricalcola niente: ordina
 * con `ordinaProssimeSpese` (stessa regola verificata dai test) e mostra le
 * prime quattro. Le programmate vengono prima perche sono eventi singoli e
 * datati: chi le ha appuntate lo ha fatto per non dimenticarle.
 */
const props = defineProps({
  movimenti: { type: Array, default: () => [] },
  stato: { type: String, default: 'pronto' },
  lastUpdated: { type: Number, default: null },
});

const emit = defineEmits(['riprova']);
const router = useRouter();
const { formatValuta } = useValuta();

const MAX_VOCI = 4;

// Unica fonte per la lista mostrata: `spese` e `totaleSpese` derivano da qui,
// invece di richiamare due volte `ordinaProssimeSpese` (filtro+sort ripetuti
// a ogni render per lo stesso risultato).
const prossimeSpese = computed(() => ordinaProssimeSpese(props.movimenti));
const spese = computed(() => prossimeSpese.value.slice(0, MAX_VOCI));
const totaleSpese = computed(() => prossimeSpese.value.length);

/**
 * Lo stato passato a `DataState` non può essere quello grezzo della risorsa:
 * `risorsaRicorrenti.stato` dice "vuoto" solo se l'array delle ricorrenze è
 * vuoto, ma la card mostra `prossimeSpese`, un sottoinsieme filtrato. Un
 * utente con solo entrate ricorrenti (o solo ricorrenze sospese) avrebbe la
 * risorsa "pronto" e la card vuota senza lo slot `#vuoto`.
 *
 * La correzione vale solo quando la risorsa è davvero "pronto": un errore di
 * rete deve restare un errore (con il suo "riprova"), mai travestirsi da
 * vuoto solo perché la lista filtrata coincide.
 */
const statoLista = computed(() => (
  props.stato === 'pronto' && prossimeSpese.value.length === 0 ? 'vuoto' : props.stato
));

/** "Oggi" / "Domani" / "fra 5 giorni" entro la settimana, poi la data. */
const quando = (spesa) => {
  const data = spesa.presentazione.prossimaEsecuzione;
  if (!data) return '';
  const giorni = dayjs(data).startOf('day').diff(dayjs().startOf('day'), 'day');
  if (giorni <= 0) return 'Oggi';
  if (giorni === 1) return 'Domani';
  if (giorni <= 7) return `fra ${giorni} giorni`;
  return dayjs(data).format('D MMM');
};
</script>

<template>
  <section class="prossime-spese">
    <div class="prossime-spese__header">
      <h2 class="prossime-spese__title">Prossime spese</h2>
      <button type="button" class="prossime-spese__link" @click="router.push('/ricorrenti')">
        Vedi tutte
      </button>
    </div>

    <DataState
      :stato="statoLista"
      :last-updated="lastUpdated"
      messaggio-errore="Non e stato possibile caricare le prossime spese."
      skeleton-type="text"
      :skeleton-lines="3"
      @riprova="emit('riprova')"
    >
      <template #vuoto>
        <div class="prossime-spese__empty">
          <p class="prossime-spese__empty-title">Nessuna spesa in arrivo</p>
          <p class="prossime-spese__empty-hint">
            Registra una spesa ricorrente o programma una spesa occasionale: comparira
            qui e verra scalata dal saldo effettivo prima ancora di essere addebitata.
          </p>
          <button type="button" class="prossime-spese__manual-link" @click="router.push('/ricorrenti')">
            Vai alle ricorrenti &rarr;
          </button>
        </div>
      </template>

      <div class="prossime-spese__list">
        <div v-for="spesa in spese" :key="spesa.id" class="prossime-spese__item">
          <div class="prossime-spese__avatar">
            <CategoryIcon :movimento="spesa" :size="18" />
          </div>
          <div class="prossime-spese__info">
            <p class="prossime-spese__name">{{ spesa.presentazione.descrizione }}</p>
            <p class="prossime-spese__meta">
              {{ spesa.presentazione.frequenzaLabel }} &middot; {{ spesa.presentazione.contoLabel }}
            </p>
          </div>
          <div class="prossime-spese__amount-wrap">
            <p class="prossime-spese__amount tabular-nums">-{{ formatValuta(spesa.importo) }}</p>
            <p class="prossime-spese__date">{{ quando(spesa) }}</p>
          </div>
        </div>
        <p v-if="totaleSpese > MAX_VOCI" class="prossime-spese__altre">
          e altre {{ totaleSpese - MAX_VOCI }} in programma
        </p>
      </div>
    </DataState>
  </section>
</template>

<style scoped>
.prossime-spese {
  margin-top: 1.5rem;
}

.prossime-spese__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.875rem;
}

.prossime-spese__title {
  font-size: 1.0625rem;
  font-weight: 650;
  letter-spacing: var(--tracking-title);
  color: var(--text-primary);
}

.prossime-spese__link {
  background: none;
  border: none;
  color: var(--text-link);
  font-size: var(--text-xs);
  font-weight: 500;
  cursor: pointer;
  padding: 0;
}

.prossime-spese__link:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring-tight);
}

.prossime-spese__list {
  display: flex;
  flex-direction: column;
  gap: 0.625rem;
}

/* Riga di lista, non card: vetro non interattivo (niente hover/click, a
   differenza di RecentTransactions) perche' qui si naviga solo dal link
   "Vedi tutte", non dalla singola voce. */
.prossime-spese__item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  width: 100%;
  padding: 0.875rem 1rem;
  border-radius: var(--radius-lg);
  background: var(--glass-primary-bg);
  border: 1px solid var(--glass-primary-border);
  box-shadow: var(--shadow-xs), var(--glass-highlight);
}

.prossime-spese__avatar {
  width: 40px;
  height: 40px;
  border-radius: var(--radius-md);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  background: var(--surface-inset);
  color: var(--text-primary);
}

.prossime-spese__info {
  flex: 1;
  min-width: 0;
}

.prossime-spese__name {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.prossime-spese__meta {
  font-size: var(--text-xs);
  color: var(--text-subtle);
  margin-top: 0.125rem;
}

.prossime-spese__amount-wrap {
  text-align: right;
  flex-shrink: 0;
}

.prossime-spese__amount {
  font-size: 0.9375rem;
  font-weight: 700;
  color: var(--negative);
}

.prossime-spese__date {
  font-size: var(--text-xs);
  color: var(--text-muted);
  margin-top: 0.125rem;
}

.prossime-spese__altre {
  text-align: center;
  font-size: var(--text-xs);
  color: var(--text-muted);
  padding-top: 0.25rem;
}

.prossime-spese__empty {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 1.25rem 0 0.5rem;
}

.prossime-spese__empty-title {
  text-align: center;
  font-size: 0.9375rem;
  font-weight: 600;
  color: var(--text-primary);
}

.prossime-spese__empty-hint {
  text-align: center;
  font-size: var(--text-xs);
  line-height: 1.45;
  color: var(--text-secondary);
  max-width: 320px;
  margin: 0 auto;
}

.prossime-spese__manual-link {
  align-self: center;
  background: none;
  border: none;
  color: var(--text-muted);
  font-size: var(--text-xs);
  font-weight: 500;
  cursor: pointer;
  padding: 0.25rem 0;
  font-family: inherit;
}

.prossime-spese__manual-link:hover {
  color: var(--text-link);
}

.prossime-spese__manual-link:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring-tight);
}

.tabular-nums {
  font-variant-numeric: tabular-nums;
}
</style>
