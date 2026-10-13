<script setup>
import { computed, onMounted, ref } from 'vue';
import { storeToRefs } from 'pinia';
import { useRouter } from 'vue-router';
import WCard from '@/components/common/WCard.vue';
import WButton from '@/components/common/WButton.vue';
import CategoryIcon from '@/components/common/CategoryIcon.vue';
import HelpTrigger from '@/components/help/HelpTrigger.vue';
import PianoSmartChangeTimeline from '@/components/piano-smart/PianoSmartChangeTimeline.vue';
import PianoSmartCashFlowRadar from '@/components/piano-smart/PianoSmartCashFlowRadar.vue';
import PianoSmartGoalsSummary from '@/components/piano-smart/PianoSmartGoalsSummary.vue';
import PianoSmartExpenseFunding from '@/components/piano-smart/PianoSmartExpenseFunding.vue';
import PianoSmartGuide from '@/components/piano-smart/PianoSmartGuide.vue';
import SituazioneHero from '@/components/piano-smart/SituazioneHero.vue';
import { usePianoSmartStore } from '@/stores/pianoSmart.store';
import { useScheduledPaymentsStore } from '@/stores/scheduledPayments.store';
import { useProfiloStore } from '@/stores/profilo.store';
import { useToastStore } from '@/stores/toast.store';
import { purchaseAmountCents } from '@/utils/pianoSmartSimulation';
import { formattaEuro } from '@/utils/pianoSmart';
import { GLOSSARIO } from '@/content/glossario';

/**
 * La tua situazione: il cruscotto di monitoraggio continuo di Piano Smart.
 * Risponde a "come sto, quanto posso spendere" — non calcola il piano che
 * riparte una somma appena arrivata: quello è il wizard in
 * `views/PianoSmartView.vue`, su una rotta distinta.
 *
 * Questa view non calcola nessuna metrica finanziaria propria: liquidità,
 * budget giornaliero, previsioni e orizzonte arrivano da
 * `GET /piano-smart-v2/current-situation`.
 */
const store = usePianoSmartStore();
const scheduledPaymentsStore = useScheduledPaymentsStore();
const profiloStore = useProfiloStore();
const router = useRouter();
const toast = useToastStore();
const {
  currentSituation, currentSituationState, currentSituationError,
  purchaseSimulation, purchaseSimulationState,
} = storeToRefs(store);

const tab = ref('today');
const guidaSpiegazioneAperta = ref(false);
const sezioneGuidaPiano = ref('cos-e');
const simulatoreImporto = ref('');
const salvaMesiRiservaInCorso = ref(false);
const expenseFundingBusyPaymentId = ref(null);

// --- etichette -------------------------------------------------------------
const simulazione = computed(() => purchaseSimulation.value);
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
const simulatoreErrore = computed(() => simulatoreImporto.value !== '' && purchaseAmountCents(simulatoreImporto.value) === null);
const formattaScadenza = (value) => new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${value}T12:00:00Z`));
// Con l'anno: l'orizzonte a data arriva fino a 36 mesi, e la data
// raggiungibile dopo la simulazione può cadere nell'anno successivo.
const formattaScadenzaConAnno = (value) => (value
  ? new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${value}T12:00:00Z`))
  : null);
const qualitaPrevisione = computed(() => ({ dati_insufficienti: 'Previsione non disponibile', storico_limitato: 'Storico ancora limitato', storico_disponibile: 'Storico disponibile' })[currentSituation.value?.forecast.quality]);
const simulaAcquisto = async () => {
  if (!simulatoreErrore.value && simulatoreImporto.value) await store.simulatePurchase(simulatoreImporto.value);
};
const usaSimulazioneRapida = async (amount) => {
  simulatoreImporto.value = String(amount);
  if (currentSituation.value?.current?.availableToSpend !== null) {
    await store.simulatePurchase(String(amount));
  }
};
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
    router.push({ path: '/funzionalita/piano-smart', query: focus ? { focus } : undefined });
  }
};

onMounted(() => {
  store.loadCurrentSituation();
});
</script>

