import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { useAuthStore } from '@/stores/auth.store';
import api from '@/utils/axios';

export const useContiStore = defineStore('conti', () => {
  const authStore = useAuthStore();
  const conti = ref([]);
  const patrimonioTotale = ref(0);
  const variazioneImporto = ref(0);
  const variazionePercentuale = ref(0);
  const loading = ref(false);

  const contiAttivi = computed(() => conti.value.filter((c) => c.attivo));
  const patrimonioFormattato = computed(() => {
    const valuta = authStore.user?.valuta || 'EUR';
    return new Intl.NumberFormat('it-IT', { style: 'currency', currency: valuta }).format(patrimonioTotale.value || 0);
  });

  const fetchConti = async () => {
    loading.value = true;
    try {
      const { data } = await api.get('/conti');
      conti.value = data.conti;
      patrimonioTotale.value = data.patrimonio_totale;
      return data;
    } finally {
      loading.value = false;
    }
  };

  const fetchPatrimonio = async () => {
    try {
      const { data } = await api.get('/conti/patrimonio');
      patrimonioTotale.value = data.totale;
      variazioneImporto.value = data.variazione_importo;
      variazionePercentuale.value = data.variazione_percentuale;
      return data;
    } catch {
      return null;
    }
  };

  const createConto = async (dati) => {
    const { data } = await api.post('/conti', dati);
    await fetchConti();
    await fetchPatrimonio();
    if (dati.tipo === 'scommesse') {
      const { useScommesseStore } = await import('./scommesse.store');
      await useScommesseStore().fetchPiattaforme();
    }
    return data;
  };

  const updateConto = async (id, dati, options = {}) => {
    const { data } = await api.put(`/conti/${id}`, dati);
    await fetchConti();
    if (options.tipo === 'scommesse') {
      const { useScommesseStore } = await import('./scommesse.store');
      await useScommesseStore().fetchPiattaforme();
    }
    return data.conto;
  };

  const deleteConto = async (id, options = {}) => {
    await api.delete(`/conti/${id}`);
    await fetchConti();
    await fetchPatrimonio();
    if (options.tipo === 'scommesse') {
      const { useScommesseStore } = await import('./scommesse.store');
      await useScommesseStore().fetchPiattaforme();
    }
  };

  const trasferimento = async (dati, options = {}) => {
    try {
      const { data } = await api.post('/conti/trasferimento', dati);
      await fetchConti();
      await fetchPatrimonio();
      if (options.involvesScommesse) {
        const { useScommesseStore } = await import('./scommesse.store');
        await useScommesseStore().fetchPiattaforme();
      }
      return data;
    } catch (err) {
      const data = err.response?.data;
      if (data?.error === 'Saldo insufficiente') {
        const saldo = parseFloat(data.saldo_disponibile || 0).toFixed(2);
        const error = new Error(`Saldo insufficiente: disponibili €${saldo}`);
        error.response = err.response;
        throw error;
      }
      throw err;
    }
  };

  return {
    conti,
    patrimonioTotale,
    variazioneImporto,
    variazionePercentuale,
    loading,
    contiAttivi,
    patrimonioFormattato,
    fetchConti,
    fetchPatrimonio,
    createConto,
    updateConto,
    deleteConto,
    trasferimento,
  };
});
