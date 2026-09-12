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
  // INVARIANTE: su errore resta l'ultimo stato valido, non un array vuoto.
  const statoBudget = computed(() => risorsaStato.data.value?.stato || []);
  const esiste = computed(() => risorsaBudget.data.value?.esiste === true);
  const loading = computed(() => risorsaBudget.loading.value);

  const hasBudget = computed(() => esiste.value && !!budgetCorrente.value);
  const categorieInAlert = computed(() => statoBudget.value.filter((c) => c.stato === 'superato'));
  const totaleSpeso = computed(() =>
    statoBudget.value.reduce((s, c) => s + (parseFloat(c.speso) || 0), 0)
  );

  const fetchBudget = (mese, anno) => risorsaBudget.carica(mese, anno);
  const fetchStatoBudget = (mese, anno) => risorsaStato.carica(mese, anno);

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
  };

  return {
    risorsaBudget, risorsaStato,
    budgetCorrente, statoBudget, budgetSuggerito, esiste, loading,
    hasBudget, categorieInAlert, totaleSpeso,
    fetchBudget, fetchStatoBudget, createBudget, updateBudget, reset,
  };
});
