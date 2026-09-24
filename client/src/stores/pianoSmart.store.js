import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import { pianoSmartApi, pianoSmartError } from '@/api/pianoSmart.api';
import { CATEGORIE_PIANO, importoInCentesimi, centesimiInImporto } from '@/utils/pianoSmart';

/**
 * Stato dell'interfaccia di Piano Smart.
 *
 * Confine non negoziabile: **il piano lo decide il backend**. Questo store non
 * calcola profilo finanziario, allocazioni raccomandate, copertura del fondo,
 * pressione debitoria, capacità di risparmio, priorità degli obiettivi, reason
 * code, pesi o modificatori. Raccoglie input, conserva le risposte del server e
 * misura una sola cosa: se le allocazioni modificate dall'utente tornano al
 * totale che il backend ha dichiarato.
 *
 * Quel conto si fa in **centesimi interi** e non in euro float. Con i float la
 * somma di cinque importi può discostarsi di mezzo centesimo dal totale e il
 * pulsante "Salva" resterebbe bloccato senza che l'utente capisca perché.
 */
const clone = (value) => JSON.parse(JSON.stringify(value ?? []));

export const usePianoSmartStore = defineStore('pianoSmart', () => {
  const state = ref('idle');
  const input = ref({
    amount: '',
    sourceType: '',
    recurring: null,
    mandatoryExpenses: '',
    manualContextAnswers: {},
  });
  const readiness = ref(null);
  const preview = ref(null);
  const recommendedAllocations = ref([]);
  const finalAllocations = ref([]);
  const plans = ref([]);
  const selectedPlan = ref(null);
  const error = ref(null);

  /**
   * Capitale da distribuire.
   *
   * Appena esiste una preview vince `preview.allocatableCapital`: è il numero
   * con cui il backend ha ripartito e contro cui validerà il salvataggio.
   * Prima della preview si mostra una stima locale, l'unico calcolo che questo
   * store si permette, e serve solo a dare un riscontro immediato mentre
   * l'utente digita.
   */
  const capitalToAllocateCents = computed(() => {
    const dalBackend = importoInCentesimi(preview.value?.allocatableCapital);
    if (dalBackend !== null) return dalBackend;
    const entrata = importoInCentesimi(input.value.amount) ?? 0;
    const obbligatorie = importoInCentesimi(input.value.mandatoryExpenses) ?? 0;
    return Math.max(entrata - obbligatorie, 0);
  });

  const capitalToAllocate = computed(() => centesimiInImporto(capitalToAllocateCents.value));

  const finalTotalCents = computed(() => finalAllocations.value.reduce(
    (somma, voce) => somma + (importoInCentesimi(voce.finalAmount) ?? 0),
    0,
  ));

  /** Positivo: manca ancora da distribuire. Negativo: si è superato il totale. */
  const allocationDifferenceCents = computed(
    () => capitalToAllocateCents.value - finalTotalCents.value,
  );
  const allocationDifference = computed(
    () => centesimiInImporto(allocationDifferenceCents.value),
  );

  /** Nessuna quota può essere negativa: il backend la rifiuta, e mostrarlo
   * prima evita un viaggio inutile. */
  const hasNegativeAllocation = computed(() => finalAllocations.value.some(
    (voce) => (importoInCentesimi(voce.finalAmount) ?? 0) < 0,
  ));

  /** A capitale zero non c'è niente da distribuire: è uno stato informativo,
   * non un errore, e il piano resta salvabile. */
  const isZeroCapital = computed(
    () => Boolean(preview.value) && capitalToAllocateCents.value === 0,
  );

  const canSave = computed(() => allocationDifferenceCents.value === 0
    && !hasNegativeAllocation.value);

  const questions = computed(() => readiness.value?.questions ?? []);
  const warnings = computed(() => preview.value?.warnings ?? readiness.value?.warnings ?? []);

  const setError = (err) => { error.value = pianoSmartError(err); state.value = 'error'; };

  /**
   * Payload per il backend. `sourceType` e `recurring` viaggiano con i valori
   * dell'API, non con le etichette dell'interfaccia; gli importi come stringhe
   * decimali; e delle risposte manuali si mandano solo le chiavi che la
   * readiness ha davvero chiesto — una chiave non prevista fa rispondere 400.
   */
  const buildPayload = () => {
    const chiaviAmmesse = questions.value.map((domanda) => domanda.key);
    const risposte = {};
    chiaviAmmesse.forEach((chiave) => {
      const valore = input.value.manualContextAnswers[chiave];
      if (valore === undefined || valore === null || valore === '') return;
      const centesimi = importoInCentesimi(valore);
      if (centesimi === null) return;
      risposte[chiave] = centesimiInImporto(centesimi);
    });

    return {
      amount: centesimiInImporto(importoInCentesimi(input.value.amount) ?? 0),
      sourceType: input.value.sourceType,
      recurring: input.value.recurring === true,
      mandatoryExpenses: centesimiInImporto(importoInCentesimi(input.value.mandatoryExpenses) ?? 0),
      manualContextAnswers: risposte,
    };
  };

  async function loadReadiness() {
    state.value = 'contextLoading';
    error.value = null;
    try {
      readiness.value = await pianoSmartApi.getReadiness();
      // Le spese obbligatorie suggerite si propongono, non si applicano: il
      // backend le marca `appliedAutomatically: false` proprio perché è
      // l'utente a confermarle. Si riempie solo un campo ancora vuoto.
      const suggerite = readiness.value?.suggestedMandatoryExpenses;
      if (suggerite?.supported && suggerite.amount && input.value.mandatoryExpenses === '') {
        input.value.mandatoryExpenses = suggerite.amount;
      }
      state.value = readiness.value?.questions?.length ? 'needsInput' : 'idle';
      return readiness.value;
    } catch (err) {
      setError(err);
      return null;
    }
  }

  /** Allinea le allocazioni modificabili a quelle raccomandate dal backend,
   * nell'ordine canonico delle categorie. */
  const adottaAllocazioni = (allocations) => {
    const perCategoria = new Map((allocations ?? []).map((voce) => [voce.category, voce]));
    const ordinate = CATEGORIE_PIANO
      .map((categoria) => perCategoria.get(categoria))
      .filter(Boolean);
    recommendedAllocations.value = clone(ordinate);
    finalAllocations.value = clone(ordinate);
  };

  async function generatePreview() {
    state.value = 'generating';
    error.value = null;
    try {
      const result = await pianoSmartApi.createPreview(buildPayload());
      preview.value = result;
      adottaAllocazioni(result.allocations);
      state.value = 'previewReady';
      return result;
    } catch (err) {
      setError(err);
      return null;
    }
  }

  async function savePlan() {
    if (!canSave.value) return null;
    state.value = 'saving';
    error.value = null;
    try {
      const result = await pianoSmartApi.createPlan({
        ...buildPayload(),
        // Del client il backend accetta solo le quote finali: le raccomandate
        // le ricalcola da sé e ignora quelle che arrivano dal browser.
        allocations: finalAllocations.value.map((voce) => ({
          category: voce.category,
          finalAmount: centesimiInImporto(importoInCentesimi(voce.finalAmount) ?? 0),
        })),
      });
      selectedPlan.value = result;
      state.value = 'saved';
      return result;
    } catch (err) {
      setError(err);
      return null;
    }
  }

  async function loadPlans() {
    error.value = null;
    try {
      plans.value = await pianoSmartApi.listPlans();
      return plans.value;
    } catch (err) {
      setError(err);
      // Un errore non azzera i dati già ottenuti (Coding Rule 17).
      return plans.value;
    }
  }

  async function loadPlan(id) {
    error.value = null;
    try {
      selectedPlan.value = await pianoSmartApi.getPlan(id);
      return selectedPlan.value;
    } catch (err) {
      setError(err);
      return null;
    }
  }

  async function updateStatus(id, status) {
    error.value = null;
    try {
      const result = await pianoSmartApi.updatePlan(id, { status });
      selectedPlan.value = result;
      await loadPlans();
      return result;
    } catch (err) {
      setError(err);
      return null;
    }
  }

  function resetFinalAllocations() {
    finalAllocations.value = clone(recommendedAllocations.value);
  }

  function reset() {
    state.value = 'idle';
    input.value = {
      amount: '', sourceType: '', recurring: null, mandatoryExpenses: '', manualContextAnswers: {},
    };
    readiness.value = null;
    preview.value = null;
    recommendedAllocations.value = [];
    finalAllocations.value = [];
    plans.value = [];
    selectedPlan.value = null;
    error.value = null;
  }

  return {
    state,
    input,
    readiness,
    preview,
    recommendedAllocations,
    finalAllocations,
    plans,
    selectedPlan,
    error,
    questions,
    warnings,
    capitalToAllocate,
    capitalToAllocateCents,
    allocationDifference,
    allocationDifferenceCents,
    hasNegativeAllocation,
    isZeroCapital,
    canSave,
    loadReadiness,
    generatePreview,
    savePlan,
    loadPlans,
    loadPlan,
    updateStatus,
    resetFinalAllocations,
    reset,
  };
});
