<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { useRoute } from 'vue-router';
import WCard from '@/components/common/WCard.vue';
import WSkeleton from '@/components/common/WSkeleton.vue';
import MovimentoForm from '@/components/movimenti/MovimentoForm.vue';
import MovimentoItem from '@/components/movimenti/MovimentoItem.vue';
import { useContiStore } from '@/stores/conti.store';
import { useMovimentiStore } from '@/stores/movimenti.store';
import { useToastStore } from '@/stores/toast.store';
import { useValuta } from '@/composables/useValuta';
import { CATEGORIE_ENTRATA, CATEGORIE_USCITA, getCategoriaEntrata, getCategoriaUscita } from '@/utils/categorie';
import { ArrowLeftRight } from '@/utils/appIcons';
import ImportEstrattoHint from '@/components/common/ImportEstrattoHint.vue';
import dayjs from 'dayjs';
import 'dayjs/locale/it';

dayjs.locale('it');

const route = useRoute();
const contiStore = useContiStore();
const movimentiStore = useMovimentiStore();
const { loadingBilancio } = storeToRefs(movimentiStore);
const toastStore = useToastStore();
const { formatValuta } = useValuta();

const oggi = dayjs();

const filtroTipo = ref('');
const filtroPeriodo = ref('mese');
const filtroAnno = ref(oggi.year());
const filtroCategoria = ref('');
const filtroConto = ref('');
const filtroDa = ref('');
const filtroA = ref('');
const filtriAperti = ref(false);
const formOpen = ref(false);
const formTipo = ref('entrata');
const movimentoEdit = ref(null);
const isMobile = ref(window.innerWidth < 768);

const getFiltriDate = () => {
  const params = {};
  if (filtroTipo.value) params.tipo = filtroTipo.value;
  if (filtroCategoria.value) params.categoria = filtroCategoria.value;
  if (filtroConto.value) params.conto_id = filtroConto.value;

  if (filtroPeriodo.value === 'personalizzato' && filtroDa.value && filtroA.value) {
    params.da = filtroDa.value;
    params.a = filtroA.value;
  } else if (filtroPeriodo.value === 'oggi') {
    params.da = oggi.format('YYYY-MM-DD');
    params.a = oggi.format('YYYY-MM-DD');
  } else if (filtroPeriodo.value === 'settimana') {
    params.da = oggi.startOf('week').format('YYYY-MM-DD');
    params.a = oggi.endOf('week').format('YYYY-MM-DD');
  } else if (filtroPeriodo.value === 'mese') {
    params.da = oggi.startOf('month').format('YYYY-MM-DD');
    params.a = oggi.endOf('month').format('YYYY-MM-DD');
  } else if (filtroPeriodo.value === 'anno') {
    params.da = dayjs().year(filtroAnno.value).startOf('year').format('YYYY-MM-DD');
    params.a = dayjs().year(filtroAnno.value).endOf('year').format('YYYY-MM-DD');
  }
  return params;
};

const anniDisponibili = computed(() => {
  const current = oggi.year();
  return Array.from({ length: 8 }, (_, i) => current - i);
});

const caricaMovimenti = () => movimentiStore.fetchMovimenti(getFiltriDate());

const movimentiMostrati = computed(() => (
  movimentiStore.movimentiPerData.reduce((sum, g) => sum + g.movimenti.length, 0)
));

const hasMoreMovimenti = computed(() => (
  movimentiStore.pagination.page < movimentiStore.pagination.pages
));

const periodoLabel = computed(() => {
  if (filtroPeriodo.value === 'personalizzato' && filtroDa.value && filtroA.value) {
    return `${dayjs(filtroDa.value).format('D MMM YYYY')} – ${dayjs(filtroA.value).format('D MMM YYYY')}`;
  }
  const labels = {
    tutti: 'Tutti i periodi',
    oggi: 'Oggi',
    settimana: 'Questa settimana',
    mese: `Mese di ${oggi.format('MMMM')}`,
    anno: `Anno ${filtroAnno.value}`,
    personalizzato: 'Periodo personalizzato',
  };
  return labels[filtroPeriodo.value] || 'Movimenti';
});

const selezionaPeriodo = (periodo) => {
  filtroPeriodo.value = periodo;
  if (periodo === 'personalizzato' && (!filtroDa.value || !filtroA.value)) {
    filtroDa.value = oggi.startOf('month').format('YYYY-MM-DD');
    filtroA.value = oggi.format('YYYY-MM-DD');
  }
};

const applicaPeriodoPersonalizzato = () => {
  if (!filtroDa.value || !filtroA.value) {
    toastStore.error('Seleziona data inizio e fine');
    return;
  }
  if (dayjs(filtroDa.value).isAfter(dayjs(filtroA.value))) {
    toastStore.error('La data di inizio deve essere prima della data di fine');
    return;
  }
  filtroPeriodo.value = 'personalizzato';
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
    await contiStore.fetchConti();
    await caricaMovimenti();
    toastStore.success('Movimento eliminato');
  } catch {
    toastStore.error('Errore nell\'eliminazione');
  }
};

