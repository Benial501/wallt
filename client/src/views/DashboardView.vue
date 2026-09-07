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
import { useAnalisiStore } from '@/stores/analisi.store';
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
const analisiStore = useAnalisiStore();
const scommesseStore = useScommesseStore();
const investimentiStore = useInvestimentiStore();
const obiettiviStore = useObiettiviStore();
const helpStore = useHelpStore();
const router = useRouter();
const { canAccessScommesseFeature, canAccessInvestimentiFeature } = storeToRefs(authStore);
const { recentiHome, loadingRecenti } = storeToRefs(movimentiStore);
const { gettingStartedVisible } = storeToRefs(helpStore);

const oggi = dayjs();
const meseStart = oggi.startOf('month').format('YYYY-MM-DD');
const oggiStr = oggi.format('YYYY-MM-DD');

const formOpen = ref(false);
const formTipo = ref('uscita');
const movimentoEdit = ref(null);
const loadingOggi = ref(false);
const loadingScommesse = ref(false);
const loadingInvestimenti = ref(false);

const entrateOggi = ref(0);
const usciteOggi = ref(0);

// Traguardi di "Primi passi": marcati solo su dati caricati con successo.
// null = non ancora noto (o richiesta fallita) → stato "sconosciuto".
const contiCaricati = ref(null);
const budgetCaricato = ref(null);
const haMovimenti = ref(null);

const statoTraguardo = (caricato, raggiunto) => {
  if (caricato !== true) return 'sconosciuto';
  return raggiunto ? 'fatto' : 'da-fare';
};

const contiState = computed(() => statoTraguardo(contiCaricati.value, contiStore.contiAttivi.length > 0));
const movimentiState = computed(() => (
  haMovimenti.value === null ? 'sconosciuto' : (haMovimenti.value ? 'fatto' : 'da-fare')
));
const budgetState = computed(() => statoTraguardo(budgetCaricato.value, budgetStore.hasBudget));

const entrateMese = computed(() => movimentiStore.bilancioMese.entrate || 0);
const usciteMese = computed(() => movimentiStore.bilancioMese.uscite || 0);
const andamentoPunti = computed(() => analisiStore.andamentoPatrimonio.punti || []);

const scommesseAttivo = computed(() => scommesseStore.piattaforme.length > 0);
const investimentiAttivo = computed(() => investimentiStore.investimenti.length > 0);

const budgetTotale = computed(() =>
  parseFloat(budgetStore.budgetCorrente?.importo_totale) || 0,
);

const loadConti = async () => {
  try {
    await contiStore.fetchConti();
    contiCaricati.value = true;
  } catch {
    contiCaricati.value = false;
  }
};

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

const loadDashboardMovimenti = async () => {
  loadingOggi.value = true;
  try {
    await Promise.all([
      movimentiStore.fetchRecentiHome({ limit: 6 }),
      (async () => {
        try {
          const { data: monthData } = await api.get('/movimenti', {
            params: { da: meseStart, a: oggiStr, limit: 200 },
          });
          let entOggi = 0;
          let uscOggi = 0;
          (monthData?.gruppi || []).forEach((g) => {
            if (g.data === oggiStr) {
              entOggi = g.totale_entrate_giorno;
              uscOggi = g.totale_uscite_giorno;
            }
          });
          entrateOggi.value = entOggi;
          usciteOggi.value = uscOggi;
        } catch {
          // Mantieni i totali già mostrati se la richiesta fallisce.
        }
      })(),
    ]);
  } finally {
    loadingOggi.value = false;
  }
};

const loadBudget = async () => {
  try {
    await budgetStore.fetchBudget(oggi.month() + 1, oggi.year());
    budgetCaricato.value = true;
  } catch {
    budgetCaricato.value = false;
  }
  if (budgetStore.esiste) {
    await budgetStore.fetchStatoBudget(oggi.month() + 1, oggi.year()).catch(() => null);
  }
};

const loadAnalisi = async () => {
  await analisiStore.fetchAndamentoPatrimonio('3m').catch(() => null);
};

const loadScommesse = async () => {
  if (!canAccessScommesseFeature.value) return;
  loadingScommesse.value = true;
  try {
    await scommesseStore.fetchPiattaforme();
    if (scommesseStore.piattaforme.length) {
      await scommesseStore.fetchAnalisi({ da: meseStart, a: oggiStr });
    }
  } catch {
    // Ignora: la card scommesse resta nello stato precedente.
  } finally {
    loadingScommesse.value = false;
  }
};

const loadInvestimenti = async () => {
  if (!canAccessInvestimentiFeature.value) return;
  loadingInvestimenti.value = true;
  try {
    await investimentiStore.fetchInvestimenti();
    if (investimentiStore.investimenti.length) {
      await investimentiStore.fetchAnalisi({
        da: oggi.subtract(6, 'month').format('YYYY-MM-DD'),
        a: oggiStr,
      });
    }
  } catch {
    // Ignora: la card investimenti resta nello stato precedente.
  } finally {
    loadingInvestimenti.value = false;
  }
};

const loadObiettivi = async () => {
  await obiettiviStore.fetchObiettivi().catch(() => null);
};

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
    loadAnalisi(),
    loadScommesse(),
    loadInvestimenti(),
    loadObiettivi(),
  ]);
};

onMounted(async () => {
  await Promise.all([
    loadConti(),
    contiStore.fetchPatrimonio().catch(() => null),
    checkHaMovimenti(),
    movimentiStore.fetchBilancioMese(oggi.month() + 1, oggi.year()),
    loadBudget(),
    loadDashboardMovimenti(),
    loadAnalisi(),
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

    <WOverviewCarousel
      :conti="contiStore.contiAttivi"
      :loading-conti="contiStore.loading"
      :patrimonio="contiStore.patrimonioTotale"
      :entrate-mese="entrateMese"
      :uscite-mese="usciteMese"
      :entrate-oggi="entrateOggi"
      :uscite-oggi="usciteOggi"
      :variazione-percentuale="contiStore.variazionePercentuale"
      :trend-positive="contiStore.variazioneImporto >= 0"
      :andamento-punti="andamentoPunti"
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
      :loading-saldo="contiStore.loading || movimentiStore.loadingBilancio"
      :loading-budget="budgetStore.loading"
      :loading-oggi="loadingOggi && !recentiHome.length"
      :loading-scommesse="loadingScommesse"
      :loading-investimenti="loadingInvestimenti"
      :obiettivi-attivi="obiettiviStore.obiettivi.attivi"
      :obiettivi-completati-count="obiettiviStore.obiettivi.completati.length"
      :loading-obiettivi="obiettiviStore.loading"
    />

    <button type="button" class="dashboard-view__cta" @click="openForm('uscita')">
      + Aggiungi transazione
    </button>

    <RecentTransactions
      :movimenti="recentiHome"
      :loading="loadingRecenti && !recentiHome.length"
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

.dashboard-view__cta {
  display: block;
  width: 100%;
  padding: 1rem 1.5rem;
  margin-bottom: 1.25rem;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--cta-bg);
  color: var(--cta-text);
  font-size: 0.9375rem;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
  transition: transform 300ms ease-out, background 300ms ease-out;
  box-shadow: var(--shadow-sm);
}

.dashboard-view__cta:hover {
  background: var(--cta-bg-hover);
  transform: translateY(-1px);
}

.dashboard-view__cta:active {
  transform: scale(0.99);
}

@media (min-width: 768px) {
  .dashboard-view {
    max-width: 720px;
  }
}
</style>
