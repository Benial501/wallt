import { defineStore } from 'pinia';
import { computed } from 'vue';
import api from '@/utils/axios';
import { creaRisorsa } from '@/utils/risorsa';

export const useBudgetStore = defineStore('budget', () => {
  const risorsaBudget = creaRisorsa(
    async (mese, anno) => {
      const { data } = await api.get(`/budget/${anno}/${mese}`);
      return data;
    },
    // "Vuoto" qui significa: il server ha risposto e il budget non c'è.
    // Non significa "la richiesta è fallita" — quella è un'altra cosa,
    // ed è precisamente la confusione che questo task elimina.
    { iniziale: null, vuotoSe: (d) => !d || d.esiste === false },
  );

  const risorsaStato = creaRisorsa(
    async (mese, anno) => {
      const { data } = await api.get(`/budget/${anno}/${mese}/stato`);
      return data;
    },
    { iniziale: null, vuotoSe: (d) => !d || (d.stato || []).length === 0 },
  );

  const budgetCorrente = computed(() => (
    risorsaBudget.data.value?.esiste
      ? risorsaBudget.data.value.budget
      : (risorsaStato.data.value?.budget || null)
  ));
  const budgetSuggerito = computed(() => (
    risorsaBudget.data.value?.esiste ? null : (risorsaBudget.data.value?.suggerito || null)
  ));
  // Su errore resta l'ultimo stato valido: `carica` non tocca mai `data`
  // quando fallisce. Il `|| []` copre solo il caso in cui non ci sia MAI
  // stata una lettura riuscita, non il caso "richiesta fallita".
  const statoBudget = computed(() => risorsaStato.data.value?.stato || []);
  const esiste = computed(() => risorsaBudget.data.value?.esiste === true);
  const loading = computed(() => risorsaBudget.loading.value);

  /**
   * "C'è un budget da mostrare", non "il server ha detto esiste:true".
   * La differenza conta dopo una scrittura: se il POST riesce ma la
   * rilettura di /budget fallisce, `esiste` resta false mentre il budget
   * arriva comunque da /stato. Legandosi a `esiste` la pagina mostrerebbe
   * un avviso sopra il vuoto subito dopo aver detto "Budget creato".
   */
  const hasBudget = computed(() => !!budgetCorrente.value);
  const categorieInAlert = computed(() => statoBudget.value.filter((c) => c.stato === 'superato'));
  const totaleSpeso = computed(() =>
    statoBudget.value.reduce((s, c) => s + (parseFloat(c.speso) || 0), 0)
  );

  /**
   * Stato della pagina: combina le due letture. Se il budget c'è ma lo
   * stato di spesa non si è aggiornato, la pagina deve comunque dichiarare
   * che i numeri sono vecchi.
   */
  const statoPagina = computed(() => {
    const principale = risorsaBudget.stato.value;
    if (principale === 'caricamento') return 'caricamento';
    // Con un budget presente la pagina non è pronta finché anche lo stato di
    // spesa non ha risposto almeno una volta: senza, i grafici sono vuoti e la
    // vista mostrerebbe "Pianifica il tuo budget" a chi un budget ce l'ha.
    if (esiste.value && risorsaStato.lastUpdated.value === null && !risorsaStato.error.value) {
      return 'caricamento';
    }
    if (principale === 'pronto' && risorsaStato.error.value) return 'errore-con-dati';
    return principale;
  });

  /** Il più vecchio dei due aggiornamenti riusciti: l'avviso non deve
   *  vantare una freschezza che una delle due letture non ha. */
  const lastUpdatedPagina = computed(() => {
    const a = risorsaBudget.lastUpdated.value;
    const b = risorsaStato.lastUpdated.value;
    if (a === null) return b;
    if (b === null) return a;
    return Math.min(a, b);
  });

  /** Periodo dell'ultima richiesta: serve a `riprovaPagina` per caricare lo
   *  stato di spesa quando non è mai stato chiesto prima. */
  let ultimoPeriodo = null;

  const fetchBudget = (mese, anno) => {
    ultimoPeriodo = { mese, anno };
    return risorsaBudget.carica(mese, anno);
  };
  const fetchStatoBudget = (mese, anno) => {
    ultimoPeriodo = { mese, anno };
    return risorsaStato.carica(mese, anno);
  };

  /**
   * Ritenta il budget e, se dopo il ritentativo c'è un budget da mostrare,
   * (ri)carica il suo stato di spesa.
   *
   * Perché `carica` e non `riprova`: al primo caricamento fallito lo stato
   * di spesa non è mai stato chiesto, quindi non ha argomenti da ripetere.
   * Un `riprova()` lì costruirebbe un URL invalido, e saltarlo lascerebbe
   * il budget a schermo con tutte le categorie a zero speso.
   */
  const riprovaPagina = async () => {
    await risorsaBudget.riprova();
    if (hasBudget.value && ultimoPeriodo) {
      return risorsaStato.carica(ultimoPeriodo.mese, ultimoPeriodo.anno);
    }
    return undefined;
  };

  const createBudget = async (dati) => {
    const { data } = await api.post('/budget', dati);
    await fetchBudget(dati.mese, dati.anno);
    return data.budget;
  };

  const updateBudget = async (id, dati) => {
    const { data } = await api.put(`/budget/${id}`, dati);
    await fetchBudget(dati.mese ?? data.budget?.mese, dati.anno ?? data.budget?.anno);
    return data.budget;
  };

  const reset = () => {
    risorsaBudget.reset();
    risorsaStato.reset();
    ultimoPeriodo = null;
  };

  return {
    risorsaBudget, risorsaStato,
    budgetCorrente, statoBudget, budgetSuggerito, esiste, loading,
    hasBudget, categorieInAlert, totaleSpeso,
    statoPagina, lastUpdatedPagina, riprovaPagina,
    fetchBudget, fetchStatoBudget, createBudget, updateBudget, reset,
  };
});