const onSaved = async () => {
  await contiStore.fetchConti();
  await contiStore.fetchPatrimonio();
  await caricaMovimenti();
  await movimentiStore.fetchBilancioMese(oggi.month() + 1, oggi.year());
};

watch([filtroTipo, filtroCategoria, filtroConto, filtroAnno], caricaMovimenti);

watch(filtroPeriodo, (periodo) => {
  if (periodo !== 'personalizzato') caricaMovimenti();
});

onMounted(async () => {
  await contiStore.fetchConti();

  if (route.query.da && route.query.a) {
    filtroPeriodo.value = 'personalizzato';
    filtroDa.value = String(route.query.da);
    filtroA.value = String(route.query.a);
  }

  await caricaMovimenti();
  await movimentiStore.fetchBilancioMese(oggi.month() + 1, oggi.year());

  if (route.query.action) {
    apriForm(route.query.action);
  }

  window.addEventListener('resize', () => { isMobile.value = window.innerWidth < 768; });
});

const tutteCategorie = computed(() => [...CATEGORIE_ENTRATA, ...CATEGORIE_USCITA]);
</script>

<template>
  <div class="movimenti-view animate-fade-in">
    <header class="page-header">
      <div>
        <h1 class="page-title">Movimenti</h1>
        <p class="page-sub">
          {{ periodoLabel }} ·
          Bilancio {{ oggi.format('MMMM') }}:
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

    <!-- Filtri periodo — sempre visibili -->
    <div class="periodo-section">
      <div class="periodo-section__header">
        <span class="periodo-section__title">Periodo</span>
        <span class="periodo-section__hint">{{ periodoLabel }}</span>
      </div>

      <div class="filtro-tabs filtro-tabs--periodo">
        <button :class="{ active: filtroPeriodo === 'tutti' }" @click="filtroPeriodo = 'tutti'">Tutti</button>
        <button :class="{ active: filtroPeriodo === 'oggi' }" @click="filtroPeriodo = 'oggi'">Oggi</button>
        <button :class="{ active: filtroPeriodo === 'settimana' }" @click="filtroPeriodo = 'settimana'">Settimana</button>
        <button :class="{ active: filtroPeriodo === 'mese' }" @click="filtroPeriodo = 'mese'">Mese</button>
        <button :class="{ active: filtroPeriodo === 'anno' }" @click="filtroPeriodo = 'anno'">Anno</button>
        <button :class="{ active: filtroPeriodo === 'personalizzato' }" @click="selezionaPeriodo('personalizzato')">Da – A</button>
      </div>

      <div v-if="filtroPeriodo === 'anno'" class="anno-filtro">
        <label class="anno-filtro__label" for="filtro-anno">Anno</label>
        <select id="filtro-anno" v-model.number="filtroAnno" class="filtro-select anno-filtro__select">
          <option v-for="y in anniDisponibili" :key="y" :value="y">{{ y }}</option>
        </select>
      </div>

      <div v-if="filtroPeriodo === 'personalizzato'" class="range-filtro">
        <label class="range-filtro__field">
          <span class="range-filtro__label">Data inizio</span>
          <input v-model="filtroDa" type="date" class="range-filtro__input">
        </label>
        <label class="range-filtro__field">
          <span class="range-filtro__label">Data fine</span>
          <input v-model="filtroA" type="date" class="range-filtro__input">
        </label>
        <button type="button" class="range-filtro__btn" @click="applicaPeriodoPersonalizzato">
          Applica periodo
        </button>
      </div>
    </div>

    <!-- Altri filtri -->
    <div class="filtri-section">
      <button class="filtri-toggle md:hidden" @click="filtriAperti = !filtriAperti">
        {{ filtriAperti ? '▼' : '▶' }} Altri filtri
      </button>
      <div class="filtri" :class="{ open: filtriAperti }">
        <div class="filtro-tabs">
          <button :class="{ active: !filtroTipo }" @click="filtroTipo = ''">Tutti</button>
          <button :class="{ active: filtroTipo === 'entrata' }" @click="filtroTipo = 'entrata'">Entrate</button>
          <button :class="{ active: filtroTipo === 'uscita' }" @click="filtroTipo = 'uscita'">Uscite</button>
        </div>
        <select v-model="filtroCategoria" class="filtro-select">
          <option value="">Tutte le categorie</option>
          <option v-for="c in tutteCategorie" :key="c.id" :value="c.id">{{ c.nome }}</option>
        </select>
        <select v-model="filtroConto" class="filtro-select">
          <option value="">Tutti i conti</option>
          <option v-for="c in contiStore.contiAttivi" :key="c.id" :value="c.id">{{ c.icona }} {{ c.nome }}</option>
        </select>
      </div>
    </div>

    <!-- Lista -->
    <div v-if="movimentiStore.loading" class="space-y-4">
      <WSkeleton type="text" :lines="4" />
    </div>

    <div v-else-if="movimentiStore.movimentiPerData.length">
      <p v-if="movimentiStore.pagination.total" class="results-meta">
        {{ movimentiMostrati }} di {{ movimentiStore.pagination.total }} movimenti
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
          @click="(m) => m.tipo !== 'trasferimento' && apriForm(m.tipo, m)"
          @delete="elimina"
        />
      </div>

      <div v-if="hasMoreMovimenti" class="load-more">
        <button
          class="load-more__btn"
          :disabled="movimentiStore.loadingMore"
          @click="movimentiStore.loadMoreMovimenti()"
        >
          {{ movimentiStore.loadingMore ? 'Caricamento...' : 'Carica altri movimenti' }}
        </button>
      </div>
    </div>

    <WCard v-else class="empty-state">
      <ArrowLeftRight class="empty-icon" :size="48" :stroke-width="1.5" />
      <p>Nessun movimento trovato</p>
      <button class="quick-add" @click="apriForm('entrata')">Aggiungi il primo movimento →</button>
    </WCard>

    <MovimentoForm
      :open="formOpen"
      :tipo="formTipo"
      :movimento="movimentoEdit"
      :mobile="isMobile"
      @close="formOpen = false; movimentoEdit = null"
      @saved="onSaved"
    />
  </div>
