<script setup>
import { computed, onMounted, ref } from 'vue';
import { storeToRefs } from 'pinia';
import WCard from '@/components/common/WCard.vue';
import WButton from '@/components/common/WButton.vue';
import AppDialog from '@/components/common/AppDialog.vue';
import PianoSmartGuide from '@/components/piano-smart/PianoSmartGuide.vue';
import { usePianoSmartStore } from '@/stores/pianoSmart.store';
import { useToastStore } from '@/stores/toast.store';
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
const toast = useToastStore();
const {
  state, input, readiness, preview, recommendedAllocations, finalAllocations,
  plans, selectedPlan, error, questions, warnings,
  capitalToAllocate, allocationDifferenceCents, hasNegativeAllocation,
  isZeroCapital, canSave,
} = storeToRefs(store);

const tab = ref('create');
const step = ref(1);
const infoAperta = ref(false);
const dettaglioAperto = ref(false);

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

const ricomincia = () => {
  store.reset();
  step.value = 1;
  tab.value = 'create';
};

onMounted(() => {
  // La readiness serve già allo step 1: propone le spese obbligatorie e
  // anticipa gli avvisi sullo storico.
  store.loadReadiness();
});
</script>

<template>
  <div class="piano-view">
    <header class="page-header">
      <div>
        <h1 class="page-title">Piano Smart</h1>
        <p class="page-sub">
          Trasforma una nuova entrata in un piano costruito sulla tua situazione finanziaria.
        </p>
      </div>
      <button class="info-link" type="button" @click="infoAperta = true">Come funziona?</button>
    </header>

    <div class="tabs" role="tablist">
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

    <!-- ================= CREA PIANO ================= -->
    <template v-if="tab === 'create'">
      <ol class="steps" aria-label="Avanzamento del piano">
        <li :class="{ active: step >= 1 }"><span aria-hidden="true">1</span> Importo</li>
        <li :class="{ active: step >= 2 }"><span aria-hidden="true">2</span> Contesto</li>
        <li :class="{ active: step >= 3 }"><span aria-hidden="true">3</span> Il tuo piano</li>
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
          <WButton
            variant="primary" size="lg" :loading="state === 'generating'"
            @click="generaPiano"
          >
            Crea il mio piano
          </WButton>
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
          <WButton variant="secondary" size="sm" @click="ricomincia">Ricomincia</WButton>
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
      </template>
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
.page-title { font-size: 1.5rem; font-weight: 700; color: var(--text-primary); }
.page-sub, .muted { color: var(--text-secondary); line-height: 1.55; font-size: var(--text-sm); }
.hint { color: var(--text-secondary); font-size: var(--text-xs); line-height: 1.5; margin: 0; }
.info-link { color: var(--accent-text); background: none; border: 0; padding: .5rem 0; cursor: pointer; font: inherit; font-weight: 600; min-height: 44px; }

.tabs { display: flex; gap: .4rem; border-bottom: 1px solid var(--divider); margin-bottom: 1.25rem; }
.tabs button { border: 0; background: none; padding: .75rem 1rem; min-height: 44px; color: var(--text-muted); font: inherit; cursor: pointer; border-bottom: 2px solid transparent; }
.tabs button.active { color: var(--accent-text); border-color: var(--accent-green); font-weight: 700; }

.steps { display: flex; gap: .5rem; margin: 0 0 1rem; padding: 0; list-style: none; color: var(--text-muted); font-size: var(--text-xs); }
.steps li { flex: 1; padding: .5rem; text-align: center; border-bottom: 2px solid var(--border); }
.steps li.active { color: var(--text-primary); border-color: var(--accent-green); }

.flow-card, .allocations, .hero, .text-card, .empty, .zero-capital { display: flex; flex-direction: column; gap: .9rem; margin-bottom: 1rem; }
h2 { color: var(--text-primary); font-size: 1.1rem; }
.field { display: flex; flex-direction: column; gap: .35rem; border: 0; padding: 0; margin: 0; }
label, legend { color: var(--text-primary); font-size: var(--text-sm); font-weight: 600; padding: 0; }
input, select { width: 100%; min-height: 44px; border: 1px solid var(--border); border-radius: var(--radius-md); padding: .65rem .75rem; background: var(--surface-subtle); color: var(--text-primary); font: inherit; }
input:focus-visible, select:focus-visible, .tabs button:focus-visible, .info-link:focus-visible, .history-item:focus-visible { outline: 2px solid var(--accent-green); outline-offset: 2px; }
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

.history-item { display: flex; justify-content: space-between; align-items: center; gap: 1rem; width: 100%; margin-bottom: .75rem; padding: 1rem; min-height: 44px; text-align: left; cursor: pointer; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-lg); font: inherit; color: var(--text-primary); }
.history-item__main { display: flex; flex-direction: column; gap: .2rem; }
.history-item small { color: var(--text-secondary); font-size: var(--text-xs); }
.badge { color: var(--text-secondary); font-size: var(--text-xs); padding: .2rem .6rem; border: 1px solid var(--border); border-radius: 999px; white-space: nowrap; }

.detail-head { color: var(--text-secondary); }
.detail-table { width: 100%; border-collapse: collapse; margin: .75rem 0; font-size: var(--text-sm); }
.detail-table th, .detail-table td { padding: .5rem .4rem; border-bottom: 1px solid var(--divider); text-align: right; color: var(--text-primary); }
.detail-table thead th, .detail-table tbody th { text-align: left; color: var(--text-secondary); font-weight: 600; }
.detail-table td.changed { color: var(--accent-text); font-weight: 700; }

.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; }

@media (max-width: 600px) {
  .page-header { display: block; }
  .info-link { padding-left: 0; }
  .allocation { grid-template-columns: 1fr; }
  .allocation__input input { max-width: 12rem; }
  .actions { flex-direction: column; }
  .hero strong { font-size: 2rem; }
}
</style>