<template>
  <div class="piano-view">
    <header class="page-header">
      <div>
        <div class="page-title-row">
          <h1 class="page-title">La tua situazione</h1>
          <HelpTrigger topic="piano-smart" />
        </div>
        <p class="page-sub">
          Capisci cosa sta succedendo ai tuoi soldi e decidi meglio come muoverti.
        </p>
      </div>
    </header>

    <div class="tabs" role="group" aria-label="Aree della tua situazione">
      <button
        type="button" :aria-pressed="tab === 'today'"
        :class="{ active: tab === 'today' }" @click="tab = 'today'"
      >Oggi</button>
      <button
        type="button" :aria-pressed="tab === 'upcoming'"
        :class="{ active: tab === 'upcoming' }" @click="tab = 'upcoming'"
      >Prossimi 30 giorni</button>
      <button
        type="button" :aria-pressed="tab === 'analysis'"
        :class="{ active: tab === 'analysis' }" @click="tab = 'analysis'"
      >Analisi</button>
    </div>

    <div v-if="currentSituationState === 'loading'" class="loading">Sto leggendo la tua situazione…</div>
    <div v-else-if="currentSituationState === 'error'" class="error" role="alert">{{ currentSituationError?.message || 'Non riesco a recuperare la situazione.' }}</div>
    <template v-else-if="currentSituation">
      <SituazioneHero
        v-if="tab === 'today'" :situazione="currentSituation"
        :salvataggio-in-corso="salvaMesiRiservaInCorso"
        @cambia-orizzonte="aggiornaOrizzonte"
      />

      <template v-if="tab === 'today'">
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
          <div class="simulator-submit">
            <WButton variant="primary" :disabled="simulatoreErrore || !simulatoreImporto || currentSituation.current.availableToSpend === null" :loading="purchaseSimulationState === 'loading'" @click="simulaAcquisto">Simula acquisto</WButton>
          </div>
        <div v-if="purchaseSimulationState === 'error'" class="field-error" role="alert">{{ currentSituationError?.message || 'Non è stato possibile simulare questa spesa.' }}</div>
        <div v-if="simulazione" class="simulator-result" :class="`simulator-result--${simulazione.status}`" aria-live="polite" aria-atomic="true">
          <strong>{{ simulazione.status === 'compatibile' ? 'Entro il limite stimato' : simulazione.status === 'attenzione' ? 'Riduce il margine' : simulazione.status === 'non_stimabile' ? 'Effetto sul mese non ancora stimabile' : 'Potrebbe compromettere il piano' }}</strong>
          <table class="simulation-comparison">
            <caption class="sr-only">Confronto prima e dopo una spesa di {{ formattaEuro(simulazione.amount) }}</caption>
            <thead><tr><th scope="col">Il tuo piano</th><th scope="col">Prima</th><th scope="col">Dopo</th></tr></thead>
            <tbody>
            <tr><th scope="row">{{ GLOSSARIO.capitale_libero.etichetta }}</th><td>{{ formattaEuro(simulazione.availableBefore) }}</td><td>{{ formattaEuro(simulazione.availableAfter) }}</td></tr>
            <tr><th scope="row">Fine mese</th><td>{{ formattaEuro(simulazione.forecastBefore) }}</td><td>{{ formattaEuro(simulazione.forecastAfter) }}</td></tr>
            <tr><th scope="row">Limite indicativo / giorno</th><td>{{ formattaEuro(simulazione.dailyLimitBefore) }}</td><td>{{ formattaEuro(simulazione.dailyLimitAfter) }}</td></tr>
            </tbody>
          </table>
          <!-- Solo in modalità data: in modalità mensile "a fine mese" è già
               la lettura naturale, mentre con una scadenza scelta dall'utente
               la domanda vera è quanto si allontana il giorno in cui il
               capitale non basta più (promessa della spec non consegnata —
               difetto 7 della review finale). -->
          <p v-if="currentSituation.horizon?.tipo === 'data' && simulazione.giorniAutonomiaPersi" class="hint">
            Questo acquisto ti costa {{ simulazione.giorniAutonomiaPersi }}
            {{ simulazione.giorniAutonomiaPersi === 1 ? 'giorno' : 'giorni' }} di autonomia:
            la data raggiungibile passa dal {{ formattaScadenzaConAnno(currentSituation.horizon.dataRaggiungibile) }}
            al {{ formattaScadenzaConAnno(simulazione.dataRaggiungibileAfter) }}.
          </p>
          <span class="simulator-result__impact">Quota del margine usata: {{ simulazione.impact }}</span>
          <p class="hint">Gli importi già accantonati a obiettivi o riserva restano invariati. La simulazione non ricalcola tempi degli obiettivi o ripartizioni: l’acquisto ipotetico non è collegato a un contributo o a un piano.</p>
          <p v-if="simulazione.availableAfter < 0" class="hint">L’acquisto supera il margine spendibile stimato.</p>
          <p v-if="simulazione.forecastAfter === null" class="hint">L’effetto sulla fine del mese non è stimabile con i dati attuali.</p>
          <details class="explanation"><summary>Come leggere l’impatto?</summary><p>Basso: fino al 20% dello spendibile. Moderato: dal 20% al 45%. Alto: oltre il 45%. È una descrizione della quota coinvolta, non una misura di sicurezza.</p></details>
        </div>
        <p v-else-if="currentSituation.current.availableToSpend === null" class="hint">La simulazione sarà disponibile quando potremo calcolare lo spendibile.</p>
      </section>
      </template>

      <template v-if="tab === 'analysis'">
      <div class="analysis-heading"><h2>Cosa è cambiato?</h2><button type="button" class="context-help" @click="apriGuida('analisi')">Che cosa significa?</button></div>
      <PianoSmartChangeTimeline :changes="currentSituation.changes" />

      <section class="situation-section" aria-labelledby="analisi-wallt-title">
        <h2 id="analisi-wallt-title">Analisi di WALLT</h2>
        <ul class="insight-list">
          <li v-for="insight in currentSituation.insights" :key="insight.key">{{ insight.text }}</li>
        </ul>
      </section>
      </template>

      <template v-if="tab === 'today'">
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

      </template>

      <template v-if="tab === 'upcoming'">
      <PianoSmartExpenseFunding
        :plans="currentSituation.upcomingExpensePlans || []"
        :busy-payment-id="expenseFundingBusyPaymentId"
        @add-contribution="registraAccantonamento"
        @confirm-payment="confermaSpesaProgrammata"
      />

      <WCard class="text-card">
        <h2>Uscite entro fine mese</h2>
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

      <PianoSmartCashFlowRadar :items="currentSituation.cashFlowTimeline" />
      </template>

      <template v-if="tab === 'analysis'">
      <section class="situation-section month-progress" aria-labelledby="andamento-mese-title">
        <h2 id="andamento-mese-title">Andamento del mese <button type="button" class="context-help" @click="apriGuida('analisi')">Che cosa significa?</button></h2>
        <div class="progress-line"><span>Entrate</span><strong>{{ formattaEuro(currentSituation.monthProgress.income) }}</strong></div>
        <div class="progress-track"><i :style="{ width: `${currentSituation.monthProgress.incomeShare}%` }" /></div>
        <div class="progress-line"><span>Uscite</span><strong>{{ formattaEuro(currentSituation.monthProgress.expenses) }}</strong></div>
        <div class="progress-track progress-track--expenses"><i :style="{ width: `${currentSituation.monthProgress.expenseShare}%` }" /></div>
        <div class="progress-line"><span>Risparmio medio storico / mese</span><strong>{{ formattaEuro(currentSituation.forecast.monthlySavings) }}</strong></div>
        <p class="hint">Limite giornaliero: {{ formattaEuro(currentSituation.current.dailyLimit) }} · {{ currentSituation.current.remainingDays }} giorni rimanenti</p>
      </section>

      <WCard class="text-card frequent-expenses" aria-labelledby="spese-frequenti-title">
        <div>
          <h2 id="spese-frequenti-title">Medie delle spese frequenti <button type="button" class="context-help" @click="apriGuida('analisi')">Che cosa significa?</button></h2>
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
      </template>

      <template v-if="tab === 'today'">
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
      </template>

      <template v-if="tab === 'analysis'">
      <WCard class="text-card">
        <h2>La tua direzione finanziaria <button type="button" class="context-help" @click="apriGuida('analisi')">Che cosa significa?</button></h2>
        <div class="situation-grid situation-grid--secondary">
          <div><span>Patrimonio netto</span><strong>{{ formattaEuro(currentSituation.financialDirection.netWorth) }}</strong></div>
          <div><span>Debiti residui</span><strong>{{ formattaEuro(currentSituation.financialDirection.debts?.totalOutstanding) }}</strong></div>
          <div><span>Rate mensili dichiarate</span><strong>{{ formattaEuro(currentSituation.financialDirection.debts?.totalMonthlyPayments) }}</strong></div>
          <div><span>Obiettivi attivi</span><strong>{{ currentSituation.financialDirection.activeGoals }}</strong></div>
        </div>
        <p class="hint">Le rate dei debiti sono separate dagli impegni ricorrenti e non vengono sottratte dal margine senza una ricorrenza collegata.</p>
        <div v-if="currentSituation.financialDirection.emergencyFund" class="fund-summary">
          <strong>Fondo di sicurezza</strong>
          <span v-if="currentSituation.financialDirection.emergencyFund.current !== null && currentSituation.financialDirection.emergencyFund.target !== null">
            {{ formattaEuro(currentSituation.financialDirection.emergencyFund.current) }} di {{ formattaEuro(currentSituation.financialDirection.emergencyFund.target) }}
          </span>
          <span v-else>Importo o obiettivo non disponibile</span>
          <small v-if="currentSituation.financialDirection.emergencyFund.coverageMonths !== null">
            Copertura teorica: {{ currentSituation.financialDirection.emergencyFund.coverageMonths }} mesi
            <template v-if="currentSituation.financialDirection.emergencyFund.limitedHistory"> · storico limitato</template>
          </small>
          <small v-else>Copertura non stimabile con i dati disponibili.</small>
        </div>
      </WCard>
      <PianoSmartGoalsSummary :goals="currentSituation.financialDirection.goals" />
      <button type="button" class="context-help" @click="apriGuida('analisi')">Che cosa significano obiettivi, residuo e tempi teorici?</button>
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

