<script setup>
import { ref, computed, onMounted } from 'vue';
import { storeToRefs } from 'pinia';
import { useRouter } from 'vue-router';
import DashboardHeader from '@/components/dashboard/DashboardHeader.vue';
import GettingStartedCard from '@/components/help/GettingStartedCard.vue';
import HelpTrigger from '@/components/help/HelpTrigger.vue';
import WOverviewCarousel from '@/components/custom/WOverviewCarousel.vue';
import RecentTransactions from '@/components/dashboard/RecentTransactions.vue';
import MovimentoForm from '@/components/movimenti/MovimentoForm.vue';
import { useAuthStore } from '@/stores/auth.store';
import { useContiStore } from '@/stores/conti.store';
import { useMovimentiStore } from '@/stores/movimenti.store';
import { useBudgetStore } from '@/stores/budget.store';
import { useScommesseStore } from '@/stores/scommesse.store';
import { useInvestimentiStore } from '@/stores/investimenti.store';
import { useObiettiviStore } from '@/stores/obiettivi.store';
import { useHelpStore } from '@/stores/help.store';
import api from '@/utils/axios';
import dayjs from 'dayjs';
import 'dayjs/locale/it';

dayjs.locale('it');

const authStore = useAuthStore();
const contiStore = useContiStore();
const movimentiStore = useMovimentiStore();
const budgetStore = useBudgetStore();
const scommesseStore = useScommesseStore();
const investimentiStore = useInvestimentiStore();
const obiettiviStore = useObiettiviStore();
const helpStore = useHelpStore();
const router = useRouter();
const { canAccessScommesseFeature, canAccessInvestimentiFeature } = storeToRefs(authStore);
const { recentiHome } = storeToRefs(movimentiStore);
const { gettingStartedVisible } = storeToRefs(helpStore);

const oggi = dayjs();
const meseStart = oggi.startOf('month').format('YYYY-MM-DD');
const oggiStr = oggi.format('YYYY-MM-DD');

const formOpen = ref(false);
const formTipo = ref('uscita');
const movimentoEdit = ref(null);
const pianoSmartHome = ref(null);

// Per far rileggere AndamentoPatrimonio da onSaved: DataState tiene lo slot
// montato per progetto, quindi solo `onMounted` non basta, e una `key` che
// rimonta il componente perderebbe il periodo scelto dall'utente. Vedi
// ricaricaAndamento() in WOverviewCarousel.vue.
const overviewRef = ref(null);

// Traguardo di "Primi passi" non coperto da una risorsa: è una lettura non
// filtrata a parte (vedi checkHaMovimenti), quindi resta un flag tenuto a
// mano. null = non ancora noto (o richiesta fallita) → stato "sconosciuto".
const haMovimenti = ref(null);

const contiState = computed(() => {
  if (contiStore.risorsaConti.lastUpdated === null) return 'sconosciuto';
  return contiStore.contiAttivi.length > 0 ? 'fatto' : 'da-fare';
});
const movimentiState = computed(() => (
  haMovimenti.value === null ? 'sconosciuto' : (haMovimenti.value ? 'fatto' : 'da-fare')
));
const budgetState = computed(() => {
  if (budgetStore.risorsaBudget.lastUpdated === null) return 'sconosciuto';
  return budgetStore.hasBudget ? 'fatto' : 'da-fare';
});

/**
 * Stato di una scheda alimentata da più letture.
 *
 * Il pannello d'errore pieno solo quando NESSUNA ha mai risposto: se anche una
 * sola ha dati, mostrarli con l'avviso è meglio che nascondere numeri corretti
 * perché un'altra lettura è caduta.
 */
const statoCombinato = (...risorse) => computed(() => {
  if (risorse.some((r) => r.stato === 'caricamento')) return 'caricamento';
  if (!risorse.some((r) => r.error)) return 'pronto';
  return risorse.some((r) => r.lastUpdated !== null) ? 'errore-con-dati' : 'errore';
});

/** Il più vecchio dei successi: l'avviso non deve vantare una freschezza che
 *  una delle letture non ha. */
const lastUpdatedCombinato = (...risorse) => computed(() => {
  const valori = risorse.map((r) => r.lastUpdated).filter((v) => v !== null);
  return valori.length ? Math.min(...valori) : null;
});

