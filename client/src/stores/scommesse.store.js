import { defineStore } from 'pinia';
import { computed } from 'vue';
import api from '@/utils/axios';
import { creaRisorsa } from '@/utils/risorsa';

export const useScommesseStore = defineStore('scommesse', () => {
  const risorsaPiattaforme = creaRisorsa(
    async () => {
      const { data } = await api.get('/scommesse/piattaforme');
      return data.piattaforme;
    },
    { iniziale: [] },
  );

  const risorsaPanoramica = creaRisorsa(
    async () => {
      const { data } = await api.get('/scommesse/panoramica');
      return data;
    },
    { iniziale: {} },
  );

  const risorsaMovimenti = creaRisorsa(
    async (filtri = {}) => {
      const { data } = await api.get('/scommesse/movimenti', { params: filtri });
      return data.movimenti;
    },
    { iniziale: [] },
  );

  const risorsaAnalisi = creaRisorsa(
    async (filtri = {}) => {
      const { data } = await api.get('/scommesse/analisi', { params: filtri });
      return data;
    },
    { iniziale: {} },
  );

  // --- Interfaccia pubblica invariata -------------------------------------
  const piattaforme = computed(() => risorsaPiattaforme.data.value || []);
  const movimenti = computed(() => risorsaMovimenti.data.value || []);
  const panoramica = computed(() => risorsaPanoramica.data.value || {});
  const analisi = computed(() => risorsaAnalisi.data.value || {});
  const loading = computed(() => risorsaPiattaforme.loading.value);

  const fetchPiattaforme = () => risorsaPiattaforme.carica();
  const fetchPanoramica = () => risorsaPanoramica.carica();
  const fetchMovimenti = (filtri = {}) => risorsaMovimenti.carica(filtri);
  const fetchAnalisi = (filtri = {}) => risorsaAnalisi.carica(filtri);

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

  const reset = () => {
    risorsaPiattaforme.reset();
    risorsaPanoramica.reset();
    risorsaMovimenti.reset();
    risorsaAnalisi.reset();
  };

  return {
    risorsaPiattaforme,
    risorsaPanoramica,
    risorsaMovimenti,
    risorsaAnalisi,
    piattaforme,
    movimenti,
    panoramica,
    analisi,
    loading,
    fetchPiattaforme,
    createPiattaforma,
    updatePiattaforma,
    deletePiattaforma,
    addMovimento,
    fetchPanoramica,
    fetchMovimenti,
    fetchAnalisi,
    reset,
  };
});
