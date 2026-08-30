import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import api from '@/utils/axios';

export const useInvestimentiStore = defineStore('investimenti', () => {
  const investimenti = ref([]);
  const analisi = ref({});
  const movimenti = ref([]);
  const patrimonioInvestitoTotale = ref(0);
  const rendimentoTotale = ref(0);
  const rendimentoTotalePercentuale = ref(0);
  const loading = ref(false);

  const patrimonioInvestito = computed(() =>
    investimenti.value.reduce((s, i) => s + (parseFloat(i.saldo_attuale) || 0), 0)
  );

  const rendimentoNetto = computed(() =>
    investimenti.value.reduce((s, i) => s + (parseFloat(i.rendimento_netto) || 0), 0)
  );

  const fetchInvestimenti = async () => {
    loading.value = true;
    try {
      const { data } = await api.get('/investimenti');
      investimenti.value = data.investimenti;
      patrimonioInvestitoTotale.value = data.patrimonio_investito_totale;
      rendimentoTotale.value = data.rendimento_totale;
      rendimentoTotalePercentuale.value = data.rendimento_totale_percentuale;
      return data;
    } finally {
      loading.value = false;
    }
  };

  const createInvestimento = async (dati) => {
    const { data } = await api.post('/investimenti', dati);
    await fetchInvestimenti();
    return data.investimento;
  };

  const updateInvestimento = async (id, dati) => {
    const { data } = await api.put(`/investimenti/${id}`, dati);
    await fetchInvestimenti();
    return data.investimento;
  };

  const deleteInvestimento = async (id) => {
    await api.delete(`/investimenti/${id}`);
    await fetchInvestimenti();
  };

  const addMovimento = async (id, dati) => {
    const { data } = await api.post(`/investimenti/${id}/movimenti`, dati);
    await fetchInvestimenti();
    return data;
  };

  const fetchAnalisi = async (filtri = {}) => {
    const { data } = await api.get('/investimenti/analisi', { params: filtri });
    analisi.value = data;
    return data;
  };

  const fetchMovimenti = async (id, filtri = {}) => {
    const { data } = await api.get(`/investimenti/${id}/movimenti`, { params: filtri });
    movimenti.value = data.movimenti;
    return data.movimenti;
  };

  const fetchAllMovimenti = async (filtri = {}) => {
    const all = [];
    for (const inv of investimenti.value) {
      const { data } = await api.get(`/investimenti/${inv.id}/movimenti`, { params: filtri });
      all.push(...data.movimenti.map((m) => ({ ...m, investimento_nome: inv.nome_piattaforma })));
    }
    all.sort((a, b) => new Date(b.data) - new Date(a.data));
    movimenti.value = all;
    return all;
  };

  return {
    investimenti,
    analisi,
    movimenti,
    patrimonioInvestitoTotale,
    rendimentoTotale,
    rendimentoTotalePercentuale,
    loading,
    patrimonioInvestito,
    rendimentoNetto,
    fetchInvestimenti,
    createInvestimento,
    updateInvestimento,
    deleteInvestimento,
    addMovimento,
    fetchAnalisi,
    fetchMovimenti,
    fetchAllMovimenti,
  };
});