/**
 * Il patrimonio ha tre dipendenze: il totale ricade su risorsaConti quando
 * risorsaPatrimonio non ha ancora risposto, la composizione arriva solo con
 * risorsaPatrimonio, e la scheda mostra anche entrate/uscite del mese lette
 * da risorsaBilancio. Le tre devono dichiararsi insieme, altrimenti una
 * fallita in silenzio lascia "Entrate mese"/"Uscite mese" a 0,00 € per
 * sempre con la scheda che si dice comunque pronta.
 */
const statoSaldo = statoCombinato(
  contiStore.risorsaConti,
  contiStore.risorsaPatrimonio,
  movimentiStore.risorsaBilancio,
);
const lastUpdatedSaldo = lastUpdatedCombinato(
  contiStore.risorsaConti,
  contiStore.risorsaPatrimonio,
  movimentiStore.risorsaBilancio,
);
const riprovaSaldo = () => {
  contiStore.risorsaConti.riprova();
  contiStore.risorsaPatrimonio.riprova();
  movimentiStore.risorsaBilancio.riprova();
};

/**
 * Le cifre della scheda scommesse (vincite, perdite, bilancio netto) vengono
 * tutte da risorsaAnalisi, non da risorsaPiattaforme: quest'ultima serve solo
 * a decidere se la scheda esiste. Dichiarare lo stato sulla sola piattaforme
 * lascerebbe la scheda "pronta" con numeri a zero se risorsaAnalisi fallisse.
 */
const statoScommesse = statoCombinato(
  scommesseStore.risorsaPiattaforme,
  scommesseStore.risorsaAnalisi,
);
const lastUpdatedScommesse = lastUpdatedCombinato(
  scommesseStore.risorsaPiattaforme,
  scommesseStore.risorsaAnalisi,
);
const riprovaScommesse = () => {
  scommesseStore.risorsaPiattaforme.riprova();
  scommesseStore.risorsaAnalisi.riprova();
};

const entrateMese = computed(() => movimentiStore.bilancioMese.entrate || 0);
const usciteMese = computed(() => movimentiStore.bilancioMese.uscite || 0);

const scommesseAttivo = computed(() => scommesseStore.piattaforme.length > 0);
const investimentiAttivo = computed(() => investimentiStore.investimenti.length > 0);

const budgetTotale = computed(() =>
  parseFloat(budgetStore.budgetCorrente?.importo_totale) || 0,
);

const loadConti = () => contiStore.fetchConti();

/**
 * Verifica non filtrata dell'esistenza di movimenti (limit 1), usata solo dal
 * riquadro "Primi passi": la lista in movimenti.store è filtrata e paginata e
 * non va sovrascritta, e i recenti della home escludono i conti non attivi.
 * Se la richiesta fallisce il traguardo resta "sconosciuto".
 */
const checkHaMovimenti = async () => {
  if (!gettingStartedVisible.value) return;
  try {
    const { data } = await api.get('/movimenti', { params: { limit: 1 } });
    const totale = data?.pagination?.total;
    if (typeof totale === 'number') {
      haMovimenti.value = totale > 0;
    } else if (Array.isArray(data?.gruppi)) {
      haMovimenti.value = data.gruppi.length > 0;
    } else {
      haMovimenti.value = null;
    }
  } catch {
    haMovimenti.value = null;
  }
};

const loadDashboardMovimenti = () => Promise.all([
  movimentiStore.fetchRecentiHome({ limit: 6 }),
  movimentiStore.fetchOggi(meseStart, oggiStr, oggiStr),
]);

const loadPianoSmartHome = async () => {
  try {
    const { data } = await api.get('/piano-smart/v2/current-situation');
    pianoSmartHome.value = data;
  } catch {
    pianoSmartHome.value = null;
  }
};

const formatoEuro = (value) => value === null || value === undefined
  ? '—' : new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(Number(value));

const loadBudget = async () => {
  await budgetStore.fetchBudget(oggi.month() + 1, oggi.year());
  // `hasBudget`, non `esiste`: dopo una scrittura riuscita ma una rilettura
  // di /budget fallita, il budget arriva comunque da /stato, e `esiste`
  // resterebbe false anche se c'è un budget da mostrare.
  if (budgetStore.hasBudget) {
    await budgetStore.fetchStatoBudget(oggi.month() + 1, oggi.year());
  }
};

const loadScommesse = async () => {
  if (!canAccessScommesseFeature.value) return;
  await scommesseStore.fetchPiattaforme();
  if (scommesseStore.piattaforme.length) {
    await scommesseStore.fetchAnalisi({ da: meseStart, a: oggiStr });
  }
};

