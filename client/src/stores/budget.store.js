import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import api from '@/utils/axios';

export const useBudgetStore = defineStore('budget', () => {
  const budgetCorrente = ref(null);
  const statoBudget = ref([]);
  const budgetSuggerito = ref(null);
  const esiste = ref(false);
  const loading = ref(false);

  const hasBudget = computed(() => esiste.value && !!budgetCorrente.value);
  const categorieInAlert = computed(() => statoBudget.value.filter((c) => c.stato === 'superato'));
  const totaleSpeso = computed(() =>
    statoBudget.value.reduce((s, c) => s + (parseFloat(c.speso) || 0), 0)
  );

  const fetchBudget = async (mese, anno) => {
    loading.value = true;
    try {
      const { data } = await api.get(`/budget/${anno}/${mese}`);
      esiste.value = data.esiste;
      if (data.esiste) {
        budgetCorrente.value = data.budget;
        budgetSuggerito.value = null;
      } else {
        budgetCorrente.value = null;
        budgetSuggerito.value = data.suggerito;
      }
      return data;
    } finally {
      loading.value = false;
    }
  };

  const fetchStatoBudget = async (mese, anno) => {
    try {
      const { data } = await api.get(`/budget/${anno}/${mese}/stato`);
      statoBudget.value = data.stato;
      if (data.budget) budgetCorrente.value = data.budget;
      esiste.value = true;
      return data;
    } catch {
      statoBudget.value = [];
      return null;
    }
  };

  const createBudget = async (dati) => {
    const { data } = await api.post('/budget', dati);
    budgetCorrente.value = data.budget;
    esiste.value = true;
    return data.budget;
  };

  const updateBudget = async (id, dati) => {
    const { data } = await api.put(`/budget/${id}`, dati);
    budgetCorrente.value = data.budget;
    return data.budget;
  };

  return {
    budgetCorrente, statoBudget, budgetSuggerito, esiste, loading,
    hasBudget, categorieInAlert, totaleSpeso,
    fetchBudget, fetchStatoBudget, createBudget, updateBudget,
  };
});
