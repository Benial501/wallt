<script setup>
import {
  ref, computed, onMounted, onBeforeUnmount,
} from 'vue';
import { storeToRefs } from 'pinia';
import { useRoute } from 'vue-router';
import WCard from '@/components/common/WCard.vue';
import WSkeleton from '@/components/common/WSkeleton.vue';
import MovimentoForm from '@/components/movimenti/MovimentoForm.vue';
import MovimentoItem from '@/components/movimenti/MovimentoItem.vue';
import MovimentiFilters from '@/components/movimenti/MovimentiFilters.vue';
import { useContiStore } from '@/stores/conti.store';
import { useMovimentiStore } from '@/stores/movimenti.store';
import { useToastStore } from '@/stores/toast.store';
import { useValuta } from '@/composables/useValuta';
import { getCategoriaEntrata, getCategoriaUscita } from '@/utils/categorie';
import { FILTRI_INIZIALI, aParametriQuery } from '@/utils/filtriMovimenti';
import { ArrowLeftRight } from '@/utils/appIcons';
import ImportEstrattoHint from '@/components/common/ImportEstrattoHint.vue';
import HelpTrigger from '@/components/help/HelpTrigger.vue';
import DataState from '@/components/common/DataState.vue';
import { etichetta } from '@/content/glossario';
import api from '@/utils/axios';
import { refreshAfterWrite } from '@/utils/afterWrite';
import dayjs from 'dayjs';
import 'dayjs/locale/it';

dayjs.locale('it');

const route = useRoute();
const contiStore = useContiStore();
const movimentiStore = useMovimentiStore();
const { filtriUI, loadingBilancio } = storeToRefs(movimentiStore);
const toastStore = useToastStore();
const { formatValuta } = useValuta();

const oggi = dayjs();

const formOpen = ref(false);
const formTipo = ref('entrata');
const movimentoEdit = ref(null);

/**
 * Esistenza di movimenti a prescindere dai filtri: serve solo a distinguere
 * "nessun risultato per questi filtri" da "non hai ancora registrato nulla".
 * Lettura non filtrata con limit 1, che NON tocca la lista corrente dello store.
 * null = non verificabile ora (errore o richiesta non ancora fatta).
 */
const haMovimentiTotali = ref(null);

const verificaMovimentiTotali = async () => {
  try {
    const { data } = await api.get('/movimenti', { params: { limit: 1 } });
    const totale = data?.pagination?.total;
    haMovimentiTotali.value = typeof totale === 'number' ? totale > 0 : null;
  } catch {
    haMovimentiTotali.value = null;
  }
};

const caricaMovimenti = async () => {
  const data = await movimentiStore.fetchMovimenti(aParametriQuery(filtriUI.value));
  // La verifica serve solo quando la lista filtrata è vuota.
  if (!movimentiStore.movimentiPerData.length) {
    await verificaMovimentiTotali();
  } else {
    haMovimentiTotali.value = true;
  }
  return data;
};

const senzaConti = computed(() => contiStore.contiAttivi.length === 0);

const movimentiMostrati = computed(() => (
  movimentiStore.movimentiPerData.reduce((sum, g) => sum + g.movimenti.length, 0)
));

/**
 * Unico contatore dei risultati (l'altro, nel componente dei filtri, è stato
 * rimosso per non duplicarlo): a lista completa mostra solo il totale, con il
 * singolare corretto; finché mancano righe da caricare il confronto "X di Y"
 * è l'unica informazione che serve.
 */
const risultatiLabel = computed(() => {
  const totale = movimentiStore.pagination.total;
  const parola = totale === 1 ? 'movimento' : 'movimenti';
  if (movimentiMostrati.value >= totale) return `${totale} ${parola}`;
  return `${movimentiMostrati.value} di ${totale} ${parola}`;
});

const hasMoreMovimenti = computed(() => (
  movimentiStore.pagination.page < movimentiStore.pagination.pages
));

const periodoLabel = computed(() => {
  if (filtriUI.value.periodo === 'personalizzato' && filtriUI.value.da && filtriUI.value.a) {
    return `${dayjs(filtriUI.value.da).format('D MMM YYYY')} – ${dayjs(filtriUI.value.a).format('D MMM YYYY')}`;
  }
  const labels = {
    oggi: 'Oggi',
    settimana: 'Questa settimana',
    mese: `Mese di ${oggi.format('MMMM')}`,
    anno: `Anno ${filtriUI.value.anno}`,
    personalizzato: 'Periodo personalizzato',
  };
  return labels[filtriUI.value.periodo] || 'Movimenti';
});