const loadInvestimenti = async () => {
  if (!canAccessInvestimentiFeature.value) return;
  await investimentiStore.fetchInvestimenti();
  if (investimentiStore.investimenti.length) {
    await investimentiStore.fetchAnalisi({
      da: oggi.subtract(6, 'month').format('YYYY-MM-DD'),
      a: oggiStr,
    });
  }
};

const loadObiettivi = () => obiettiviStore.fetchObiettivi();

const openForm = (tipo = 'uscita', mov = null) => {
  formTipo.value = tipo;
  movimentoEdit.value = mov;
  formOpen.value = true;
};

const onGettingStartedMovimento = () => {
  // Senza conti il form non ha dove registrare: si passa prima da I miei conti.
  if (contiStore.contiAttivi.length > 0) {
    openForm('uscita');
    return;
  }
  router.push('/conti');
};

const onGettingStartedHide = () => helpStore.hideGettingStarted();

const onSelectMovimento = (mov) => {
  if (mov.tipo === 'trasferimento') return;
  openForm(mov.tipo === 'entrata' ? 'entrata' : 'uscita', mov);
};

const onSaved = async () => {
  await Promise.all([
    loadConti(),
    contiStore.fetchPatrimonio(),
    checkHaMovimenti(),
    movimentiStore.fetchBilancioMese(oggi.month() + 1, oggi.year()),
    loadBudget(),
    loadDashboardMovimenti(),
    loadScommesse(),
    loadInvestimenti(),
    loadObiettivi(),
    loadPianoSmartHome(),
    // Senza, il numero in cima allo slide si aggiorna e la linea/variazione
    // due centimetri sotto restano sul valore vecchio finché non si ricarica
    // la pagina: due numeri della stessa schermata in contraddizione.
    overviewRef.value?.ricaricaAndamento(),
  ]);
};

onMounted(async () => {
  await Promise.all([
    loadConti(),
    contiStore.fetchPatrimonio(),
    checkHaMovimenti(),
    movimentiStore.fetchBilancioMese(oggi.month() + 1, oggi.year()),
    loadBudget(),
    loadDashboardMovimenti(),
    loadScommesse(),
    loadInvestimenti(),
    loadObiettivi(),
  ]);
});

</script>

<template>
  <div class="dashboard-view animate-fade-in">
    <DashboardHeader />

    <GettingStartedCard
      v-if="gettingStartedVisible"
      :conti-state="contiState"
      :movimenti-state="movimentiState"
      :budget-state="budgetState"
      @add-movimento="onGettingStartedMovimento"
      @hide="onGettingStartedHide"
    />

    <div class="dashboard-view__help">
      <HelpTrigger topic="dashboard-riepilogo" label="Come leggere il riepilogo" />
    </div>

    <button
      v-if="pianoSmartHome"
      type="button"
      class="dashboard-view__smart-summary"
      @click="router.push('/piano-smart')"
    >
      <span class="dashboard-view__smart-label">Quanto puoi spendere oggi?</span>
      <strong>{{ formatoEuro(pianoSmartHome.current.availableToSpend) }}</strong>
      <small v-if="pianoSmartHome.current.dailyLimit !== null">
        Circa {{ formatoEuro(pianoSmartHome.current.dailyLimit) }} al giorno
      </small>
      <span class="dashboard-view__smart-link">Apri Piano Smart →</span>
    </button>

    <WOverviewCarousel
      ref="overviewRef"
      :conti="contiStore.contiAttivi"
      :patrimonio="contiStore.patrimonioTotale"
      :composizione="contiStore.composizionePatrimonio"
      :entrate-mese="entrateMese"
      :uscite-mese="usciteMese"
      :entrate-oggi="movimentiStore.entrateOggi"
      :uscite-oggi="movimentiStore.usciteOggi"
      :has-budget="budgetStore.hasBudget"
      :budget-stato="budgetStore.statoBudget"
      :budget-totale="budgetTotale"
      :mostra-scommesse="canAccessScommesseFeature"
      :scommesse-attivo="scommesseAttivo"
      :scommesse-analisi="scommesseStore.analisi"
      :mostra-investimenti="canAccessInvestimentiFeature"
      :investimenti-attivo="investimentiAttivo"
      :investimenti-analisi="investimentiStore.analisi"
      :patrimonio-investimenti="investimentiStore.patrimonioInvestitoTotale"
      :rendimento-investimenti="investimentiStore.rendimentoTotale"
      :rendimento-investimenti-pct="investimentiStore.rendimentoTotalePercentuale"
      :obiettivi-attivi="obiettiviStore.obiettivi.attivi"
      :obiettivi-completati-count="obiettiviStore.obiettivi.completati.length"
      :stato-saldo="statoSaldo"
      :last-updated-saldo="lastUpdatedSaldo"
      :stato-conti="contiStore.risorsaConti.stato"
      :last-updated-conti="contiStore.risorsaConti.lastUpdated"
      :stato-oggi="movimentiStore.risorsaOggi.stato"
      :last-updated-oggi="movimentiStore.risorsaOggi.lastUpdated"
      :stato-budget-sezione="budgetStore.statoPagina"
      :last-updated-budget="budgetStore.lastUpdatedPagina"
      :stato-scommesse="statoScommesse"
      :last-updated-scommesse="lastUpdatedScommesse"
      :stato-investimenti="investimentiStore.risorsaInvestimenti.stato"
      :last-updated-investimenti="investimentiStore.risorsaInvestimenti.lastUpdated"
      :stato-obiettivi="obiettiviStore.risorsaObiettivi.stato"
      :last-updated-obiettivi="obiettiviStore.risorsaObiettivi.lastUpdated"
      @riprova-saldo="riprovaSaldo()"
      @riprova-conti="contiStore.risorsaConti.riprova()"
      @riprova-oggi="movimentiStore.risorsaOggi.riprova()"
      @riprova-budget="budgetStore.riprovaPagina()"
      @riprova-scommesse="riprovaScommesse()"
      @riprova-investimenti="investimentiStore.risorsaInvestimenti.riprova()"
      @riprova-obiettivi="obiettiviStore.risorsaObiettivi.riprova()"
    />

    <button type="button" class="dashboard-view__cta" @click="openForm('uscita')">
      + Aggiungi transazione
    </button>

    <RecentTransactions
      :movimenti="recentiHome"
      :stato="movimentiStore.risorsaRecenti.stato"
      :last-updated="movimentiStore.risorsaRecenti.lastUpdated"
      @riprova="movimentiStore.risorsaRecenti.riprova()"
      @select="onSelectMovimento"
    />

    <MovimentoForm
      :open="formOpen"
      :tipo="formTipo"
      :movimento="movimentoEdit"
      @close="formOpen = false; movimentoEdit = null"
      @saved="onSaved"
    />
  </div>
