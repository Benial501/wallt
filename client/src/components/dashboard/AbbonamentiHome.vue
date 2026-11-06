<script setup>
import { computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import dayjs from 'dayjs';
import DataState from '@/components/common/DataState.vue';
import ServizioIcona from '@/components/abbonamenti/ServizioIcona.vue';
import { useAbbonamentiStore } from '@/stores/abbonamenti.store';
import { useValuta } from '@/composables/useValuta';

const ETICHETTE_PERIODO = { 1: 'al mese', 3: 'ogni 3 mesi', 6: 'ogni 6 mesi', 12: 'all’anno' };

/**
 * Gli abbonamenti attivi nel carosello della home, subito dopo "Prossime spese".
 * Ognuno mostra il costo del suo periodo così come si paga (annuale all'anno,
 * mensile al mese), non una media mensile. Il prossimo rinnovo arriva dal server
 * (CLAUDE.md Regola 28). Stesso stile delle altre slide: occhiello, righe
 * separate da un filo, link in fondo.
 */
const router = useRouter();
const store = useAbbonamentiStore();
const { formatValuta } = useValuta();

// Lo store può essere già carico dalla pagina Abbonamenti: si rilegge solo se vuoto.
onMounted(() => {
  if (!store.lastUpdated) store.fetchAbbonamenti();
});

// Prima chi si rinnova prima; senza giorno di rinnovo in fondo, per nome.
const abbonamenti = computed(() => [...store.attivi].sort((a, b) => {
  if (a.prossimo_rinnovo && b.prossimo_rinnovo) return a.prossimo_rinnovo.localeCompare(b.prossimo_rinnovo);
  if (a.prossimo_rinnovo) return -1;
  if (b.prossimo_rinnovo) return 1;
  return a.nome.localeCompare(b.nome, 'it');
}));

// "vuoto" della risorsa conta anche i non attivi: qui servono solo gli attivi.
const statoLista = computed(() => (
  store.stato === 'pronto' && abbonamenti.value.length === 0 ? 'vuoto' : store.stato
));

/** "Oggi" / "Domani" / "fra 5 giorni", oltre il mese la data. */
const quando = (abbonamento) => {
  const data = abbonamento.prossimo_rinnovo;
  if (!data) return 'Rinnovo non indicato';
  const giorni = dayjs(data).startOf('day').diff(dayjs().startOf('day'), 'day');
  if (giorni <= 0) return 'Si rinnova oggi';
  if (giorni === 1) return 'Si rinnova domani';
  if (giorni <= 31) return `Si rinnova fra ${giorni} giorni`;
  return `Si rinnova il ${dayjs(data).format('D MMM')}`;
};

const conteggio = computed(() => (
  abbonamenti.value.length === 1 ? '1 abbonamento attivo' : `${abbonamenti.value.length} abbonamenti attivi`
));

const vaiAbbonamenti = () => router.push({ name: 'ricorrenti', query: { scheda: 'abbonamenti' } });
</script>

<template>
  <section class="abbonamenti-home">
    <p class="abbonamenti-home__eyebrow">Abbonamenti</p>

    <DataState
      :stato="statoLista"
      :last-updated="store.lastUpdated"
      messaggio-errore="Non è stato possibile caricare gli abbonamenti."
      skeleton-type="text"
      :skeleton-lines="3"
      @riprova="store.fetchAbbonamenti()"
    >
      <template #vuoto>
        <div class="abbonamenti-home__empty">
          <p class="abbonamenti-home__empty-title">Nessun abbonamento attivo</p>
          <p class="abbonamenti-home__empty-hint">
            Aggiungi Netflix, Spotify e gli altri servizi: vedrai quanto costano e quando si rinnovano.
          </p>
          <button type="button" class="abbonamenti-home__cta-btn" @click="vaiAbbonamenti">
            Aggiungi un abbonamento
          </button>
        </div>
      </template>

      <p class="abbonamenti-home__subtitle">
        {{ conteggio }}
      </p>
      <div class="abbonamenti-home__scroll" tabindex="0" role="region" aria-label="Abbonamenti attivi">
        <ul class="abbonamenti-home__list">
          <li v-for="abbonamento in abbonamenti" :key="abbonamento.id" class="abbonamenti-home__item">
            <ServizioIcona :icona="abbonamento.icona" :nome="abbonamento.nome" :size="32" />
            <span class="abbonamenti-home__info">
              <span class="abbonamenti-home__name">{{ abbonamento.nome }}</span>
              <span class="abbonamenti-home__meta">{{ quando(abbonamento) }}</span>
            </span>
            <span class="abbonamenti-home__amount-wrap">
              <span class="abbonamenti-home__amount tabular-nums">{{ formatValuta(abbonamento.costo) }}</span>
              <span class="abbonamenti-home__per">{{ ETICHETTE_PERIODO[abbonamento.periodo_mesi] || `ogni ${abbonamento.periodo_mesi} mesi` }}</span>
            </span>
          </li>
        </ul>
      </div>
      <button type="button" class="abbonamenti-home__link-btn" @click="vaiAbbonamenti">
        Gestisci abbonamenti →
      </button>
    </DataState>
  </section>
</template>

<style scoped>
/* Come ProssimeSpese: la slide passa `flex: 1`, la sezione resta una colonna
   flessibile perché il link in fondo abbia spazio su cui spingere. */
.abbonamenti-home,
.abbonamenti-home > .data-state {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}

.abbonamenti-home__eyebrow {
  /* deroga: occhiello che introduce la slide, come gli altri del carosello.
     Il contenuto vero sta subito sotto e resta al pavimento. */
  font-size: var(--text-micro);
  font-weight: 600;
  letter-spacing: 0.06em;
  color: var(--text-muted);
  margin-bottom: 0.375rem;
}

.abbonamenti-home__subtitle {
  font-size: var(--text-xs);
  color: var(--text-secondary);
  margin-bottom: 0.75rem;
}

.abbonamenti-home__scroll {
  /* Il carosello prende l'altezza della slide più alta: senza un tetto, con
     molti abbonamenti la lista allungava tutta la panoramica. Circa tre righe
     e mezza, quante ne mostra "Prossime spese": il resto si scorre qui dentro. */
  flex: 1;
  min-height: 0;
  max-height: 12.5rem;
  overflow-y: auto;
  overscroll-behavior-y: contain;
  margin-bottom: 0.75rem;
}

.abbonamenti-home__scroll:focus-visible {
  outline: 2px solid var(--accent-green);
  outline-offset: -2px;
  border-radius: 0.75rem;
}

.abbonamenti-home__list { list-style: none; margin: 0; padding: 0; }

.abbonamenti-home__item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem 0.25rem;
  border-bottom: 1px solid var(--border);
}

