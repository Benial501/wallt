<script setup>
import { computed, onMounted, ref } from 'vue';
import { storeToRefs } from 'pinia';
import { useRoute, useRouter } from 'vue-router';
import WCard from '@/components/common/WCard.vue';
import WButton from '@/components/common/WButton.vue';
import CategoryIcon from '@/components/common/CategoryIcon.vue';
import PianoSmartChangeTimeline from '@/components/piano-smart/PianoSmartChangeTimeline.vue';
import PianoSmartGoalsSummary from '@/components/piano-smart/PianoSmartGoalsSummary.vue';
import PianoSmartExpenseFunding from '@/components/piano-smart/PianoSmartExpenseFunding.vue';
import PianoSmartGuide from '@/components/piano-smart/PianoSmartGuide.vue';
import SituazioneHero from '@/components/piano-smart/SituazioneHero.vue';
import SituazioneHeader from '@/components/piano-smart/SituazioneHeader.vue';
import SituazioneInizio from '@/components/situazione/SituazioneInizio.vue';
import SituazioneOggi from '@/components/situazione/SituazioneOggi.vue';
import SituazioneProssimi from '@/components/situazione/SituazioneProssimi.vue';
import SituazioneAnalisi from '@/components/situazione/SituazioneAnalisi.vue';
import DettagliSituazione from '@/components/situazione/DettagliSituazione.vue';
import DettaglioUscite from '@/components/situazione/DettaglioUscite.vue';
import { usePianoSmartStore } from '@/stores/pianoSmart.store';
import { useScheduledPaymentsStore } from '@/stores/scheduledPayments.store';
import { useProfiloStore } from '@/stores/profilo.store';
import { useToastStore } from '@/stores/toast.store';
import { formattaEuro } from '@/utils/pianoSmart';
import { tabSituazione } from '@/utils/situazioneTab';
import { GLOSSARIO } from '@/content/glossario';
import { situazioneVuota } from '@/utils/situazioneSemplice';

/**
 * La tua situazione: il cruscotto di monitoraggio continuo di Piano Smart.
 * Risponde a "come sto, quanto posso spendere" — non calcola il piano che
 * riparte una somma appena arrivata: quello è il wizard in
 * `views/PianoSmartView.vue`, su una rotta distinta.
 *
 * Questa view non calcola nessuna metrica finanziaria propria: liquidità,
 * budget giornaliero, previsioni e orizzonte arrivano da
 * `GET /piano-smart-v2/current-situation`.
 *
 * Ogni scheda si apre sulla sua versione semplice (`components/situazione/`):
 * un numero, una frase su come stai, pochi blocchi con una domanda per
 * titolo. Il cruscotto completo resta dentro «Vedi i dettagli».
 */
const store = usePianoSmartStore();
const scheduledPaymentsStore = useScheduledPaymentsStore();
const profiloStore = useProfiloStore();
const route = useRoute();
const router = useRouter();
const toast = useToastStore();
const {
  currentSituation, currentSituationState, currentSituationError,
  purchaseSimulation,
} = storeToRefs(store);

const tab = computed(() => tabSituazione(route.query));
const guidaSpiegazioneAperta = ref(false);
const sezioneGuidaPiano = ref('cos-e');
const salvaMesiRiservaInCorso = ref(false);
const expenseFundingBusyPaymentId = ref(null);