/**
 * La ricerca parte a ogni tasto premuto, ma non a ogni tasto premuto: il
 * debounce evita una richiesta per lettera. La guardia di generazione dello
 * store scarta comunque le risposte sorpassate, quindi qui si risparmia
 * traffico, non correttezza.
 */
let attesa;
const aggiornaFiltri = (nuovi) => {
  const ricercaCambiata = nuovi.cerca !== filtriUI.value.cerca;
  movimentiStore.impostaFiltriUI(nuovi);
  clearTimeout(attesa);
  if (ricercaCambiata) attesa = setTimeout(caricaMovimenti, 300);
  else caricaMovimenti();
};

const azzeraFiltri = () => {
  clearTimeout(attesa);
  movimentiStore.impostaFiltriUI({ ...FILTRI_INIZIALI });
  caricaMovimenti();
};

const getCatInfo = (mov) => {
  if (mov.tipo === 'entrata') return getCategoriaEntrata(mov.categoria);
  if (mov.tipo === 'uscita') return getCategoriaUscita(mov.categoria);
  return { nome: 'Trasferimento', colore: '#95A5A6' };
};

const apriForm = (tipo, mov = null) => {
  formTipo.value = tipo;
  movimentoEdit.value = mov;
  formOpen.value = true;
};

const elimina = async (mov) => {
  try {
    await movimentiStore.deleteMovimento(mov.id);
  } catch {
    toastStore.error('Errore nell\'eliminazione');
    return;
  }

  // Movimento già eliminato: il ricaricamento della lista non deve far
  // credere che l'eliminazione sia fallita.
  await refreshAfterWrite(() => contiStore.fetchConti(), () => caricaMovimenti());
  toastStore.success('Movimento eliminato');
};

const onSaved = async () => {
  await refreshAfterWrite(
    () => contiStore.fetchConti(),
    () => contiStore.fetchPatrimonio(),
    () => caricaMovimenti(),
    () => movimentiStore.fetchBilancioMese(oggi.month() + 1, oggi.year()),
  );
};

onMounted(async () => {
  await contiStore.fetchConti();

  if (route.query.da && route.query.a) {
    movimentiStore.impostaFiltriUI({
      ...filtriUI.value,
      periodo: 'personalizzato',
      da: String(route.query.da),
      a: String(route.query.a),
    });
  }

  await Promise.all([
    caricaMovimenti(),
    movimentiStore.fetchBilancioMese(oggi.month() + 1, oggi.year()),
    movimentiStore.fetchRecentiHome(),
  ]);

  if (route.query.action) {
    apriForm(route.query.action);
  }
});

onBeforeUnmount(() => clearTimeout(attesa));
</script>

