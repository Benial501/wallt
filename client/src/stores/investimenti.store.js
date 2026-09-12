import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import api from '@/utils/axios';
import { creaRisorsa } from '@/utils/risorsa';

export const useInvestimentiStore = defineStore('investimenti', () => {
  const risorsaInvestimenti = creaRisorsa(
    async () => {
      const { data } = await api.get('/investimenti');
      return data;
    },
    { iniziale: null, vuotoSe: (d) => !d || (d.investimenti || []).length === 0 },
  );

  const risorsaAnalisi = creaRisorsa(
    async (filtri = {}) => {
      const { data } = await api.get('/investimenti/analisi', { params: filtri });
      return data;
    },
    { iniziale: {} },
  );

  const risorsaMovimenti = creaRisorsa(
    async (id, filtri = {}) => {
      const { data } = await api.get(`/investimenti/${id}/movimenti`, { params: filtri });
      return data.movimenti;
    },
    { iniziale: [] },
  );

  // --- Interfaccia pubblica invariata -------------------------------------
  const investimenti = computed(() => risorsaInvestimenti.data.value?.investimenti || []);
  const analisi = computed(() => risorsaAnalisi.data.value || {});
  const loading = computed(() => risorsaInvestimenti.loading.value);

  const risorsaTuttiMovimenti = creaRisorsa(
    async (filtri = {}) => {
      const all = [];
      for (const inv of investimenti.value) {
        const { data } = await api.get(`/investimenti/${inv.id}/movimenti`, { params: filtri });
        all.push(...data.movimenti.map((m) => ({ ...m, investimento_nome: inv.nome_piattaforma })));
      }
      all.sort((a, b) => new Date(b.data) - new Date(a.data));
      return all;
    },
    { iniziale: [] },
  );

  /**
   * `movimenti` è condiviso da due letture diverse (storico di un singolo
   * investimento o di tutti): vince l'ultima invocata esplicitamente dalla
   * vista, non quella con l'aggiornamento più recente. Se la vista ha chiesto
   * lo storico di un investimento e la richiesta fallisce, non deve
   * ricomparire silenziosamente lo storico di "tutti" da una fetch precedente.
   */
  const fonteMovimenti = ref('tutti');
  const movimenti = computed(() => (
    fonteMovimenti.value === 'singolo' ? risorsaMovimenti.data.value : risorsaTuttiMovimenti.data.value
  ));

  /**
   * Cifre di rendimento mostrate in dashboard: stesso calcolo che prima
   * veniva assegnato dentro fetchInvestimenti, ora letto dalla risorsa.
   */
  const patrimonioInvestitoTotale = computed(() => risorsaInvestimenti.data.value?.patrimonio_investito_totale ?? 0);
  const rendimentoTotale = computed(() => risorsaInvestimenti.data.value?.rendimento_totale ?? 0);
  const rendimentoTotalePercentuale = computed(() => risorsaInvestimenti.data.value?.rendimento_totale_percentuale ?? 0);

  const patrimonioInvestito = computed(() =>
    investimenti.value.reduce((s, i) => s + (parseFloat(i.saldo_attuale) || 0), 0)
  );

  const rendimentoNetto = computed(() =>
    investimenti.value.reduce((s, i) => s + (parseFloat(i.rendimento_netto) || 0), 0)
  );

  const fetchInvestimenti = () => risorsaInvestimenti.carica();

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

  const fetchAnalisi = (filtri = {}) => risorsaAnalisi.carica(filtri);

  const fetchMovimenti = (id, filtri = {}) => {
    fonteMovimenti.value = 'singolo';
    return risorsaMovimenti.carica(id, filtri);
  };

  const fetchAllMovimenti = (filtri = {}) => {
    fonteMovimenti.value = 'tutti';
    return risorsaTuttiMovimenti.carica(filtri);
  };

  const reset = () => {
    risorsaInvestimenti.reset();
    risorsaAnalisi.reset();
    risorsaMovimenti.reset();
    risorsaTuttiMovimenti.reset();
    fonteMovimenti.value = 'tutti';
  };

  return {
    risorsaInvestimenti,
    risorsaAnalisi,
    risorsaMovimenti,
    risorsaTuttiMovimenti,
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
    reset,
  };
});
