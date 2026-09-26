<script setup>
import { computed, onMounted, ref } from 'vue';
import { storeToRefs } from 'pinia';
import { useRouter } from 'vue-router';
import WCard from '@/components/common/WCard.vue';
import WButton from '@/components/common/WButton.vue';
import AppDialog from '@/components/common/AppDialog.vue';
import PianoSmartGuide from '@/components/piano-smart/PianoSmartGuide.vue';
import { usePianoSmartStore } from '@/stores/pianoSmart.store';
import { useToastStore } from '@/stores/toast.store';
import { CircleHelp, Trash2 } from '@/utils/appIcons';
import { simulatePurchase, purchaseAmountCents } from '@/utils/pianoSmartSimulation';
import { GLOSSARIO } from '@/content/glossario';
import {
  ORIGINI_SOMMA,
  STATI_PIANO,
  TRANSIZIONI_STATO,
  AZIONE_STATO,
  CATEGORIA_CONCETTO,
  formattaEuro,
  formattaPercentuale,
  importoInCentesimi,
} from '@/utils/pianoSmart';

/**
 * Piano Smart: raccoglie l'importo e il contesto, mostra la ripartizione che
 * il backend propone, permette di modificarla e la salva.
 *
 * Questa view NON calcola il piano. Non decide percentuali, non stima la
 * copertura del fondo, non pesa gli obiettivi: tutto arriva da
 * `POST /api/piano-smart/preview`. L'unico conto che fa è se le quote
 * modificate dall'utente tornano al totale dichiarato dal backend, e lo fa in
 * centesimi interi (vedi lo store).
 */
const store = usePianoSmartStore();
const router = useRouter();
const toast = useToastStore();
const {
  state, input, readiness, preview, v2Preview, recommendedAllocations, finalAllocations,
  plans, selectedPlan, error, questions, warnings,
  currentSituation, currentSituationState,
  capitalToAllocate, allocationDifferenceCents, hasNegativeAllocation,
  isZeroCapital, canSave,
} = storeToRefs(store);

const tab = ref('situation');
const step = ref(1);
const infoAperta = ref(false);
const dettaglioAperto = ref(false);
const confermaEliminazione = ref(false);
const eliminazioneInCorso = ref(false);
const simulatoreImporto = ref('');

const ORIGINI = ORIGINI_SOMMA;

// --- validazioni di forma, non di dominio ---------------------------------
const importoCents = computed(() => importoInCentesimi(input.value.amount));
const importoValido = computed(() => importoCents.value !== null && importoCents.value > 0);
const origineValida = computed(() => Boolean(input.value.sourceType));
const ricorrenzaValida = computed(() => typeof input.value.recurring === 'boolean');
const spesePositive = computed(() => {
  const cents = importoInCentesimi(input.value.mandatoryExpenses);
  return cents === null || cents >= 0;
});
const puoContinuare = computed(() => importoValido.value && origineValida.value
  && ricorrenzaValida.value && spesePositive.value);

const suggerimentoSpese = computed(() => readiness.value?.suggestedMandatoryExpenses ?? null);

// --- etichette -------------------------------------------------------------
const etichettaCategoria = (categoria) => GLOSSARIO[CATEGORIA_CONCETTO[categoria]]?.etichetta
  ?? categoria;
const descrizioneCategoria = (categoria) => GLOSSARIO[CATEGORIA_CONCETTO[categoria]]?.descrizione
  ?? '';
