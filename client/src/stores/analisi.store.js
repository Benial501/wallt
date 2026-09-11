import { defineStore } from 'pinia';
import { ref } from 'vue';
import api from '@/utils/axios';

export const useAnalisiStore = defineStore('analisi', () => {
  const distribuzioneSpese = ref([]);
  const totaleSpese = ref(0);
  const distribuzioneEntrate = ref([]);
  const totaleEntrate = ref(0);
  const confrontoPeriodi = ref([]);
  // Unita' dell'ultimo confronto caricato: la vista la usa per le etichette.
  const confrontoUnita = ref('mese');
  const andamentoPatrimonio = ref({});
  const suggerimenti = ref([]);
  const loading = ref(false);
  const periodoSelezionato = ref('mese');

  const fetchDistribuzioneSpese = async (da, a) => {
    loading.value = true;
    try {
      const { data } = await api.get('/analisi/distribuzione-spese', { params: { da, a } });
      distribuzioneSpese.value = data.distribuzione;
      totaleSpese.value = data.totale;
      return data;
    } finally {
      loading.value = false;
    }
  };

  const fetchDistribuzioneEntrate = async (da, a) => {
    loading.value = true;
    try {
      const { data } = await api.get('/analisi/distribuzione-entrate', { params: { da, a } });
      distribuzioneEntrate.value = data.distribuzione;
      totaleEntrate.value = data.totale;
      return data;
    } finally {
      loading.value = false;
    }
  };

  /**
   * Confronto fra periodi. L'unita' segue il periodo scelto nella pagina:
   * settimane, mesi o anni. Con `da`/`a` (periodo "Custom") l'API risponde
   * invece con i mesi toccati dall'intervallo e ignora unita/quantita.
   *
   * `mesi` viene inviato accanto a `quantita` per i soli mesi: durante un
   * rilascio l'API puo' essere ancora la versione precedente, che conosce
   * solo quel parametro. Vedi il commento in analisi.controller.js.
   */
  const fetchConfrontoPeriodi = async ({ unita = 'mese', quantita = 6, da, a } = {}) => {
    loading.value = true;
    try {
      const params = da && a ? { da, a } : { unita, quantita };
      if (!da && unita === 'mese') params.mesi = quantita;
      const { data } = await api.get('/analisi/confronto-mesi', { params });
      confrontoPeriodi.value = data.mesi;
      confrontoUnita.value = data.unita || (da && a ? 'mese' : unita);
      return data;
    } finally {
      loading.value = false;
    }
  };

  /**
   * Andamento del patrimonio: un punto per periodo, con la stessa unita' del
   * confronto. Con `da`/`a` (periodo "Custom") l'API usa i mesi
   * dell'intervallo e ignora unita/quantita.
   *
   * `periodo` viene inviato accanto ai parametri nuovi per la stessa ragione
   * di fetchConfrontoPeriodi: durante un rilascio l'API puo' essere ancora
   * quella precedente, che conosce solo quel parametro.
   */
  const PERIODO_LEGACY = { 3: '3m', 6: '6m', 12: '1a' };

  const fetchAndamentoPatrimonio = async ({ unita = 'mese', quantita = 6, da, a } = {}) => {
    loading.value = true;
    try {
      const params = da && a ? { da, a } : { unita, quantita };
      if (!da && unita === 'mese') params.periodo = PERIODO_LEGACY[quantita] || '6m';
      const { data } = await api.get('/analisi/andamento-patrimonio', { params });
      andamentoPatrimonio.value = data;
      return data;
    } finally {
      loading.value = false;
    }
  };

  const fetchSuggerimenti = async () => {
    loading.value = true;
    try {
      const { data } = await api.get('/analisi/suggerimenti');
      suggerimenti.value = data.suggerimenti;
      return data;
    } finally {
      loading.value = false;
    }
  };

  return {
    distribuzioneSpese, totaleSpese, distribuzioneEntrate, totaleEntrate,
    confrontoPeriodi, confrontoUnita, andamentoPatrimonio, suggerimenti, loading, periodoSelezionato,
    fetchDistribuzioneSpese, fetchDistribuzioneEntrate, fetchConfrontoPeriodi,
    fetchAndamentoPatrimonio, fetchSuggerimenti,
  };
});