.page-header { display: flex; justify-content: space-between; gap: 1rem; align-items: flex-start; margin-bottom: 1.25rem; }
.page-title-row { display: flex; align-items: center; gap: .5rem; }
.page-title { font-size: 1.5rem; font-weight: 700; color: var(--text-primary); }
.page-sub, .muted { color: var(--text-secondary); line-height: 1.55; font-size: var(--text-sm); }
.hint { color: var(--text-secondary); font-size: var(--text-xs); line-height: 1.5; margin: 0; }

.tabs { display: flex; gap: .4rem; overflow-x: auto; border-bottom: 1px solid var(--divider); margin-bottom: 1.25rem; scrollbar-width: thin; }
.tabs button { flex: 0 0 auto; white-space: nowrap; border: 0; background: none; padding: .75rem 1rem; min-height: 44px; color: var(--text-muted); font: inherit; cursor: pointer; border-bottom: 2px solid transparent; }
.tabs button.active { color: var(--accent-text); border-color: var(--accent-green); font-weight: 700; }
.context-help { min-height: 36px; padding: .25rem .45rem; border: 0; background: transparent; color: var(--accent-text); font: inherit; font-size: var(--text-xs); text-decoration: underline; text-underline-offset: 3px; cursor: pointer; }
.context-help:focus-visible { outline: 2px solid var(--accent-green); outline-offset: 2px; border-radius: var(--radius-sm); }
.analysis-heading { display: flex; align-items: center; justify-content: space-between; gap: .75rem; margin: .75rem 0; }
.analysis-heading h2 { margin: 0; }