// --- etichette -------------------------------------------------------------
const simulazione = computed(() => purchaseSimulation.value);
const vuota = computed(() => situazioneVuota(currentSituation.value));
const speseFrequenti = computed(() => {
  const weekly = currentSituation.value?.frequentExpenses?.weekly;
  const monthly = currentSituation.value?.frequentExpenses?.monthly;
  const weeklyByCategory = new Map((weekly?.items ?? []).map((item) => [item.category, item]));
  const monthlyByCategory = new Map((monthly?.items ?? []).map((item) => [item.category, item]));
  const categorie = new Set([...weeklyByCategory.keys(), ...monthlyByCategory.keys()]);
  return [...categorie].map((category) => {
    const item = weeklyByCategory.get(category) ?? monthlyByCategory.get(category);
    return {
      ...item,
      category,
      weeklyAverage: weeklyByCategory.get(category)?.average ?? (weekly?.periodCount ? 0 : null),
      monthlyAverage: monthlyByCategory.get(category)?.average ?? (monthly?.periodCount ? 0 : null),
    };
  }).sort((first, second) => {
    const differenzaMensile = (second.monthlyAverage ?? 0) - (first.monthlyAverage ?? 0);
    if (differenzaMensile) return differenzaMensile;
    const differenzaSettimanale = (second.weeklyAverage ?? 0) - (first.weeklyAverage ?? 0);
    return differenzaSettimanale || first.name.localeCompare(second.name, 'it');
  });
});
// Con l'anno: l'orizzonte a data arriva fino a 36 mesi, e la data
// raggiungibile dopo la simulazione può cadere nell'anno successivo.
const formattaScadenzaConAnno = (value) => (value
  ? new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${value}T12:00:00Z`))
  : null);
const apriGuida = (sezione) => {
  sezioneGuidaPiano.value = sezione;
  guidaSpiegazioneAperta.value = true;
};

const aggiornaOrizzonte = async (payload) => {
  if (salvaMesiRiservaInCorso.value) return;
  salvaMesiRiservaInCorso.value = true;
  try {
    await profiloStore.updateProfilo(payload);
    await store.loadCurrentSituation();
    toast.success('Orizzonte aggiornato.');
  } catch {
    toast.error('Non è stato possibile aggiornare l’orizzonte. Riprova.');
  } finally {
    salvaMesiRiservaInCorso.value = false;
  }
};

const registraAccantonamento = async ({ paymentId, amount, date }) => {
  expenseFundingBusyPaymentId.value = paymentId;
  try {
    await scheduledPaymentsStore.addContribution(paymentId, { amount, date });
    await store.loadCurrentSituation();
    toast.success('Accantonamento registrato nel salvadanaio virtuale.');
  } catch {
    toast.error('Non è stato possibile registrare l’accantonamento. Riprova.');
  } finally {
    expenseFundingBusyPaymentId.value = null;
  }
};

const confermaSpesaProgrammata = async (paymentId) => {
  expenseFundingBusyPaymentId.value = paymentId;
  try {
    await scheduledPaymentsStore.confirmPayment(paymentId);
    await store.loadCurrentSituation();
    toast.success('Pagamento confermato e registrato nelle analisi.');
  } catch {
    toast.error('Non è stato possibile confermare il pagamento. Riprova.');
  } finally {
    expenseFundingBusyPaymentId.value = null;
  }
};

// --- azioni ----------------------------------------------------------------
/** Il suggerimento "crea un piano" porta sul wizard, che ora vive su una
 * rotta separata: non c'è più un tab locale da impostare. */
const eseguiSuggerimento = (suggestion) => {
  const type = suggestion?.action?.type;
  if (type === 'open-analysis') router.push('/analisi');
  if (type === 'open-emergency-fund') router.push('/fondo-emergenza');
  if (type === 'create-plan') {
    const focus = suggestion.action.mode === 'emergency-fund' ? 'emergency-fund' : undefined;
    router.push({ path: '/funzionalita/piano-smart/nuovo', query: focus ? { focus } : undefined });
  }
};

onMounted(() => {
  store.loadCurrentSituation();
});
</script>

<template>
  <div class="piano-view">
    <SituazioneHeader />

    <div v-if="currentSituationState === 'loading'" class="loading">Sto leggendo la tua situazione…</div>
    <div v-else-if="currentSituationState === 'error'" class="error" role="alert">{{ currentSituationError?.message || 'Non riesco a recuperare la situazione.' }}</div>
    <template v-else-if="currentSituation">
      <!-- Chi non ha ancora registrato nulla vede a cosa serve la scheda e il
           primo passo da fare, non zeri e trattini. I dettagli restano
           raggiungibili sotto, per chi li cerca. -->
      <SituazioneInizio v-if="vuota" :situazione="currentSituation" :scheda="tab" />

      <template v-if="tab === 'today'">
      <SituazioneOggi v-if="!vuota" :situazione="currentSituation" @suggerimento="eseguiSuggerimento" />

      <DettagliSituazione titolo="Periodo, calcolo e consigli">
      <SituazioneHero
        :situazione="currentSituation"
        :con-numero="false"
        :salvataggio-in-corso="salvaMesiRiservaInCorso"
        @cambia-orizzonte="aggiornaOrizzonte"
      />

      <WCard v-if="simulazione" class="text-card">
        <h2>L’ultima spesa che hai verificato</h2>
        <table class="simulation-comparison">
          <caption class="sr-only">Confronto prima e dopo una spesa di {{ formattaEuro(simulazione.amount) }}</caption>
          <thead><tr><th scope="col">Il tuo piano</th><th scope="col">Prima</th><th scope="col">Dopo</th></tr></thead>
          <tbody>
          <tr><th scope="row">{{ GLOSSARIO.capitale_libero.etichetta }}</th><td>{{ formattaEuro(simulazione.availableBefore) }}</td><td>{{ formattaEuro(simulazione.availableAfter) }}</td></tr>
          <tr><th scope="row">Limite indicativo / giorno</th><td>{{ formattaEuro(simulazione.dailyLimitBefore) }}</td><td>{{ formattaEuro(simulazione.dailyLimitAfter) }}</td></tr>
          </tbody>
        </table>
        <!-- Solo in modalità data: con una scadenza scelta dall'utente la
             domanda vera è quanto si allontana il giorno in cui il capitale
             non basta più. -->
        <p v-if="currentSituation.horizon?.tipo === 'data' && simulazione.giorniAutonomiaPersi" class="hint">
          Questo acquisto ti costa {{ simulazione.giorniAutonomiaPersi }}
          {{ simulazione.giorniAutonomiaPersi === 1 ? 'giorno' : 'giorni' }} di autonomia:
          la data raggiungibile passa dal {{ formattaScadenzaConAnno(currentSituation.horizon.dataRaggiungibile) }}
          al {{ formattaScadenzaConAnno(simulazione.dataRaggiungibileAfter) }}.
        </p>
        <p class="hint">Quota del margine usata: {{ simulazione.impact }}. Gli importi già accantonati a obiettivi o riserva restano invariati.</p>
      </WCard>

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
            {{ suggestion.action.type === 'open-analysis'
              ? 'Apri analisi'
              : suggestion.action.type === 'open-emergency-fund'
                ? 'Crea fondo di emergenza'
                : suggestion.key === 'start-emergency-fund'
                  ? 'Crea un piano per la riserva'
                  : 'Crea un piano' }}
          </WButton>
        </div>
      </WCard>
      </DettagliSituazione>
      </template>

      <template v-if="tab === 'upcoming'">
      <SituazioneProssimi v-if="!vuota" :situazione="currentSituation" />

      <!-- Le spese da accantonare restano fuori dai dettagli: chiedono
           un'azione dell'utente, e nasconderle le farebbe dimenticare. -->
      <PianoSmartExpenseFunding
        :plans="currentSituation.upcomingExpensePlans || []"
        :busy-payment-id="expenseFundingBusyPaymentId"
        @add-contribution="registraAccantonamento"
        @confirm-payment="confermaSpesaProgrammata"
      />

      <DettagliSituazione titolo="Dettaglio delle uscite">
      <DettaglioUscite :situazione="currentSituation" />
      </DettagliSituazione>
      </template>

      <template v-if="tab === 'analysis'">
      <SituazioneAnalisi v-if="!vuota" :situazione="currentSituation" />

      <DettagliSituazione titolo="Approfondisci: periodi, medie e obiettivi">
      <div class="analysis-heading"><button type="button" class="context-help" @click="apriGuida('analisi')">Che cosa significa?</button></div>
      <PianoSmartChangeTimeline :changes="currentSituation.changes" />

      <section class="situation-section" aria-labelledby="analisi-wallt-title">
        <h2 id="analisi-wallt-title">Analisi di WALLT</h2>
        <ul class="insight-list">
          <li v-for="insight in currentSituation.insights" :key="insight.key">{{ insight.text }}</li>
        </ul>
      </section>

      <section class="situation-section month-progress" aria-labelledby="andamento-mese-title">
        <h2 id="andamento-mese-title">Andamento del mese <button type="button" class="context-help" @click="apriGuida('analisi')">Che cosa significa?</button></h2>
        <div class="progress-line"><span>Entrate</span><strong>{{ formattaEuro(currentSituation.monthProgress.income) }}</strong></div>
        <div class="progress-track"><i :style="{ width: `${currentSituation.monthProgress.incomeShare}%` }" /></div>
        <div class="progress-line"><span>Uscite</span><strong>{{ formattaEuro(currentSituation.monthProgress.expenses) }}</strong></div>
        <div class="progress-track progress-track--expenses"><i :style="{ width: `${currentSituation.monthProgress.expenseShare}%` }" /></div>
        <div class="progress-line"><span>Risparmio medio storico / mese</span><strong>{{ formattaEuro(currentSituation.forecast.monthlySavings) }}</strong></div>
      </section>

      <WCard class="text-card frequent-expenses" aria-labelledby="spese-frequenti-title">
        <div>
          <h2 id="spese-frequenti-title">Tutte le categorie, a settimana e al mese <button type="button" class="context-help" @click="apriGuida('analisi')">Che cosa significa?</button></h2>
          <p class="muted">Le uscite registrate, raggruppate per categoria.</p>
        </div>
        <p v-if="speseFrequenti.length" class="frequent-expenses__periods">
          Media su {{ currentSituation.frequentExpenses.weekly.periodCount }} {{ currentSituation.frequentExpenses.weekly.periodCount === 1 ? 'settimana completa' : 'settimane complete' }}
          e {{ currentSituation.frequentExpenses.monthly.periodCount }} {{ currentSituation.frequentExpenses.monthly.periodCount === 1 ? 'mese completo' : 'mesi completi' }}.
        </p>
        <div v-if="speseFrequenti.length" class="frequent-table-wrap">
          <table class="frequent-table">
            <caption class="sr-only">Medie settimanali e mensili delle uscite registrate per categoria</caption>
            <thead>
              <tr>
                <th scope="col">Categoria</th>
                <th scope="col">A settimana</th>
                <th scope="col">Al mese</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in speseFrequenti" :key="item.category">
                <th scope="row">
                  <span class="frequent-category" :style="{ '--category-color': item.color || 'var(--text-secondary)' }">
                    <span class="frequent-category__icon"><CategoryIcon :categoria="item.category" tipo="uscita" :size="17" /></span>
                    <span>{{ item.name }}</span>
                  </span>
                </th>
                <td>{{ formattaEuro(item.weeklyAverage) }}</td>
                <td>{{ formattaEuro(item.monthlyAverage) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-else class="frequent-expenses__empty">Non ci sono ancora spese registrate in periodi completi sufficienti per calcolare queste medie.</p>
        <p class="hint">I periodi in corso sono esclusi. Le settimane e i mesi senza uscite valgono zero; i pagamenti ricorrenti non ancora addebitati non vengono conteggiati.</p>
      </WCard>

      <PianoSmartGoalsSummary :goals="currentSituation.financialDirection.goals" />
      <button type="button" class="context-help" @click="apriGuida('analisi')">Che cosa significano obiettivi, residuo e tempi teorici?</button>
      </DettagliSituazione>
      </template>
    </template>

    <PianoSmartGuide
      :open="guidaSpiegazioneAperta"
      :initial-section="sezioneGuidaPiano"
      :show-start="false"
      @close="guidaSpiegazioneAperta = false"
    />

  </div>
</template>

<style scoped>
.piano-view { max-width: 820px; margin: 0 auto; padding-bottom: 2rem; }

.muted { color: var(--text-secondary); line-height: 1.55; font-size: var(--text-sm); }
.hint { color: var(--text-secondary); font-size: var(--text-xs); line-height: 1.5; margin: 0; }

.context-help { min-height: 36px; padding: .25rem .45rem; border: 0; background: transparent; color: var(--accent-text); font: inherit; font-size: var(--text-xs); text-decoration: underline; text-underline-offset: 3px; cursor: pointer; }
.context-help:focus-visible { outline: 2px solid var(--accent-green); outline-offset: 2px; border-radius: var(--radius-sm); }
.analysis-heading { display: flex; align-items: center; justify-content: space-between; gap: .75rem; margin: .75rem 0; }
.analysis-heading h2 { margin: 0; }

.text-card { display: flex; flex-direction: column; gap: .9rem; margin-bottom: 1rem; }
.situation-section { margin: 1.25rem 0; padding: 0 .25rem; }
.situation-section h2 { margin-bottom: .4rem; }
.situation-section p { margin: 0; color: var(--text-secondary); line-height: 1.5; }
.insight-list { display: grid; gap: .65rem; margin: .75rem 0 0; padding: 0; list-style: none; }
.insight-list li { padding: .8rem 0; border-bottom: 1px solid var(--divider); color: var(--text-secondary); line-height: 1.45; }
.insight-list li:last-child { border-bottom: 0; }
.upcoming-row, .upcoming-total { display: flex; justify-content: space-between; align-items: center; gap: 1rem; padding: .75rem 0; border-bottom: 1px solid var(--divider); }
.upcoming-row span { display: grid; gap: .2rem; }
.upcoming-row small { color: var(--text-secondary); font-size: var(--text-xs); }
.upcoming-row strong, .upcoming-total strong { color: var(--text-primary); }
.upcoming-total { border-bottom: 0; padding-bottom: 0; }
.month-progress { border-top: 1px solid var(--divider); padding-top: 1.25rem; }
.progress-line { display: flex; justify-content: space-between; margin-top: .8rem; color: var(--text-secondary); }
.progress-line strong { color: var(--text-primary); }
.progress-track { height: .45rem; margin-top: .4rem; overflow: hidden; border-radius: 999px; background: color-mix(in srgb, var(--accent) 12%, transparent); }
.progress-track i { display: block; height: 100%; border-radius: inherit; background: var(--accent); transition: width .35s ease; }
.progress-track--expenses { background: color-mix(in srgb, #f0a35b 14%, transparent); }
.progress-track--expenses i { background: #f0a35b; }
.frequent-expenses { align-items: stretch; }
.frequent-expenses h2 { margin: 0 0 .25rem; }
.frequent-expenses__periods, .frequent-expenses__empty { margin: 0; color: var(--text-secondary); font-size: var(--text-xs); line-height: 1.5; }
.frequent-table-wrap { width: 100%; overflow-x: auto; }
.frequent-table { width: 100%; min-width: 300px; border-collapse: collapse; font-size: var(--text-sm); font-variant-numeric: tabular-nums; }
.frequent-table th, .frequent-table td { padding: .7rem .35rem; border-bottom: 1px solid var(--divider); }
.frequent-table thead th { color: var(--text-secondary); font-size: var(--text-xs); font-weight: 600; text-align: right; white-space: nowrap; }
.frequent-table thead th:first-child, .frequent-table tbody th { text-align: left; }
.frequent-table tbody th { color: var(--text-primary); font-weight: 500; }
.frequent-table tbody td { color: var(--text-primary); text-align: right; white-space: nowrap; }
.frequent-table tbody tr:last-child th, .frequent-table tbody tr:last-child td { border-bottom: 0; }
.frequent-category { display: inline-flex; align-items: center; gap: .55rem; min-height: 2rem; }
.frequent-category__icon { display: grid; place-items: center; width: 2rem; height: 2rem; flex: 0 0 2rem; border-radius: var(--radius-sm); background: color-mix(in srgb, var(--category-color) 12%, transparent); color: var(--category-color); }
.suggestion-row { padding: .8rem 0; border-top: 1px solid var(--divider); }
.suggestion-row p, .suggestion-row small { display: block; margin: .25rem 0 0; color: var(--text-secondary); font-size: var(--text-xs); line-height: 1.5; }
h2 { color: var(--text-primary); font-size: 1.1rem; }
.field-error { color: var(--negative); font-size: var(--text-xs); }

.loading, .error { padding: 1.5rem; text-align: center; color: var(--text-secondary); }

.simulation-comparison { width: 100%; border-collapse: collapse; margin: .7rem 0; font-size: var(--text-sm); font-variant-numeric: tabular-nums; }
.simulation-comparison th, .simulation-comparison td { padding: .65rem .25rem; border-bottom: 1px solid var(--divider); text-align: right; }
.simulation-comparison th:first-child { text-align: left; font-weight: 500; }
.simulation-comparison td:last-child { color: var(--text-primary); font-weight: 700; }
@media (max-width: 400px) { .simulation-comparison { font-size: var(--text-xs); } }
@media (prefers-reduced-motion: reduce) { .progress-track i { transition: none; } }


.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; }
</style>
