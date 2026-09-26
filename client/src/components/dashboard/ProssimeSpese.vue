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
 * prime quattro. Le programmate vengono prima perché sono eventi singoli e
 * datati: chi le ha appuntate lo ha fatto per non dimenticarle.
 *
 * Vive come scheda del carosello della home, subito dopo "I miei conti":
 * lo stile segue quello delle altre slide (occhiello, righe separate da un
 * filo, link in fondo), non quello delle sezioni a vetro sotto il carosello,
 * perché la slide è già dentro la card di vetro della panoramica.
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
const restanti = computed(() => totaleSpese.value - MAX_VOCI);
/** "e altre 1 in programma" non si legge: al singolare cambia la frase. */
const etichettaRestanti = computed(() => (
  restanti.value === 1 ? "e un'altra in programma" : `e altre ${restanti.value} in programma`
));

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
    <p class="prossime-spese__eyebrow">Prossime spese</p>

    <DataState
      :stato="statoLista"
      :last-updated="lastUpdated"
      messaggio-errore="Non è stato possibile caricare le prossime spese."
      skeleton-type="text"
      :skeleton-lines="3"
      @riprova="emit('riprova')"
    >
      <template #vuoto>
        <div class="prossime-spese__empty">
          <p class="prossime-spese__empty-title">Nessuna spesa in arrivo</p>
          <p class="prossime-spese__empty-hint">
            Registra una spesa ricorrente o programma una spesa occasionale: comparirà
            qui e verrà scalata dal saldo effettivo prima ancora di essere addebitata.
          </p>
          <button type="button" class="prossime-spese__cta-btn" @click="router.push('/ricorrenti')">
            Aggiungi una spesa
          </button>
        </div>
      </template>

      <p class="prossime-spese__subtitle">Quanto sta per uscire dal conto</p>
      <div class="prossime-spese__scroll" tabindex="0" role="region" aria-label="Prossime spese">
        <ul class="prossime-spese__list">
          <li v-for="spesa in spese" :key="spesa.id" class="prossime-spese__item">
            <span class="prossime-spese__avatar">
              <CategoryIcon :movimento="spesa" :size="16" />
            </span>
            <span class="prossime-spese__info">
              <span class="prossime-spese__name">{{ spesa.presentazione.descrizione }}</span>
              <span class="prossime-spese__meta">
                {{ spesa.presentazione.frequenzaLabel }} &middot; {{ spesa.presentazione.contoLabel }}
              </span>
            </span>
            <span class="prossime-spese__amount-wrap">
              <span class="prossime-spese__amount tabular-nums">-{{ formatValuta(spesa.importo) }}</span>
              <span class="prossime-spese__date">{{ quando(spesa) }}</span>
            </span>
          </li>
        </ul>
        <p v-if="restanti > 0" class="prossime-spese__altre">{{ etichettaRestanti }}</p>
      </div>
      <button type="button" class="prossime-spese__link-btn" @click="router.push('/ricorrenti')">
        Vedi tutte →
      </button>
    </DataState>
  </section>
</template>

<style scoped>
/* La slide del carosello passa `flex: 1` al suo figlio diretto: la sezione
   deve restare una colonna flessibile, altrimenti `margin-top: auto` del
   link in fondo non ha altezza su cui spingere. */
.prossime-spese {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}

/* Stesso motivo, un livello più sotto: DataState è il contenitore reale del
   contenuto della scheda. */
.prossime-spese > .data-state {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}

.prossime-spese__eyebrow {
  /* deroga: occhiello che introduce la slide, come gli altri del carosello
     ("I miei conti", "Budget del mese"). Non porta informazione propria:
     il contenuto vero della scheda sta subito sotto e resta al pavimento. */
  font-size: var(--text-micro);
  font-weight: 600;
  letter-spacing: 0.06em;
  color: var(--text-muted);
  margin-bottom: 0.375rem;
}

.prossime-spese__subtitle {
  font-size: var(--text-xs);
  color: var(--text-secondary);
  margin-bottom: 0.75rem;
}

/* Prende l'altezza che la slide le lascia invece di un tetto fisso: con un
   tetto, la quarta riga restava tagliata a metà anche quando nella scheda
   c'era spazio per mostrarla intera. */
.prossime-spese__scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior-y: contain;
  margin-bottom: 0.75rem;
}

.prossime-spese__scroll:focus-visible {
  outline: 2px solid var(--accent-green);
  outline-offset: -2px;
  border-radius: 0.75rem;
}

.prossime-spese__list { list-style: none; margin: 0; padding: 0; }

/* Riga di lista, non card a sé: la slide è già dentro la card di vetro
   della panoramica, un secondo vetro sopra il primo si legge male. */
.prossime-spese__item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem 0.25rem;
  border-bottom: 1px solid var(--border);
}

.prossime-spese__item:last-child { border-bottom: none; }

.prossime-spese__avatar {
  width: 32px;
  height: 32px;
  border-radius: var(--radius-md);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  background: var(--surface-inset);
  color: var(--text-primary);
}

.prossime-spese__info { flex: 1; min-width: 0; }

.prossime-spese__name {
  display: block;
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Su una sola riga come il nome: "Spesa programmata · Conto principale" su
   due righe raddoppiava l'altezza di ogni voce. */
.prossime-spese__meta {
  display: block;
  font-size: var(--text-xs);
  color: var(--text-subtle);
  margin-top: 0.125rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.prossime-spese__amount-wrap {
  text-align: right;
  flex-shrink: 0;
}

.prossime-spese__amount {
  display: block;
  font-size: 0.9375rem;
  font-weight: 700;
  color: var(--negative);
}

.prossime-spese__date {
  display: block;
  font-size: var(--text-xs);
  color: var(--text-muted);
  margin-top: 0.125rem;
}

.prossime-spese__altre {
  text-align: center;
  font-size: var(--text-xs);
  color: var(--text-muted);
  padding-top: 0.5rem;
}

.prossime-spese__link-btn {
  margin-top: auto;
  align-self: center;
  background: none;
  border: none;
  color: var(--accent-text);
  font-size: var(--text-xs);
  font-weight: 600;
  cursor: pointer;
  padding: 0.25rem 0;
  font-family: inherit;
}

.prossime-spese__link-btn:hover { text-decoration: underline; }
.prossime-spese__link-btn:focus-visible { outline: none; box-shadow: var(--focus-ring-tight); }

/* Stato vuoto nello stesso stile degli altri inviti del carosello. */
.prossime-spese__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex: 1;
  gap: 0.5rem;
  text-align: center;
  padding: 0.5rem 0;
}

.prossime-spese__empty-title {
  font-size: 0.9375rem;
  font-weight: 600;
  color: var(--text-primary);
}

.prossime-spese__empty-hint {
  font-size: var(--text-xs);
  line-height: 1.45;
  color: var(--text-secondary);
  max-width: 320px;
}

.prossime-spese__cta-btn {
  margin-top: 0.25rem;
  padding: 0.625rem 1.25rem;
  border-radius: 999px;
  border: none;
  background: var(--accent-green);
  color: var(--accent-on);
  font-weight: 600;
  font-size: 0.875rem;
  cursor: pointer;
  font-family: inherit;
}

.prossime-spese__cta-btn:focus-visible { outline: none; box-shadow: var(--focus-ring); }

.tabular-nums {
  font-variant-numeric: tabular-nums;
}
</style>