.text-card { display: flex; flex-direction: column; gap: .9rem; margin-bottom: 1rem; }
.situation-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: .75rem; width: 100%; margin-top: .5rem; }
.situation-grid > div { display: flex; flex-direction: column; gap: .25rem; padding: .75rem; border: 1px solid var(--divider); border-radius: var(--radius-md); text-align: left; }
.situation-grid span { color: var(--text-secondary); font-size: var(--text-xs); }
.situation-grid strong { color: var(--text-primary); }
.situation-section { margin: 1.25rem 0; padding: 0 .25rem; }
.situation-section h2 { margin-bottom: .4rem; }
.situation-section p { margin: 0; color: var(--text-secondary); line-height: 1.5; }
.insight-list { display: grid; gap: .65rem; margin: .75rem 0 0; padding: 0; list-style: none; }
.insight-list li { padding: .8rem 0; border-bottom: 1px solid var(--divider); color: var(--text-secondary); line-height: 1.45; }
.insight-list li:last-child { border-bottom: 0; }
.forecast-main { display: flex; align-items: baseline; gap: .6rem; margin: 1rem 0; }
.forecast-main strong { font-size: 2rem; color: var(--text-primary); }
.forecast-main span { color: var(--text-secondary); font-size: var(--text-xs); }
.explanation { border-top: 1px solid var(--divider); padding-top: .7rem; color: var(--text-secondary); font-size: var(--text-xs); }
.explanation summary { color: var(--accent-text); cursor: pointer; font-weight: 600; }
.explanation p { margin: .6rem 0 0; line-height: 1.55; }
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
.simulator { border-top: 1px solid var(--divider); padding-top: 1.25rem; }
.simulator-form { display: flex; flex-direction: column; gap: .35rem; margin-top: .75rem; }
.simulator-submit { margin-top: 5px; }
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
.field-error { color: var(--negative); font-size: var(--text-xs); }

.loading, .error { padding: 1.5rem; text-align: center; color: var(--text-secondary); }

.simulation-comparison { width: 100%; border-collapse: collapse; margin: .7rem 0; font-size: var(--text-sm); font-variant-numeric: tabular-nums; }
.simulation-comparison th, .simulation-comparison td { padding: .65rem .25rem; border-bottom: 1px solid var(--divider); text-align: right; }
.simulation-comparison th:first-child { text-align: left; font-weight: 500; }
.simulation-comparison td:last-child { color: var(--text-primary); font-weight: 700; }
@media (max-width: 400px) { .simulation-comparison { font-size: var(--text-xs); } }
@media (prefers-reduced-motion: reduce) { .progress-track i { transition: none; } }

.fund-summary { display: grid; gap: .25rem; margin-top: .9rem; padding: .75rem; border: 1px solid var(--divider); border-radius: var(--radius-md); }
.fund-summary span { color: var(--text-primary); }
.fund-summary small { color: var(--text-secondary); font-size: var(--text-xs); }

.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; }

@media (max-width: 600px) {
  .page-header { display: block; }
  .situation-grid { grid-template-columns: 1fr; }
}
</style>