</template>

<style scoped>
.dashboard-view {
  max-width: 640px;
  margin: 0 auto;
  padding-bottom: 1rem;
}

.dashboard-view__help {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 0.625rem;
}

.dashboard-view__smart-summary {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  width: 100%;
  gap: .25rem;
  padding: 1.1rem 1.25rem;
  margin-bottom: 1rem;
  border: 1px solid var(--glass-interactive-border);
  border-radius: var(--radius-lg);
  background: var(--glass-interactive-bg);
  color: var(--text-primary);
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.dashboard-view__smart-summary strong { font-size: 1.7rem; }
.dashboard-view__smart-label, .dashboard-view__smart-summary small { color: var(--text-secondary); font-size: var(--text-sm); }
.dashboard-view__smart-link { margin-top: .35rem; color: var(--accent-text); font-size: var(--text-xs); font-weight: 700; }

/* L'azione principale della dashboard: pastiglia ad alto contrasto, chiara
   sul tema scuro e scura sul chiaro. La gerarchia arriva dal contrasto, non
   da un colore acceso in più. */
.dashboard-view__cta {
  display: block;
  width: 100%;
  min-height: 52px;
  padding: 1rem 1.5rem;
  margin-bottom: 1.25rem;
  border: none;
  border-radius: var(--radius-pill);
  background: var(--cta-bg);
  color: var(--cta-text);
  font-size: 0.9375rem;
  font-weight: 600;
  letter-spacing: var(--tracking-tight);
  font-family: inherit;
  cursor: pointer;
  transition:
    transform var(--dur-fast) var(--ease-out),
    background var(--dur-base) var(--ease-out),
    box-shadow var(--dur-base) var(--ease-out);
  box-shadow: var(--shadow-sm);
}

@media (hover: hover) {
  .dashboard-view__cta:hover {
    background: var(--cta-bg-hover);
    transform: translateY(-1px);
    box-shadow: var(--shadow-md);
  }
}

.dashboard-view__cta:active {
  transform: scale(0.985);
  box-shadow: var(--shadow-xs);
}

.dashboard-view__cta:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
}

@media (min-width: 768px) {
  .dashboard-view {
    max-width: 720px;
  }
}
</style>