.abbonamenti-home__item:last-child { border-bottom: none; }

.abbonamenti-home__info { flex: 1; min-width: 0; }

.abbonamenti-home__name {
  display: block;
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.abbonamenti-home__meta {
  display: block;
  font-size: var(--text-xs);
  color: var(--text-subtle);
  margin-top: 0.125rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.abbonamenti-home__amount-wrap { text-align: right; flex-shrink: 0; }

.abbonamenti-home__amount {
  display: block;
  font-size: 0.9375rem;
  font-weight: 700;
  color: var(--text-primary);
}

.abbonamenti-home__per {
  display: block;
  font-size: var(--text-xs);
  color: var(--text-muted);
  margin-top: 0.125rem;
}

.abbonamenti-home__link-btn {
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

.abbonamenti-home__link-btn:hover { text-decoration: underline; }
.abbonamenti-home__link-btn:focus-visible { outline: none; box-shadow: var(--focus-ring-tight); }

.abbonamenti-home__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex: 1;
  gap: 0.5rem;
  text-align: center;
  padding: 0.5rem 0;
}

.abbonamenti-home__empty-title {
  font-size: 0.9375rem;
  font-weight: 600;
  color: var(--text-primary);
}

.abbonamenti-home__empty-hint {
  font-size: var(--text-xs);
  line-height: 1.45;
  color: var(--text-secondary);
  max-width: 320px;
}

.abbonamenti-home__cta-btn {
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

.abbonamenti-home__cta-btn:focus-visible { outline: none; box-shadow: var(--focus-ring); }

.tabular-nums { font-variant-numeric: tabular-nums; }
</style>
