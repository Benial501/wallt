import { defineStore } from 'pinia';
import { ref } from 'vue';
import api from '@/utils/axios';

export const useScommesseStore = defineStore('scommesse', () => {
  const piattaforme = ref([]);
  const movimenti = ref([]);
  const panoramica = ref({});
  const analisi = ref({});
  const loading = ref(false);

  const fetchPiattaforme = async () => {
    loading.value = true;
    try {
      const { data } = await api.get('/scommesse/piattaforme');
      piattaforme.value = data.piattaforme;
      return data.piattaforme;
    } finally {
      loading.value = false;
    }
  };

  const createPiattaforma = async (dati) => {
    const { data } = await api.post('/scommesse/piattaforme', dati);
    await fetchPiattaforme();
    await fetchPanoramica();
    const { useContiStore } = await import('./conti.store');
    await useContiStore().fetchConti();
    await useContiStore().fetchPatrimonio();
    return data.piattaforma;
  };

  const updatePiattaforma = async (id, dati) => {
    const { data } = await api.put(`/scommesse/piattaforme/${id}`, dati);
    await fetchPiattaforme();
    return data.piattaforma;
  };

  const deletePiattaforma = async (id) => {
    await api.delete(`/scommesse/piattaforme/${id}`);
    await fetchPiattaforme();
    await fetchPanoramica();
    const { useContiStore } = await import('./conti.store');
    await useContiStore().fetchConti();
    await useContiStore().fetchPatrimonio();
  };

  const addMovimento = async (dati) => {
    const { data } = await api.post('/scommesse/movimenti', dati);
    await fetchPiattaforme();
    await fetchPanoramica();
    await fetchMovimenti();
    const { useContiStore } = await import('./conti.store');
    await useContiStore().fetchPatrimonio();
    return data;
  };

  const fetchPanoramica = async () => {
    try {
      const { data } = await api.get('/scommesse/panoramica');
      panoramica.value = data;
      return data;
    } catch {
      return null;
    }
  };

  const fetchMovimenti = async (filtri = {}) => {
    const { data } = await api.get('/scommesse/movimenti', { params: filtri });
    movimenti.value = data.movimenti;
    return data.movimenti;
  };

  const fetchAnalisi = async (filtri = {}) => {
    try {
      const { data } = await api.get('/scommesse/analisi', { params: filtri });
      analisi.value = data;
      return data;
    } catch {
      return null;
    }
  };

  return {
    piattaforme, movimenti, panoramica, analisi, loading,
    fetchPiattaforme, createPiattaforma, updatePiattaforma, deletePiattaforma,
    addMovimento, fetchPanoramica, fetchMovimenti, fetchAnalisi,
  };
});