<template>
  <div class="movimenti-view animate-fade-in">
    <header class="page-header">
      <div>
        <div class="page-title-row">
          <h1 class="page-title">Movimenti</h1>
          <HelpTrigger topic="movimenti-pagina" />
        </div>
        <p class="page-sub">
          {{ periodoLabel }} ·
          {{ etichetta('risultato_mese') }} ({{ oggi.format('MMMM') }}):
          <WSkeleton
            v-if="loadingBilancio"
            type="text"
            :lines="1"
            class="bilancio-skeleton"
          />
          <span
            v-else
            :class="(movimentiStore.bilancioMese.saldo || 0) >= 0 ? 'positive' : 'negative'"
          >
            {{ formatValuta(movimentiStore.bilancioMese.saldo) }}
          </span>
        </p>
      </div>
      <button class="add-btn md:hidden" @click="apriForm('entrata')">+</button>
    </header>

    <ImportEstrattoHint
      class="movimenti-import-hint"
      message="Hai un file dell'estratto conto? Importalo in pochi tap"
    />

    <MovimentiFilters
      :model-value="filtriUI"
      :conti="contiStore.conti"
      :categorie-recenti="movimentiStore.categorieRecenti"
      :risultati="movimentiStore.pagination.total"
      @update:model-value="aggiornaFiltri"
      @azzera="azzeraFiltri"
    />

    <p v-if="movimentiStore.loading" class="movimenti__ricerca-in-corso" role="status">
      Aggiornamento dei risultati…
    </p>

    <!-- Lista -->
    <DataState
      :stato="movimentiStore.risorsaMovimenti.stato"
      :last-updated="movimentiStore.risorsaMovimenti.lastUpdated"
      messaggio-errore="Non è stato possibile caricare i movimenti."
      skeleton-type="text"
      :skeleton-lines="4"
      @riprova="movimentiStore.risorsaMovimenti.riprova()"
    >
      <template #vuoto>
        <WCard class="empty-state">
          <ArrowLeftRight class="empty-icon" :size="48" :stroke-width="1.5" />

          <template v-if="senzaConti">
            <p>Prima crea un conto</p>
            <p class="empty-state__hint">
              I movimenti vengono registrati su un conto: banca, carta o contanti.
              Dopo averlo creato potrai inserirli a mano o importare un estratto.
            </p>
            <button class="quick-add" @click="$router.push('/conti')">Vai a I miei conti →</button>
          </template>

          <template v-else-if="haMovimentiTotali === false">
            <p>Non hai ancora registrato movimenti</p>
            <p class="empty-state__hint">
              Inserisci la prima entrata o uscita, oppure importa l'estratto conto della tua banca.
            </p>
            <div class="empty-state__actions">
              <button class="quick-add" @click="apriForm('entrata')">Aggiungi il primo movimento →</button>
              <button class="quick-add quick-add--secondary" @click="$router.push('/importa')">
                Importa un estratto
              </button>
            </div>
          </template>

          <template v-else-if="haMovimentiTotali === true">
            <p>Nessun risultato per questi filtri</p>
            <p class="empty-state__hint">
              Hai movimenti registrati, ma nessuno rientra nel periodo o nei filtri selezionati.
              Prova con un altro periodo o modifica i filtri.
            </p>
            <button class="quick-add quick-add--secondary" @click="azzeraFiltri">
              Ripristina i filtri
            </button>
          </template>

          <template v-else>
            <p>Nessun movimento trovato</p>
            <p class="empty-state__hint">
              Non è stato possibile verificare se ci sono movimenti in altri periodi.
              Controlla i filtri o riprova.
            </p>
            <button class="quick-add" @click="apriForm('entrata')">Aggiungi un movimento →</button>
          </template>
        </WCard>
      </template>

      <div>
        <p v-if="movimentiStore.pagination.total" class="results-meta" role="status">
          {{ risultatiLabel }}
        </p>
        <div v-for="gruppo in movimentiStore.movimentiPerData" :key="gruppo.data" class="gruppo animate-slide-up">
          <div class="gruppo-header">
            <span>{{ gruppo.label }} · {{ dayjs(gruppo.data).format('D MMMM') }}</span>
            <span class="gruppo-totali">
              <span v-if="gruppo.totale_entrate_giorno" class="positive">+{{ formatValuta(gruppo.totale_entrate_giorno) }}</span>
              <span v-if="gruppo.totale_uscite_giorno" class="negative">-{{ formatValuta(gruppo.totale_uscite_giorno) }}</span>
            </span>
          </div>

          <MovimentoItem
            v-for="mov in gruppo.movimenti"
            :key="mov.id"
            :movimento="mov"
            :cat-info="getCatInfo(mov)"
            :selected="formOpen && movimentoEdit?.id === mov.id"
            @click="(m) => m.tipo !== 'trasferimento' && apriForm(m.tipo, m)"
            @delete="elimina"
          />
        </div>

        <div v-if="hasMoreMovimenti">
          <div class="load-more">
            <button
              class="load-more__btn"
              :disabled="movimentiStore.loadingMore"
              @click="movimentiStore.loadMoreMovimenti()"
            >
              {{ movimentiStore.loadingMore ? 'Caricamento...' : 'Carica altri movimenti' }}
            </button>
          </div>
          <p v-if="movimentiStore.errorMore" class="carica-altri-errore" role="alert">
            Non è stato possibile caricare altri movimenti.
            <button type="button" class="carica-altri-riprova" @click="movimentiStore.loadMoreMovimenti()">
              Riprova
            </button>
          </p>
        </div>
      </div>
    </DataState>

    <MovimentoForm
      :open="formOpen"
      :tipo="formTipo"
      :movimento="movimentoEdit"
      @close="formOpen = false"
      @saved="onSaved"
    />
  </div>
