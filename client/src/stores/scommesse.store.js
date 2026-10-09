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

  /**
   * Le operazioni portate dal conto collegato che aspettano di sapere su
   * quale piattaforma è finito il denaro. Vuota per chi non ha un conto
   * collegato: non è uno stato, è una domanda posta ai movimenti.
   */
  const risorsaDaConfermare = creaRisorsa(
    async () => {
      const { data } = await api.get('/scommesse/da-confermare');
      return data.proposte;
    },
    { iniziale: [] },
  );

  // --- Interfaccia pubblica invariata -------------------------------------
  const piattaforme = computed(() => risorsaPiattaforme.data.value || []);
  const movimenti = computed(() => risorsaMovimenti.data.value || []);
  const panoramica = computed(() => risorsaPanoramica.data.value || {});
  const analisi = computed(() => risorsaAnalisi.data.value || {});
  const loading = computed(() => risorsaPiattaforme.loading.value);
  // Attraverso il proxy dello store i ref annidati sono già scompattati:
  // dalla vista si leggono i getter, non `.value` (Regola di codice 23).
  const daConfermare = computed(() => risorsaDaConfermare.data.value || []);
  const statoDaConfermare = computed(() => risorsaDaConfermare.stato.value);
  const lastUpdatedDaConfermare = computed(() => risorsaDaConfermare.lastUpdated.value);

  const fetchPiattaforme = () => risorsaPiattaforme.carica();
  const fetchPanoramica = () => risorsaPanoramica.carica();
  const fetchMovimenti = (filtri = {}) => risorsaMovimenti.carica(filtri);
  const fetchAnalisi = (filtri = {}) => risorsaAnalisi.carica(filtri);
  const fetchDaConfermare = () => risorsaDaConfermare.carica();
  const riprovaDaConfermare = () => risorsaDaConfermare.riprova();

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

  /** Conferma su quale piattaforma è finita un'operazione bancaria. */
  const confermaDaConfermare = async (movimentoId, piattaformaId) => {
    const { data } = await api.post(
      `/scommesse/da-confermare/${movimentoId}/conferma`,
      { piattaforma_id: piattaformaId },
    );
    await fetchDaConfermare();
    await fetchPiattaforme();
    await fetchPanoramica();
    const { useContiStore } = await import('./conti.store');
    await useContiStore().fetchConti();
    await useContiStore().fetchPatrimonio();
    return data;
  };

  /** "Non è un deposito di gioco": la riga resta, la domanda si spegne. */
  const archiviaDaConfermare = async (movimentoId) => {
    await api.post(`/scommesse/da-confermare/${movimentoId}/archivia`);
    await fetchDaConfermare();
  };

  const reset = () => {
    risorsaPiattaforme.reset();
    risorsaPanoramica.reset();
    risorsaMovimenti.reset();
    risorsaAnalisi.reset();
    risorsaDaConfermare.reset();
  };

  return {
    risorsaPiattaforme,
    risorsaPanoramica,
    risorsaMovimenti,
    risorsaAnalisi,
    risorsaDaConfermare,
    piattaforme,
    movimenti,
    panoramica,
    analisi,
    loading,
    daConfermare,
    statoDaConfermare,
    lastUpdatedDaConfermare,
    fetchPiattaforme,
    createPiattaforma,
    updatePiattaforma,
    deletePiattaforma,
    addMovimento,
    fetchPanoramica,
    fetchMovimenti,
    fetchAnalisi,
    fetchDaConfermare,
    riprovaDaConfermare,
    confermaDaConfermare,
    archiviaDaConfermare,
    reset,
  };
});