const etichettaOrigine = (value) => ORIGINI.find((o) => o.value === value)?.label ?? value ?? 'Entrata';
const etichettaStato = (value) => STATI_PIANO[value] ?? value;
const statoCompletato = Object.keys(STATI_PIANO).find((value) => STATI_PIANO[value] === 'Completato');
const simulazione = computed(() => simulatePurchase(currentSituation.value, simulatoreImporto.value));
const simulatoreErrore = computed(() => simulatoreImporto.value !== '' && purchaseAmountCents(simulatoreImporto.value) === null);
const formattaCentesimi = (value) => formattaEuro(value === null ? null : value / 100);
const formattaScadenza = (value) => new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${value}T12:00:00Z`));
const qualitaPrevisione = computed(() => ({ dati_insufficienti: 'Previsione non disponibile', storico_limitato: 'Storico ancora limitato', storico_disponibile: 'Storico disponibile' })[currentSituation.value?.forecast.quality]);
const margineGiornaliero = computed(() => {
  const ritmo = importoInCentesimi(currentSituation.value?.current?.actualDailySpend);
  const limite = importoInCentesimi(currentSituation.value?.current?.dailyLimit);
  if (ritmo === null || limite === null) return null;
  return limite - ritmo;
});
const usaSimulazioneRapida = (amount) => { simulatoreImporto.value = String(amount); };

/** Motivazioni indicizzate per codice: serve a mostrare sotto una categoria
 * solo quelle che il backend ha davvero emesso per lei. */
const motivazioniPerCodice = computed(() => {
  const mappa = new Map();
  (preview.value?.reasons ?? []).forEach((r) => mappa.set(r.code, r));
  return mappa;
});
const motiviCategoria = (allocazione) => (allocazione.reasonCodes ?? [])
  .map((code) => motivazioniPerCodice.value.get(code))
  .filter(Boolean);

const raccomandata = (categoria) => recommendedAllocations.value
  .find((voce) => voce.category === categoria);

/** Il breakdown per obiettivo lo produce il backend: qui si legge soltanto. */
const obiettiviDellaQuota = computed(() => {
  const goals = finalAllocations.value.find((voce) => voce.category === 'goals');
  return goals?.metadata?.goals ?? [];
});

const differenzaTesto = computed(() => {
  const cents = allocationDifferenceCents.value;
  if (hasNegativeAllocation.value) return 'Una quota è negativa: correggila per salvare.';
  if (cents === 0) return 'Totale distribuito correttamente.';
  if (cents > 0) return `Ancora da distribuire: ${formattaEuro(cents / 100)}`;
  return `Hai superato il totale di ${formattaEuro(Math.abs(cents) / 100)}`;
});
const differenzaNonValida = computed(
  () => allocationDifferenceCents.value !== 0 || hasNegativeAllocation.value,
);

// --- riepilogo del contesto ------------------------------------------------
/** Una manciata di aggregati leggibili invece dell'oggetto intero: prima
 * dell'integrazione `contextSummary` finiva dentro un <p> e si leggeva
 * "[object Object]". */
const datiUtilizzati = computed(() => {
  const c = preview.value?.contextSummary;
  if (!c) return [];
  const mesi = c.period?.averageMonths;
  return [
    {
      etichetta: 'Mesi completi usati per le medie',
      valore: mesi?.count ? `${mesi.count} (${mesi.from} → ${mesi.to})` : 'nessuno',
    },
    { etichetta: 'Entrate ricorrenti al mese', valore: formattaEuro(c.income?.recurringMonthlyAverage) },
    { etichetta: 'Spese essenziali al mese', valore: formattaEuro(c.expenses?.essentialMonthlyAverage) },
    { etichetta: 'Risparmio mensile', valore: formattaEuro(c.cashFlow?.monthlySavings) },
    { etichetta: 'Liquidità disponibile', valore: formattaEuro(c.liquidity?.allocatable) },
    {
      etichetta: 'Fondo di sicurezza',
      valore: c.emergencyFund?.status === 'assente'
        ? 'non impostato'
        : `${formattaEuro(c.emergencyFund?.current)} di ${formattaEuro(c.emergencyFund?.target)}`,
    },
    { etichetta: 'Obiettivi attivi', valore: String(c.goals?.active ?? 0) },
  ];
});

// --- azioni ----------------------------------------------------------------
const scegliOrigine = (event) => {
  const scelta = ORIGINI.find((o) => o.value === event.target.value);
  // Propone una ricorrenza coerente con l'origine, senza deciderla: resta una
  // risposta esplicita dell'utente perché cambia la ripartizione.
  if (scelta && input.value.recurring === null) input.value.recurring = scelta.ricorrentePerDefault;
};

const continua = async () => {
  if (!puoContinuare.value) return;
  if (!readiness.value) await store.loadReadiness();
  if (questions.value.length) {
    step.value = 2;
    return;
  }
  // Senza domande si va dritti al piano. Prima dell'integrazione si passava a
  // step 3 senza generare niente, e la pagina restava vuota.
  step.value = 3;
  await store.generatePreview();
};

const generaPiano = async () => {
  step.value = 3;
  await store.generatePreview();
};

/** Passo precedente. Da 3 si torna alle domande solo se ce n'erano davvero:
 * senza domande lo step 2 non è mai stato mostrato e sarebbe una schermata
 * vuota. Tornare indietro non azzera nulla — importo, risposte e piano già
 * calcolato restano in memoria finché l'utente non li rigenera. */
const passoPrecedente = computed(() => {
  if (step.value === 3) return questions.value.length ? 2 : 1;
  if (step.value === 2) return 1;
  return null;
});
const inCorso = computed(() => state.value === 'generating'
  || state.value === 'contextLoading' || state.value === 'saving');
const indietro = () => {
  if (passoPrecedente.value && !inCorso.value) step.value = passoPrecedente.value;
};

const generaAnalisiEvoluta = async () => {
  if (!puoContinuare.value) return;
  step.value = 3;
  await store.generateV2Preview();
};

const salva = async () => {
  const salvato = await store.savePlan();
  if (!salvato) return;
  toast.success('Piano Smart salvato.');
  tab.value = 'history';
  await store.loadPlans();
};

const apriStorico = async () => {
  tab.value = 'history';
  await store.loadPlans();
};

const apriDettaglio = async (id) => {
  const piano = await store.loadPlan(id);
  if (piano) dettaglioAperto.value = true;
};

const statiPossibili = computed(
  () => TRANSIZIONI_STATO[selectedPlan.value?.status] ?? [],
);

const cambiaStato = async (nuovoStato) => {
  if (!selectedPlan.value?.id) return;
  const esito = await store.updateStatus(selectedPlan.value.id, nuovoStato);
  if (esito) toast.success(`Piano ${etichettaStato(nuovoStato).toLowerCase()}.`);
};

const eliminaPiano = () => {
  if (!selectedPlan.value?.id) return;
  confermaEliminazione.value = true;
};

const confermaEdEliminaPiano = async () => {
  if (!selectedPlan.value?.id) return;
  eliminazioneInCorso.value = true;
  try {
    const eliminato = await store.deletePlan(selectedPlan.value.id);
    if (eliminato) {
      confermaEliminazione.value = false;
      dettaglioAperto.value = false;
      toast.success('Piano Smart eliminato.');
    }
  } finally {
    eliminazioneInCorso.value = false;
  }
};

const ricomincia = () => {
  store.reset();
  store.loadReadiness();
  store.loadCurrentSituation();
  step.value = 1;
  tab.value = 'create';
};

const eseguiSuggerimento = (suggestion) => {
  const type = suggestion?.action?.type;
  if (type === 'open-analysis') router.push('/analisi');
  if (type === 'create-plan') {
    tab.value = 'create';
    step.value = 1;
  }
};

onMounted(() => {
  // La readiness serve già allo step 1: propone le spese obbligatorie e
  // anticipa gli avvisi sullo storico.
  store.loadReadiness();
  store.loadCurrentSituation();
});
</script>

<template>
  <div class="piano-view">
    <header class="page-header">
      <div>
        <div class="page-title-row">
          <h1 class="page-title">Piano Smart</h1>
          <button
            class="info-button" type="button" aria-label="Apri la guida di Piano Smart"
            title="Come funziona Piano Smart" @click="infoAperta = true"
          >
            <CircleHelp :size="18" :stroke-width="1.8" aria-hidden="true" />
          </button>
        </div>
        <p class="page-sub">
          Capisci cosa sta succedendo ai tuoi soldi e decidi meglio come muoverti.
        </p>
      </div>
    </header>

    <div class="tabs" role="tablist">
      <button
        type="button" role="tab" :aria-selected="tab === 'situation'"
        :class="{ active: tab === 'situation' }" @click="tab = 'situation'"
      >
        Situazione attuale
      </button>
      <button
        type="button" role="tab" :aria-selected="tab === 'create'"
        :class="{ active: tab === 'create' }" @click="tab = 'create'"
      >
        Crea piano
      </button>
      <button
        type="button" role="tab" :aria-selected="tab === 'history'"
        :class="{ active: tab === 'history' }" @click="apriStorico"
      >
        I miei piani
      </button>
    </div>

    <template v-if="tab === 'situation'">
      <div v-if="currentSituationState === 'loading'" class="loading">Sto leggendo la tua situazione…</div>
      <div v-else-if="currentSituationState === 'error'" class="error">{{ error?.message || 'Non riesco a recuperare la situazione.' }}</div>
      <template v-else-if="currentSituation">
        <WCard class="situation-hero">
          <p class="hero-kicker">Situazione oggi</p>
          <p class="muted">Puoi spendere</p>
          <strong>{{ formattaEuro(currentSituation.current.dailyLimit) }}</strong>
          <p class="hero-today">oggi</p>
          <p>Limite indicativo, in base ai dati registrati</p>
          <div class="safe-to-spend">
            <div><span>Liquidità dei conti</span><strong>{{ formattaEuro(currentSituation.current.liquidity) }}</strong></div>
            <div><span>Da proteggere</span><strong>{{ formattaEuro(currentSituation.current.protectedAmount) }}</strong></div>
            <div class="safe-to-spend__highlight"><span>Spendibile</span><strong>{{ formattaEuro(currentSituation.current.availableToSpend) }}</strong></div>
          </div>
          <details class="explanation protection-details">
            <summary>Quali somme sono protette?</summary>
            <p>Obiettivi già accantonati: {{ formattaEuro(currentSituation.current.allocatedToGoals) }}.</p>
            <p>Impegni rilevati: {{ formattaEuro(currentSituation.current.commitments) }}. Ulteriori scadenze entro fine mese: {{ formattaEuro(currentSituation.current.additionalCommitments) }}.</p>
            <p>Lo spendibile è già al netto di queste somme. Il saldo dei conti scommesse è escluso. L’importo ancora da raccogliere per il fondo di sicurezza non viene bloccato automaticamente.</p>
          </details>
          <p v-if="Number(currentSituation.current.shortfall) > 0" class="shortfall" role="status">Mancano {{ formattaEuro(currentSituation.current.shortfall) }} per coprire tutte le somme protette.</p>
          <div class="hero-availability">
            <span>{{ currentSituation.current.remainingDays }} giorni, oggi incluso, fino a fine mese</span>
          </div>
          <span class="situation-status" :class="`situation-status--${currentSituation.current.paceStatus}`">
            {{ currentSituation.current.paceStatus === 'sopra_il_ritmo' ? 'Sopra il ritmo previsto' : currentSituation.current.paceStatus === 'sotto_controllo' ? 'Ritmo entro il limite' : 'Stiamo imparando il tuo ritmo' }}
          </span>
          <div class="situation-grid">
            <div><span>Ritmo non ricorrente</span><strong>{{ formattaEuro(currentSituation.current.actualDailySpend) }}/giorno</strong></div>
            <div><span>Margine giornaliero</span><strong>{{ margineGiornaliero === null ? '—' : `${margineGiornaliero >= 0 ? '+' : ''}${formattaEuro(margineGiornaliero / 100)}` }}</strong></div>
            <div><span>Il tuo limite</span><strong>{{ formattaEuro(currentSituation.current.dailyLimit) }}/giorno</strong></div>
          </div>
        </WCard>

        <section class="situation-section" aria-labelledby="analisi-wallt-title">
          <h2 id="analisi-wallt-title">Analisi di WALLT</h2>
          <ul class="insight-list">
            <li v-for="insight in currentSituation.insights" :key="insight.key">{{ insight.text }}</li>
          </ul>
        </section>

        <WCard class="text-card">
          <h2>Previsione fine mese</h2>
          <p class="muted">Quanto potrebbe restare dello spendibile.</p>
          <div v-if="currentSituation.forecast.endOfMonthAvailable !== null" class="forecast-main"><strong>{{ formattaEuro(currentSituation.forecast.endOfMonthAvailable) }}</strong><span>a fine mese</span></div>
          <p v-else class="forecast-empty">Servono altre registrazioni per stimare il ritmo delle spese.</p>
          <div class="forecast-quality">
            <strong>{{ qualitaPrevisione }}</strong>
            <p>{{ currentSituation.forecast.observedDays }} giorni osservati nel mese · {{ currentSituation.dataQuality.completeMonths ?? 0 }} mesi civili completi nello storico.</p>
            <p v-for="warning in currentSituation.warnings" :key="warning" class="hint">{{ warning }}</p>
          </div>
          <details class="explanation">
            <summary>Come viene calcolata?</summary>
            <p>Partiamo dalla liquidità dei conti, al netto degli obiettivi accantonati e degli impegni rilevati. Stimiamo le spese non ricorrenti rimanenti usando il ritmo dei giorni osservati di questo mese, oggi incluso.</p>
            <p>Le ricorrenze vengono considerate separatamente e una sola volta. Le entrate future, le rate non collegate a ricorrenze e gli eventi non registrati non sono inclusi. La previsione resta una stima, non un saldo garantito.</p>
          </details>
        </WCard>

        <WCard class="text-card">
          <h2>Prossime uscite</h2>
          <p class="muted">Da oggi al {{ formattaScadenza(currentSituation.upcoming.through) }}.</p>
          <template v-if="currentSituation.upcoming.items.length">
            <div v-for="item in currentSituation.upcoming.items" :key="item.occurrenceKey" class="upcoming-row">
              <span><strong>{{ item.description || 'Spesa ricorrente' }}</strong><small>{{ formattaScadenza(item.dueDate) }}</small></span>
              <strong>{{ formattaEuro(item.amount) }}</strong>
            </div>
            <div class="upcoming-total"><span>Totale previsto</span><strong>{{ formattaEuro(currentSituation.upcoming.total) }}</strong></div>
            <p class="hint">Queste uscite sono già protette. Il margine al netto degli impegni è {{ formattaEuro(currentSituation.upcoming.afterTotal) }}: non le sottraiamo una seconda volta.</p>
          </template>
          <p v-else class="muted">Non risultano altre uscite ricorrenti entro fine mese.</p>
        </WCard>

        <section class="situation-section month-progress" aria-labelledby="andamento-mese-title">
          <h2 id="andamento-mese-title">Andamento del mese</h2>
          <div class="progress-line"><span>Entrate</span><strong>{{ formattaEuro(currentSituation.monthProgress.income) }}</strong></div>
          <div class="progress-track"><i :style="{ width: `${currentSituation.monthProgress.incomeShare}%` }" /></div>
          <div class="progress-line"><span>Uscite</span><strong>{{ formattaEuro(currentSituation.monthProgress.expenses) }}</strong></div>
          <div class="progress-track progress-track--expenses"><i :style="{ width: `${currentSituation.monthProgress.expenseShare}%` }" /></div>
          <div class="progress-line"><span>Risparmio medio storico / mese</span><strong>{{ formattaEuro(currentSituation.forecast.monthlySavings) }}</strong></div>
          <p class="hint">Limite giornaliero: {{ formattaEuro(currentSituation.current.dailyLimit) }} · {{ currentSituation.current.remainingDays }} giorni rimanenti</p>
        </section>

        <WCard class="text-card">
          <h2>Cosa fare adesso</h2>
          <p v-if="!currentSituation.suggestions.length" class="muted">Non ci sono azioni urgenti: continua a monitorare il mese.</p>
          <div v-for="suggestion in currentSituation.suggestions" :key="suggestion.key" class="suggestion-row">
            <strong>{{ suggestion.title }}</strong>
            <p>{{ suggestion.reason }}</p>
            <small>{{ suggestion.effect }}</small>
            <WButton
              v-if="suggestion.action" variant="secondary" size="small"
              @click="eseguiSuggerimento(suggestion)"
            >
              {{ suggestion.action.type === 'open-analysis' ? 'Apri analisi' : 'Crea un piano' }}
            </WButton>
          </div>
        </WCard>


        <section class="situation-section simulator" aria-labelledby="simulatore-title">
          <h2 id="simulatore-title">Prima di spendere</h2>
          <p class="muted">Vuoi sapere come cambierebbe il tuo mese?</p>
          <div class="simulator-form">
            <label for="simulatore-importo">Importo dell’acquisto</label>
            <input id="simulatore-importo" v-model="simulatoreImporto" inputmode="decimal" placeholder="0,00 €" :aria-invalid="simulatoreErrore" aria-describedby="simulatore-help">
            <p id="simulatore-help" :class="simulatoreErrore ? 'field-error' : 'hint'">{{ simulatoreErrore ? 'Inserisci un importo positivo con al massimo due decimali.' : 'Una spesa aggiuntiva rispetto al ritmo previsto. Nessun movimento viene registrato.' }}</p>
            <div class="simulator-quick" aria-label="Importi rapidi">
              <button v-for="amount in [50, 100, 250, 500]" :key="amount" type="button" @click="usaSimulazioneRapida(amount)">{{ amount }} €</button>
            </div>
          </div>
          <div v-if="simulazione" class="simulator-result" :class="`simulator-result--${simulazione.status}`" aria-live="polite" aria-atomic="true">
            <strong>{{ simulazione.status === 'compatibile' ? 'Entro il limite stimato' : simulazione.status === 'attenzione' ? 'Riduce il margine' : simulazione.status === 'non_stimabile' ? 'Effetto sul mese non ancora stimabile' : 'Potrebbe compromettere il piano' }}</strong>
            <table class="simulation-comparison">
              <caption class="sr-only">Confronto prima e dopo una spesa di {{ formattaCentesimi(simulazione.amount) }}</caption>
              <thead><tr><th scope="col">Il tuo piano</th><th scope="col">Prima</th><th scope="col">Dopo</th></tr></thead>
              <tbody>
                <tr><th scope="row">Spendibile</th><td>{{ formattaEuro(currentSituation.current.availableToSpend) }}</td><td>{{ formattaCentesimi(simulazione.availableAfter) }}</td></tr>
                <tr><th scope="row">Fine mese</th><td>{{ formattaEuro(currentSituation.forecast.endOfMonthAvailable) }}</td><td>{{ formattaCentesimi(simulazione.forecastAfter) }}</td></tr>
                <tr><th scope="row">Limite / giorno</th><td>{{ formattaEuro(currentSituation.current.dailyLimit) }}</td><td>{{ formattaCentesimi(simulazione.dailyAfter) }}</td></tr>
              </tbody>
            </table>
            <span class="simulator-result__impact">Impatto sullo spendibile: {{ simulazione.impact }}</span>
            <p v-if="simulazione.availableAfter < 0" class="hint">Mancano {{ formattaCentesimi(-simulazione.availableAfter) }} per coprire l’acquisto e le somme protette.</p>
            <p v-if="simulazione.forecastAfter === null" class="hint">Puoi confrontare lo spendibile, ma i dati non bastano per valutare la fine del mese.</p>
            <details class="explanation"><summary>Come leggere l’impatto?</summary><p>Basso: fino al 20% dello spendibile. Moderato: fino al 45%. Alto: oltre il 45%. È la quota utilizzata dall’acquisto, non una misura di sicurezza.</p></details>
          </div>
          <p v-else-if="currentSituation.current.availableToSpend === null" class="hint">La simulazione sarà disponibile quando potremo calcolare lo spendibile.</p>
        </section>
        <WCard class="text-card">
          <h2>La tua direzione finanziaria</h2>
          <div class="situation-grid situation-grid--secondary">
            <div><span>Patrimonio netto</span><strong>{{ formattaEuro(currentSituation.financialDirection.netWorth) }}</strong></div>
            <div><span>Debiti residui</span><strong>{{ formattaEuro(currentSituation.financialDirection.debts?.totalOutstanding) }}</strong></div>
            <div><span>Obiettivi attivi</span><strong>{{ currentSituation.financialDirection.goals.filter((goal) => goal.stato !== statoCompletato).length }}</strong></div>
          </div>
        </WCard>

      </template>
    </template>

    <!-- ================= CREA PIANO ================= -->
    <template v-if="tab === 'create'">
      <ol class="steps" aria-label="Avanzamento del piano">
        <li
          v-for="passo in [
            { n: 1, label: 'Importo' },
            { n: 2, label: 'Contesto' },
            { n: 3, label: 'Il tuo piano' },
          ]"
          :key="passo.n" :class="{ active: step >= passo.n }"
        >
          <!-- Solo all'indietro: tornare avanti richiede il pulsante che
               rigenera il piano, altrimenti si mostrerebbe un piano vecchio
               calcolato su importi nel frattempo cambiati. -->
          <button
            v-if="passo.n < step" type="button" class="steps__link"
            :disabled="inCorso" @click="step = passo.n"
          >
            <span aria-hidden="true">{{ passo.n }}</span> {{ passo.label }}
          </button>
          <span v-else><span aria-hidden="true">{{ passo.n }}</span> {{ passo.label }}</span>
        </li>
      </ol>

      <!-- ---------- Step 1: importo e origine ---------- -->
      <WCard v-if="step === 1" class="flow-card">
        <h2>Quanto vuoi organizzare?</h2>
        <p class="muted">Inserisci la nuova somma che vuoi distribuire.</p>

        <div class="field">
          <label for="smart-amount">Importo</label>
          <div class="amount-input">
            <span aria-hidden="true">€</span>
            <input
              id="smart-amount" v-model="input.amount" type="number"
              inputmode="decimal" min="0" step="0.01" placeholder="0,00"
              :aria-invalid="input.amount !== '' && !importoValido"
              aria-describedby="smart-amount-error"
            >
          </div>
          <p
            v-if="input.amount !== '' && !importoValido" id="smart-amount-error"
            class="field-error" role="alert"
          >
            Inserisci un importo maggiore di zero, con al massimo due decimali.
          </p>
        </div>

        <div class="field">
          <label for="smart-source">Da dove arriva questa somma?</label>
          <select id="smart-source" v-model="input.sourceType" @change="scegliOrigine">
            <option value="">Seleziona</option>
            <option v-for="origine in ORIGINI" :key="origine.value" :value="origine.value">
              {{ origine.label }}
            </option>
          </select>
        </div>

        <fieldset class="field">
          <legend>Questa entrata si ripeterà?</legend>
          <div class="choice-row">
            <label><input v-model="input.recurring" type="radio" name="smart-recurring" :value="true"> Sì</label>
            <label><input v-model="input.recurring" type="radio" name="smart-recurring" :value="false"> No</label>
          </div>
          <p class="hint">Cambia la proposta: una somma che si ripete deve coprire il mese che comincia.</p>
        </fieldset>

        <div class="field">
          <label for="smart-expenses">Spese obbligatorie da coprire con questa somma</label>
          <input
            id="smart-expenses" v-model="input.mandatoryExpenses" type="number"
            inputmode="decimal" min="0" step="0.01" placeholder="0,00"
          >
          <p v-if="suggerimentoSpese?.supported" class="hint">
            WALLT ha trovato {{ formattaEuro(suggerimentoSpese.amount) }} di ricorrenze
            di questo periodo non ancora addebitate. Puoi confermarle o correggerle.
          </p>
        </div>

        <p class="capital">
          Capitale da organizzare: <strong>{{ formattaEuro(capitalToAllocate) }}</strong>
        </p>

        <WButton variant="primary" size="lg" :disabled="!puoContinuare" @click="continua">
          Continua
        </WButton>
      </WCard>

      <!-- ---------- Step 2: domande dinamiche ---------- -->
      <WCard v-else-if="step === 2" class="flow-card">
        <h2>Completiamo il contesto</h2>
        <p class="muted">
          WALLT chiede solo quello che non sa già. Le risposte valgono per questo piano
          e non modificano i tuoi movimenti, conti o obiettivi.
        </p>

        <div v-if="state === 'contextLoading'" class="loading" role="status">
          Analizzo la tua situazione…
        </div>

        <template v-else>
          <div v-for="domanda in questions" :key="domanda.key" class="field">
            <label :for="`q-${domanda.key}`">{{ domanda.label }}</label>
            <p :id="`q-${domanda.key}-desc`" class="hint">{{ domanda.description }}</p>
            <input
              :id="`q-${domanda.key}`"
              v-model="input.manualContextAnswers[domanda.key]"
              type="number" inputmode="decimal"
              :min="domanda.validation?.min ?? 0" step="0.01" placeholder="0,00"
              :aria-describedby="`q-${domanda.key}-desc`"
            >
          </div>
          <p class="hint">Puoi anche proseguire senza rispondere: il piano sarà più prudente.</p>
          <div class="actions">
            <WButton variant="secondary" size="lg" :disabled="inCorso" @click="indietro">
              Indietro
            </WButton>
            <WButton
              variant="primary" size="lg" :loading="state === 'generating'"
              @click="generaPiano"
            >
              Crea il mio piano
            </WButton>
          </div>
        </template>
      </WCard>

      <!-- ---------- Step 3: il piano ---------- -->
      <section v-else class="result">
        <WCard v-if="state === 'generating' || state === 'contextLoading'" class="loading" role="status">
          Sto costruendo il tuo Piano Smart…
        </WCard>

        <WCard v-else-if="error" class="error" role="alert">
          <p>{{ error.message }}</p>
          <ul v-if="error.details?.length" class="error-details">
            <li v-for="dettaglio in error.details" :key="dettaglio">{{ dettaglio }}</li>
          </ul>
          <div class="actions">
            <WButton variant="secondary" size="sm" @click="indietro">Indietro</WButton>
            <WButton variant="secondary" size="sm" @click="ricomincia">Ricomincia</WButton>
          </div>
        </WCard>

        <template v-else-if="preview">
          <WCard class="hero">
            <p>Il tuo Piano Smart</p>
            <strong>{{ formattaEuro(preview.incomingAmount) }}</strong>
            <span>somma ricevuta</span>
            <div class="hero-meta">
              <span>{{ formattaEuro(preview.mandatoryExpenses) }} già impegnati</span>
              <span>{{ formattaEuro(preview.allocatableCapital) }} da distribuire</span>
            </div>
          </WCard>

          <!-- Capitale zero: stato informativo, non un errore -->
          <WCard v-if="isZeroCapital" class="zero-capital" role="status">
            <h2>La somma è già interamente impegnata</h2>
            <p>
              Le spese obbligatorie che hai indicato coprono tutta l'entrata:
              non resta capitale da distribuire fra le cinque categorie.
            </p>
            <p class="muted">
              Puoi salvare comunque questo piano per tenerne traccia, oppure tornare
              indietro e correggere le spese obbligatorie.
            </p>
            <div class="actions">
              <WButton variant="secondary" @click="step = 1">Modifica gli importi</WButton>
              <WButton variant="primary" :loading="state === 'saving'" @click="salva">
                Salva comunque
              </WButton>
            </div>
          </WCard>

          <WCard v-else class="allocations">
            <h2>Come distribuire la somma</h2>

            <div class="bar" role="img" :aria-label="`Distribuzione di ${formattaEuro(preview.allocatableCapital)} fra cinque categorie`">
              <i
                v-for="voce in recommendedAllocations" :key="voce.category"
                :class="`seg seg--${voce.category}`"
                :style="{ width: `${Math.max(Number(voce.recommendedPercentage || 0), 0)}%` }"
              />
            </div>

            <div v-for="voce in finalAllocations" :key="voce.category" class="allocation">
              <div class="allocation__info">
                <strong>
                  <span :class="`dot dot--${voce.category}`" aria-hidden="true" />
                  {{ etichettaCategoria(voce.category) }}
                </strong>
                <p>{{ descrizioneCategoria(voce.category) }}</p>
                <p v-for="motivo in motiviCategoria(voce)" :key="motivo.code" class="motivo">
                  {{ motivo.titolo }}
                </p>
                <small>
                  WALLT suggerisce {{ formattaEuro(raccomandata(voce.category)?.recommendedAmount) }}
                  ({{ formattaPercentuale(raccomandata(voce.category)?.recommendedPercentage) }})
                </small>

                <ul v-if="voce.category === 'goals' && obiettiviDellaQuota.length" class="goal-breakdown">
                  <li v-for="obiettivo in obiettiviDellaQuota" :key="obiettivo.id">
                    {{ obiettivo.nome }} — {{ formattaEuro(obiettivo.amount) }}
                    <small>su {{ formattaEuro(obiettivo.remaining) }} mancanti</small>
                  </li>
                </ul>
              </div>

              <label class="allocation__input">
                <span class="sr-only">Importo per {{ etichettaCategoria(voce.category) }}</span>
                <input v-model="voce.finalAmount" type="number" inputmode="decimal" min="0" step="0.01">
              </label>
            </div>

            <p class="difference" :class="{ invalid: differenzaNonValida }" role="status" aria-live="polite">
              {{ differenzaTesto }}
            </p>

            <div class="actions">
              <WButton variant="secondary" :disabled="inCorso" @click="indietro">
                Indietro
              </WButton>
              <WButton variant="secondary" @click="generaAnalisiEvoluta">
                Analisi evoluta
              </WButton>
              <WButton variant="secondary" @click="store.resetFinalAllocations">
                Ripristina suggerimento WALLT
              </WButton>
              <WButton
                variant="primary" :disabled="!canSave" :loading="state === 'saving'"
                @click="salva"
              >
                Salva Piano Smart
              </WButton>
            </div>
          </WCard>

          <WCard v-if="preview.reasons?.length" class="text-card">
            <h2>Perché WALLT propone questa distribuzione</h2>
            <ul class="reasons">
              <li v-for="motivo in preview.reasons" :key="motivo.code">
                <strong>{{ motivo.titolo }}</strong>
                <p>{{ motivo.testo }}</p>
              </li>
            </ul>
          </WCard>

          <WCard v-if="warnings.length" class="text-card warnings">
            <h2>Da tenere presente</h2>
            <ul>
              <li v-for="avviso in warnings" :key="avviso">{{ avviso }}</li>
            </ul>
          </WCard>

          <WCard v-if="datiUtilizzati.length" class="text-card">
            <details>
              <summary>Dati utilizzati per questo piano</summary>
              <dl class="context-summary">
                <template v-for="riga in datiUtilizzati" :key="riga.etichetta">
                  <dt>{{ riga.etichetta }}</dt>
                  <dd>{{ riga.valore }}</dd>
                </template>
              </dl>
              <p class="hint">
                Affidabilità dei dati: {{ preview.dataConfidence }}. WALLT non verifica
                che tu abbia registrato tutto: conosce solo ciò che hai inserito.
              </p>
            </details>
          </WCard>

          <WCard v-if="v2Preview" class="text-card piano-v2-result">
            <h2>Analisi evoluta</h2>
            <p class="muted">Tre strategie, proiezioni e azioni preparatorie. Nessun movimento viene creato.</p>
            <p><strong>Capitale distribuibile: {{ formattaEuro(v2Preview.capital?.distributable) }}</strong></p>
            <p class="muted">{{ v2Preview.capital?.formula }} · Riserva {{ formattaEuro(v2Preview.capital?.minimumReserve) }} ({{ v2Preview.capital?.reserveSource }})</p>
            <div class="smart-v2-scenarios">
              <article v-for="scenario in v2Preview.scenarios" :key="scenario.id">
                <h3>{{ scenario.label }} <small v-if="scenario.recommended">consigliato</small></h3>
                <ul>
                  <li v-for="allocation in scenario.allocations" :key="allocation.category">
                    {{ etichettaCategoria(allocation.category) }}: {{ formattaEuro(allocation.amount) }}
                  </li>
                </ul>
              </article>
            </div>
            <h3>Proiezione bilanciata</h3>
            <ul>
              <li v-for="(periodo, mesi) in (v2Preview.projections?.bilanciato || {})" :key="mesi">
                {{ mesi }} mesi:
                <span v-if="periodo.status === 'stimabile'">liquidità {{ formattaEuro(periodo.liquidityCents / 100) }}</span>
                <span v-else>non stimabile — {{ periodo.reason }}</span>
              </li>
            </ul>
            <h3>Cosa fare ora</h3>
            <ol><li v-for="azione in v2Preview.actions" :key="azione.actionKey">{{ azione.title }} — {{ azione.reason }}</li></ol>
            <p v-for="avviso in v2Preview.warnings" :key="avviso" class="muted">{{ avviso }}</p>
          </WCard>
        </template>
      </section>
    </template>

    <!-- ================= I MIEI PIANI ================= -->
    <section v-else class="history">
      <WCard v-if="error && !plans.length" class="error" role="alert">
        <p>{{ error.message }}</p>
        <WButton variant="secondary" size="sm" @click="apriStorico">Riprova</WButton>
      </WCard>
      <WCard v-else-if="!plans.length" class="empty">
        <h2>Non hai ancora creato un Piano Smart.</h2>
        <p class="muted">Organizza una nuova somma e ritroverai qui il piano salvato.</p>
        <WButton variant="primary" @click="tab = 'create'">Crea il tuo primo piano</WButton>
      </WCard>
      <button
        v-for="piano in plans" :key="piano.id" type="button" class="history-item"
        @click="apriDettaglio(piano.id)"
      >
        <span class="history-item__main">
          <strong>{{ etichettaOrigine(piano.sourceType) }} — {{ formattaEuro(piano.incomingAmount) }}</strong>
          <small>{{ formattaEuro(piano.allocatableCapital) }} distribuiti</small>
        </span>
        <span class="badge">{{ etichettaStato(piano.status) }}</span>
      </button>
    </section>

    <!-- ================= DIALOG ================= -->
    <PianoSmartGuide :open="infoAperta" @close="infoAperta = false" @start="infoAperta = false" />

    <AppDialog
      :open="dettaglioAperto && Boolean(selectedPlan)" title="Dettaglio Piano Smart"
      @close="dettaglioAperto = false"
    >
      <template v-if="selectedPlan">
        <p class="detail-head">
          {{ etichettaOrigine(selectedPlan.sourceType) }} —
          <strong>{{ formattaEuro(selectedPlan.incomingAmount) }}</strong>
        </p>
        <dl class="context-summary">
          <dt>Spese obbligatorie</dt><dd>{{ formattaEuro(selectedPlan.mandatoryExpenses) }}</dd>
          <dt>Capitale distribuito</dt><dd>{{ formattaEuro(selectedPlan.allocatableCapital) }}</dd>
          <dt>Stato</dt><dd>{{ etichettaStato(selectedPlan.status) }}</dd>
          <dt>Versione del motore</dt><dd>{{ selectedPlan.engineVersion }}</dd>
        </dl>

        <table class="detail-table">
          <caption class="sr-only">Confronto fra il suggerimento di WALLT e la tua scelta</caption>
          <thead>
            <tr><th scope="col">Categoria</th><th scope="col">WALLT</th><th scope="col">Tu</th></tr>
          </thead>
          <tbody>
            <tr v-for="voce in selectedPlan.allocations" :key="voce.category">
              <th scope="row">{{ etichettaCategoria(voce.category) }}</th>
              <td>{{ formattaEuro(voce.recommendedAmount) }}</td>
              <td :class="{ changed: voce.finalAmount !== voce.recommendedAmount }">
                {{ formattaEuro(voce.finalAmount) }}
              </td>
            </tr>
          </tbody>
        </table>

        <div v-if="statiPossibili.length" class="actions">
          <WButton
            v-for="stato in statiPossibili" :key="stato" variant="secondary"
            @click="cambiaStato(stato)"
          >
            {{ AZIONE_STATO[stato] }}
          </WButton>
        </div>
        <p v-else class="hint">Questo piano è archiviato: non sono possibili altri cambi di stato.</p>
        <div class="actions">
          <WButton variant="danger" @click="eliminaPiano">Elimina piano</WButton>
        </div>
      </template>
    </AppDialog>

    <AppDialog
      :open="confermaEliminazione"
      title="Eliminare il Piano Smart?"
      @close="confermaEliminazione = false"
    >
      <div class="delete-confirmation">
        <div class="delete-confirmation__icon" aria-hidden="true">
          <Trash2 :size="22" :stroke-width="1.8" />
        </div>
        <div class="delete-confirmation__copy">
          <p>Il piano verrà rimosso dalla cronologia.</p>
          <p class="hint">Saldi, movimenti, obiettivi e altri dati finanziari non verranno modificati.</p>
        </div>
        <div class="actions">
          <WButton variant="secondary" @click="confermaEliminazione = false">Annulla</WButton>
          <WButton
            variant="danger" :loading="eliminazioneInCorso"
            @click="confermaEdEliminaPiano"
          >
            Elimina piano
          </WButton>
        </div>
      </div>
    </AppDialog>
  </div>
</template>

<style scoped>
.piano-view { max-width: 820px; margin: 0 auto; padding-bottom: 2rem; }

/* Una tinta per categoria. Il colore non è mai l'unico canale: accanto a ogni
   segmento ci sono nome, importo e percentuale in chiaro. */
.piano-view {
  --cat-needs: #4C8DFF;
  --cat-safety: #00A884;
  --cat-goals: #C77DFF;
  --cat-future: #F2994A;
  --cat-freedom: #56CCF2;
}

.page-header { display: flex; justify-content: space-between; gap: 1rem; align-items: flex-start; margin-bottom: 1.25rem; }
.page-title-row { display: flex; align-items: center; gap: .5rem; }
.page-title { font-size: 1.5rem; font-weight: 700; color: var(--text-primary); }
.page-sub, .muted { color: var(--text-secondary); line-height: 1.55; font-size: var(--text-sm); }
.hint { color: var(--text-secondary); font-size: var(--text-xs); line-height: 1.5; margin: 0; }
.info-button { display: inline-grid; place-items: center; width: 36px; height: 36px; border: 1px solid var(--glass-interactive-border); border-radius: 50%; background: var(--glass-interactive-bg); color: var(--accent-text); cursor: pointer; }
.info-button:hover { background: var(--glass-interactive-bg-hover); color: var(--text-primary); }

.tabs { display: flex; gap: .4rem; border-bottom: 1px solid var(--divider); margin-bottom: 1.25rem; }
.tabs button { border: 0; background: none; padding: .75rem 1rem; min-height: 44px; color: var(--text-muted); font: inherit; cursor: pointer; border-bottom: 2px solid transparent; }
.tabs button.active { color: var(--accent-text); border-color: var(--accent-green); font-weight: 700; }

.steps { display: flex; gap: .5rem; margin: 0 0 1rem; padding: 0; list-style: none; color: var(--text-muted); font-size: var(--text-xs); }
.steps li { flex: 1; padding: .5rem; text-align: center; border-bottom: 2px solid var(--border); }
.steps li.active { color: var(--text-primary); border-color: var(--accent-green); }
.steps__link { width: 100%; padding: 0; border: 0; background: none; color: inherit; font: inherit; cursor: pointer; text-decoration: underline; text-underline-offset: 3px; }
.steps__link:disabled { cursor: default; text-decoration: none; opacity: .6; }

.flow-card, .allocations, .hero, .text-card, .empty, .zero-capital { display: flex; flex-direction: column; gap: .9rem; margin-bottom: 1rem; }
.situation-hero { display: flex; flex-direction: column; align-items: center; gap: .45rem; margin-bottom: 1rem; text-align: center; }
.situation-hero > strong { color: var(--text-primary); font-size: 2.9rem; line-height: 1.05; }
.hero-kicker { margin: 0 0 .35rem; color: var(--text-secondary); font-size: var(--text-xs); font-weight: 700; letter-spacing: .12em; text-transform: uppercase; }
.hero-today { margin: -.2rem 0 .25rem !important; color: var(--text-primary) !important; font-size: 1rem; font-weight: 600; }
.hero-availability { display: flex; justify-content: center; gap: 1rem; flex-wrap: wrap; margin: .45rem 0 .2rem; color: var(--text-secondary); font-size: var(--text-sm); }
.safe-to-spend { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: .55rem; width: 100%; margin: .6rem 0 .15rem; }
.safe-to-spend > div { display: grid; gap: .2rem; padding: .65rem .5rem; border: 1px solid var(--divider); border-radius: var(--radius-md); background: color-mix(in srgb, var(--surface) 72%, transparent); }
.safe-to-spend span { color: var(--text-secondary); font-size: var(--text-xs); }
.safe-to-spend strong { color: var(--text-primary); font-size: 1rem; }
.safe-to-spend__highlight { border-color: color-mix(in srgb, var(--accent-green) 55%, var(--divider)) !important; background: color-mix(in srgb, var(--accent-green) 10%, transparent) !important; }
.situation-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: .75rem; width: 100%; margin-top: .5rem; }
.situation-grid > div { display: flex; flex-direction: column; gap: .25rem; padding: .75rem; border: 1px solid var(--divider); border-radius: var(--radius-md); text-align: left; }
.situation-grid span { color: var(--text-secondary); font-size: var(--text-xs); }
.situation-grid strong { color: var(--text-primary); }
.situation-status { padding: .35rem .65rem; border-radius: 999px; font-size: var(--text-xs); background: color-mix(in srgb, var(--accent) 14%, transparent); color: var(--accent); }
.situation-status--sopra_il_ritmo { background: color-mix(in srgb, #f0a35b 16%, transparent); color: #f0a35b; }
.situation-section { margin: 1.25rem 0; padding: 0 .25rem; }
.situation-section h2 { margin-bottom: .4rem; }
.situation-section p { margin: 0; color: var(--text-secondary); line-height: 1.5; }
.insight-list { display: grid; gap: .65rem; margin: .75rem 0 0; padding: 0; list-style: none; }
.insight-list li { padding: .8rem 0; border-bottom: 1px solid var(--divider); color: var(--text-secondary); line-height: 1.45; }
.insight-list li:last-child { border-bottom: 0; }
.forecast-main { display: flex; align-items: baseline; gap: .6rem; margin: 1rem 0; }
.forecast-main strong { font-size: 2rem; color: var(--text-primary); }
.forecast-main span, .forecast-grid span, .upcoming-row small { color: var(--text-secondary); font-size: var(--text-xs); }
.forecast-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: .6rem; }
.forecast-grid div { display: grid; gap: .25rem; padding: .7rem; border: 1px solid var(--divider); border-radius: var(--radius-md); }
.forecast-grid strong { color: var(--text-primary); }
.explanation { border-top: 1px solid var(--divider); padding-top: .7rem; color: var(--text-secondary); font-size: var(--text-xs); }
.explanation summary { color: var(--accent-text); cursor: pointer; font-weight: 600; }
.explanation p { margin: .6rem 0 0; line-height: 1.55; }
.upcoming-row, .upcoming-total { display: flex; justify-content: space-between; align-items: center; gap: 1rem; padding: .75rem 0; border-bottom: 1px solid var(--divider); }
.upcoming-row span { display: grid; gap: .2rem; }
.upcoming-row strong, .upcoming-total strong { color: var(--text-primary); }
.upcoming-total { border-bottom: 0; padding-bottom: 0; }
.month-progress { border-top: 1px solid var(--divider); padding-top: 1.25rem; }
.progress-line { display: flex; justify-content: space-between; margin-top: .8rem; color: var(--text-secondary); }
.progress-line strong { color: var(--text-primary); }
.progress-track { height: .45rem; margin-top: .4rem; overflow: hidden; border-radius: 999px; background: color-mix(in srgb, var(--accent) 12%, transparent); }
.progress-track i { display: block; height: 100%; border-radius: inherit; background: var(--accent); transition: width .35s ease; }
.progress-track--expenses { background: color-mix(in srgb, #f0a35b 14%, transparent); }
.progress-track--expenses i { background: #f0a35b; }
.simulator { border-top: 1px solid var(--divider); padding-top: 1.25rem; }
.simulator-form { display: flex; flex-direction: column; gap: .35rem; margin-top: .75rem; }
.simulator-form input { width: 100%; min-height: 44px; padding: .7rem .8rem; border: 1px solid var(--border); border-radius: var(--radius-md); background: var(--surface); color: var(--text-primary); font: inherit; }
.simulator-quick { display: flex; gap: .45rem; flex-wrap: wrap; }
.simulator-quick button { min-height: 36px; padding: .35rem .7rem; border: 1px solid var(--border); border-radius: 999px; background: var(--surface-subtle); color: var(--text-secondary); font: inherit; cursor: pointer; }
.simulator-quick button:hover, .simulator-quick button:focus-visible { border-color: var(--accent-green); color: var(--text-primary); }
.simulator-quick button:focus-visible { outline: 2px solid var(--accent-green); outline-offset: 2px; }
.simulator-result { display: flex; flex-direction: column; gap: .3rem; margin-top: .75rem; padding: .85rem; border-left: 3px solid var(--accent); background: color-mix(in srgb, var(--accent) 8%, transparent); border-radius: 0 var(--radius-md) var(--radius-md) 0; color: var(--text-secondary); }
.simulator-result strong { color: var(--text-primary); }
.simulator-result__impact { margin-top: .25rem; color: var(--text-primary); font-weight: 600; }
.simulator-result--rischio { border-left-color: #d86c6c; background: color-mix(in srgb, #d86c6c 8%, transparent); }
.simulator-result--attenzione { border-left-color: #f0a35b; background: color-mix(in srgb, #f0a35b 8%, transparent); }
.suggestion-row { padding: .8rem 0; border-top: 1px solid var(--divider); }
.suggestion-row p, .suggestion-row small { display: block; margin: .25rem 0 0; color: var(--text-secondary); font-size: var(--text-xs); line-height: 1.5; }
h2 { color: var(--text-primary); font-size: 1.1rem; }
.field { display: flex; flex-direction: column; gap: .35rem; border: 0; padding: 0; margin: 0; }
label, legend { color: var(--text-primary); font-size: var(--text-sm); font-weight: 600; padding: 0; }
input, select { width: 100%; min-height: 44px; border: 1px solid var(--border); border-radius: var(--radius-md); padding: .65rem .75rem; background: var(--surface-subtle); color: var(--text-primary); font: inherit; }
input:focus-visible, select:focus-visible, .tabs button:focus-visible, .info-button:focus-visible, .history-item:focus-visible { outline: 2px solid var(--accent-green); outline-offset: 2px; }
.amount-input { display: flex; align-items: center; gap: .35rem; font-size: 1.5rem; font-weight: 700; }
.amount-input input { font-size: 1.5rem; font-weight: 700; }
.choice-row { display: flex; flex-wrap: wrap; gap: 1rem; }
.choice-row label { display: flex; align-items: center; gap: .4rem; font-weight: 400; min-height: 44px; }
.choice-row input { width: auto; min-height: auto; }
.capital { color: var(--text-secondary); }
.capital strong { color: var(--text-primary); }
.field-error { color: var(--negative); font-size: var(--text-xs); }

.loading, .error { padding: 1.5rem; text-align: center; color: var(--text-secondary); }
.error-details { margin: .5rem 0; padding-left: 1.2rem; text-align: left; color: var(--text-secondary); font-size: var(--text-xs); }

.hero { align-items: center; text-align: center; }
.hero p, .hero span { color: var(--text-secondary); margin: 0; }
.hero strong { font-size: 2.4rem; color: var(--text-primary); }
.hero-meta { display: flex; gap: 1rem; flex-wrap: wrap; justify-content: center; font-size: var(--text-xs); }

.bar { display: flex; height: 1rem; overflow: hidden; border-radius: 999px; background: var(--chart-track); }
.seg { border-right: 2px solid var(--surface); }
.seg:last-child { border-right: 0; }
.seg--needs, .dot--needs { background: var(--cat-needs); }
.seg--safety, .dot--safety { background: var(--cat-safety); }
.seg--goals, .dot--goals { background: var(--cat-goals); }
.seg--future, .dot--future { background: var(--cat-future); }
.seg--freedom, .dot--freedom { background: var(--cat-freedom); }
.dot { display: inline-block; width: .6rem; height: .6rem; border-radius: 50%; margin-right: .4rem; vertical-align: baseline; }

.allocation { display: grid; grid-template-columns: 1fr 10rem; gap: 1rem; align-items: start; padding: .85rem 0; border-top: 1px solid var(--divider); }
.allocation__info strong { color: var(--text-primary); }
.allocation p { margin: .25rem 0; color: var(--text-secondary); font-size: var(--text-xs); }
.allocation .motivo { color: var(--text-primary); font-weight: 600; }
.allocation small { color: var(--text-muted); font-size: var(--text-xs); }
.goal-breakdown { margin: .5rem 0 0; padding-left: 1.1rem; color: var(--text-secondary); font-size: var(--text-xs); }
.difference { color: var(--text-secondary); font-size: var(--text-sm); }
.difference.invalid { color: var(--negative); font-weight: 600; }
.actions { display: flex; flex-wrap: wrap; gap: .75rem; }
.actions > * { flex: 1; }

.reasons { margin: 0; padding-left: 1.2rem; color: var(--text-secondary); line-height: 1.6; }
.reasons strong { color: var(--text-primary); }
.reasons p { margin: .15rem 0 .6rem; font-size: var(--text-xs); }
.warnings ul { margin: 0; padding-left: 1.2rem; color: var(--text-secondary); font-size: var(--text-sm); line-height: 1.6; }
.context-summary { display: grid; grid-template-columns: 1fr auto; gap: .35rem 1rem; margin: .75rem 0; font-size: var(--text-xs); }
.context-summary dt { color: var(--text-secondary); }
.context-summary dd { margin: 0; color: var(--text-primary); font-weight: 600; text-align: right; }
summary { cursor: pointer; color: var(--text-primary); font-weight: 600; font-size: var(--text-sm); min-height: 44px; display: flex; align-items: center; }

@media (max-width: 600px) {
  .situation-grid { grid-template-columns: 1fr; }
  .safe-to-spend { grid-template-columns: 1fr; }
  .forecast-grid { grid-template-columns: 1fr; }
}

.history-item { display: flex; justify-content: space-between; align-items: center; gap: 1rem; width: 100%; margin-bottom: .75rem; padding: 1rem; min-height: 44px; text-align: left; cursor: pointer; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-lg); font: inherit; color: var(--text-primary); }
.history-item__main { display: flex; flex-direction: column; gap: .2rem; }
.history-item small { color: var(--text-secondary); font-size: var(--text-xs); }
.badge { color: var(--text-secondary); font-size: var(--text-xs); padding: .2rem .6rem; border: 1px solid var(--border); border-radius: 999px; white-space: nowrap; }

.detail-head { color: var(--text-secondary); }
.detail-table { width: 100%; border-collapse: collapse; margin: .75rem 0; font-size: var(--text-sm); }
.detail-table th, .detail-table td { padding: .5rem .4rem; border-bottom: 1px solid var(--divider); text-align: right; color: var(--text-primary); }
.detail-table thead th, .detail-table tbody th { text-align: left; color: var(--text-secondary); font-weight: 600; }
.detail-table td.changed { color: var(--accent-text); font-weight: 700; }

.delete-confirmation { display: flex; flex-direction: column; gap: 1rem; }
.delete-confirmation__icon {
  display: grid;
  place-items: center;
  width: 3rem;
  height: 3rem;
  border: 1px solid color-mix(in srgb, var(--negative) 32%, transparent);
  border-radius: 50%;
  background: color-mix(in srgb, var(--negative) 11%, transparent);
  color: var(--negative);
}
.delete-confirmation__copy { display: flex; flex-direction: column; gap: .4rem; }
.delete-confirmation__copy p { margin: 0; color: var(--text-primary); line-height: 1.5; }
.delete-confirmation__copy .hint { color: var(--text-secondary); }

.protection-details { width: 100%; text-align: left; }
.shortfall { color: var(--negative); font-weight: 600; }
.forecast-quality { padding: .8rem 0; border-top: 1px solid var(--divider); color: var(--text-secondary); }
.forecast-quality strong { color: var(--text-primary); }
.forecast-quality p { margin: .4rem 0 0; font-size: var(--text-xs); line-height: 1.5; }
.forecast-empty { color: var(--text-secondary); line-height: 1.5; }
.simulation-comparison { width: 100%; border-collapse: collapse; margin: .7rem 0; font-size: var(--text-sm); font-variant-numeric: tabular-nums; }
.simulation-comparison th, .simulation-comparison td { padding: .65rem .25rem; border-bottom: 1px solid var(--divider); text-align: right; }
.simulation-comparison th:first-child { text-align: left; font-weight: 500; }
.simulation-comparison td:last-child { color: var(--text-primary); font-weight: 700; }
@media (max-width: 400px) { .simulation-comparison { font-size: var(--text-xs); } }
@media (prefers-reduced-motion: reduce) { .progress-track i { transition: none; } }

.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; }

@media (max-width: 600px) {
  .page-header { display: block; }
  .allocation { grid-template-columns: 1fr; }
  .allocation__input input { max-width: 12rem; }
  .actions { flex-direction: column; }
  .hero strong { font-size: 2rem; }
}
</style>