</template>

<style scoped>
.page-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1rem; }
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
.periodo-section {
  margin-bottom: 1rem;
  padding: 1rem;
  background: var(--bg-input);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
}
.periodo-section__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 0.75rem;
  flex-wrap: wrap;
}
.periodo-section__title { font-weight: 800; color: var(--text-primary); font-size: 0.9375rem; }
.periodo-section__hint { font-size: 0.8125rem; color: var(--text-secondary); }
.anno-filtro {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-top: 0.75rem;
}
.anno-filtro__label { font-size: 0.8125rem; color: var(--text-secondary); font-weight: 600; }
.anno-filtro__select { min-width: 120px; }
.add-btn { width: 44px; height: 44px; border-radius: 50%; background: var(--accent-green); border: none; font-size: 1.5rem; cursor: pointer; color: var(--accent-on); }
.filtri-section { margin-bottom: 1.25rem; }
.filtri-toggle { background: none; border: none; color: var(--text-secondary); cursor: pointer; margin-bottom: 0.5rem; font-size: 0.875rem; }
.filtri { display: flex; flex-wrap: wrap; gap: 0.5rem; }
@media (max-width: 767px) { .filtri:not(.open) { display: none; } }
.filtro-tabs { display: flex; gap: 0.375rem; }
.filtro-tabs button {
  padding: 0.5rem 0.875rem; border-radius: 999px; border: 1px solid var(--border);
  background: var(--bg-input); color: var(--text-secondary); font-size: 0.8125rem; cursor: pointer;
  min-height: 44px;
}
.filtro-tabs button.active { background: var(--accent-green); color: var(--accent-on); border-color: var(--accent-green); font-weight: 600; }
.filtro-tabs--periodo { flex-wrap: wrap; }
.range-filtro {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 0.75rem;
  width: 100%;
  margin-top: 0.75rem;
  padding-top: 0.75rem;
  border-top: 1px solid var(--border);
}
.range-filtro__field { display: flex; flex-direction: column; gap: 0.25rem; }
.range-filtro__label { font-size: 0.75rem; color: var(--text-secondary); font-weight: 600; }
.range-filtro__input {
  background: var(--bg-card, var(--bg-input));
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 0.5rem 0.75rem;
  color: var(--text-primary);
  font-size: 0.875rem;
  min-height: 44px;
}
.range-filtro__btn {
  padding: 0.5rem 1rem;
  border-radius: var(--radius-md);
  border: none;
  background: var(--accent-green);
  color: var(--accent-on);
  font-weight: 700;
  cursor: pointer;
  min-height: 44px;
}
.filtro-select { background: var(--bg-input); border: 1px solid var(--border); border-radius: var(--radius-md); padding: 0.375rem 0.75rem; color: var(--text-primary); font-size: 0.8125rem; }
.results-meta { margin: 0 0 1rem; font-size: 0.8125rem; color: var(--text-secondary); }
.load-more { display: flex; justify-content: center; margin: 1.5rem 0; }
.load-more__btn {
  padding: 0.75rem 1.25rem;
  border-radius: var(--radius-md);
  border: 1px solid var(--border);
  background: var(--bg-input);
  color: var(--text-primary);
  font-weight: 600;
  cursor: pointer;
}
.load-more__btn:disabled { opacity: 0.6; cursor: wait; }
.gruppo { margin-bottom: 1.5rem; }
.gruppo-header { display: flex; justify-content: space-between; align-items: center; font-size: 0.8125rem; color: var(--text-secondary); margin-bottom: 0.5rem; padding: 0 0.25rem; }
.gruppo-totali { display: flex; gap: 0.5rem; font-size: 0.75rem; }
.positive { color: var(--positive); }
.negative { color: var(--negative); }
.empty-state { text-align: center; padding: 3rem; color: var(--text-secondary); }
.empty-icon { display: block; margin: 0 auto 1rem; color: var(--text-muted); stroke: currentColor; }
.quick-add { margin-top: 1rem; padding: 0.75rem 1.5rem; border-radius: var(--radius-md); background: var(--accent-green); color: var(--accent-on); border: none; font-weight: 600; cursor: pointer; }
</style>