</template>

<style scoped>
.page-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1rem; }
.page-title-row { display: flex; align-items: center; gap: 0.625rem; flex-wrap: wrap; }
.page-title { font-size: 1.5rem; font-weight: 700; color: var(--text-primary); }
.page-sub { color: var(--text-secondary); font-size: 0.875rem; margin-top: 0.25rem; }
.bilancio-skeleton {
  display: inline-block;
  vertical-align: middle;
  width: 5.5rem;
  margin-left: 0.125rem;
}
.bilancio-skeleton :deep(.w-skeleton__line) {
  height: 0.875rem;
  margin-bottom: 0;
}
.movimenti-import-hint { margin-bottom: 0.875rem; }
.movimenti__ricerca-in-corso {
  margin: 0 0 var(--space-2);
  font-size: var(--text-xs);
  color: var(--text-muted);
}
.add-btn {
  width: 44px; height: 44px; border-radius: 50%;
  background: linear-gradient(180deg, color-mix(in srgb, var(--accent-green) 92%, white), var(--accent-green));
  border: none; font-size: 1.5rem; line-height: 1; cursor: pointer; color: var(--accent-on);
  box-shadow: var(--shadow-sm), inset 0 1px 0 rgba(255, 255, 255, 0.24);
  transition: filter var(--dur-fast) var(--ease-out), transform var(--dur-fast) var(--ease-out);
}
@media (hover: hover) { .add-btn:hover { filter: brightness(1.06); transform: translateY(-1px); } }
.add-btn:active { transform: scale(0.94); }
.results-meta { margin: 0 0 1rem; font-size: var(--text-xs); color: var(--text-secondary); }
.load-more { display: flex; justify-content: center; margin: 1.5rem 0; }
.load-more__btn {
  padding: 0.75rem 1.5rem;
  min-height: 44px;
  border-radius: var(--radius-pill);
  border: 1px solid var(--glass-interactive-border);
  background: var(--glass-interactive-bg);
  box-shadow: var(--glass-highlight);
  color: var(--text-primary);
  font-weight: 600;
  cursor: pointer;
  transition: background var(--dur-fast) var(--ease-out), border-color var(--dur-fast) var(--ease-out);
}
@media (hover: hover) {
  .load-more__btn:hover:not(:disabled) { background: var(--glass-interactive-bg-hover); border-color: var(--border-strong); }
}
.load-more__btn:disabled { opacity: 0.6; cursor: wait; }
.carica-altri-errore {
  margin-top: 0.5rem;
  font-size: 0.875rem;
  color: var(--text-secondary);
  text-align: center;
}
.carica-altri-riprova {
  min-height: 44px;
  padding: 0 0.5rem;
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--text-link);
  background: none;
  border: none;
  cursor: pointer;
}
.carica-altri-riprova:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
  border-radius: var(--radius-xs);
}
.gruppo { margin-bottom: 1.5rem; }
.gruppo-header { display: flex; justify-content: space-between; align-items: center; font-size: var(--text-xs); color: var(--text-secondary); margin-bottom: 0.5rem; padding: 0 0.25rem; }
.gruppo-totali { display: flex; gap: 0.5rem; font-size: var(--text-xs); }
.positive { color: var(--positive); }
.negative { color: var(--negative); }
.empty-state { text-align: center; padding: 3rem; color: var(--text-secondary); }
.empty-icon { display: block; margin: 0 auto 1rem; color: var(--text-muted); stroke: currentColor; }
.quick-add { margin-top: 1rem; padding: 0.75rem 1.5rem; border-radius: var(--radius-md); background: var(--accent-green); color: var(--accent-on); border: none; font-weight: 600; cursor: pointer; min-height: 44px; }
.quick-add--secondary { background: var(--bg-input); color: var(--text-primary); border: 1px solid var(--border); }
.empty-state__hint { margin: 0.5rem auto 0; max-width: 32rem; font-size: var(--text-xs); line-height: 1.55; color: var(--text-muted); }
.empty-state__actions { display: flex; flex-wrap: wrap; gap: 0.625rem; justify-content: center; }
</style>
