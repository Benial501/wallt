import { defineStore } from 'pinia';
import { ref } from 'vue';
import api from '@/utils/axios';

const PAGE_SIZE = 100;

const saldoInsufficienteMsg = (err) => {
  const data = err.response?.data;
  if (data?.error === 'Saldo insufficiente') {
    const saldo = parseFloat(data.saldo_disponibile || 0).toFixed(2);
    return `Saldo insufficiente: disponibili €${saldo}`;
  }
  return data?.messaggio || data?.message || data?.error || 'Errore';
};

const mergeGruppi = (existing, incoming) => {
  const map = new Map(
    existing.map((g) => [g.data, {
      ...g,
      movimenti: [...g.movimenti],
    }]),
  );

  incoming.forEach((g) => {
    const current = map.get(g.data);
    if (current) {
      current.movimenti.push(...g.movimenti);
      current.totale_entrate_giorno = Math.round((current.totale_entrate_giorno + g.totale_entrate_giorno) * 100) / 100;
      current.totale_uscite_giorno = Math.round((current.totale_uscite_giorno + g.totale_uscite_giorno) * 100) / 100;
    } else {
      map.set(g.data, { ...g, movimenti: [...g.movimenti] });
    }
  });

  return Array.from(map.values()).sort((a, b) => b.data.localeCompare(a.data));
};

export const useMovimentiStore = defineStore('movimenti', () => {
  const movimentiPerData = ref([]);
  const recentiHome = ref([]);
  const bilancioMese = ref({});
  const filtri = ref({});
  const pagination = ref({ page: 1, total: 0, pages: 0 });
  const loading = ref(false);
  const loadingMore = ref(false);
  const loadingBilancio = ref(false);
  const loadingRecenti = ref(false);

  const fetchMovimenti = async (params = {}, { append = false } = {}) => {
    if (append) loadingMore.value = true;
    else loading.value = true;

    const page = append ? pagination.value.page + 1 : 1;
    const requestParams = { ...params, page, limit: PAGE_SIZE };
    filtri.value = params;

    try {
      const { data } = await api.get('/movimenti', { params: requestParams });
      movimentiPerData.value = append
        ? mergeGruppi(movimentiPerData.value, data.gruppi)
        : data.gruppi;
      pagination.value = data.pagination;
      return data;
    } finally {
      loading.value = false;
      loadingMore.value = false;
    }
  };

  const loadMoreMovimenti = () => fetchMovimenti(filtri.value, { append: true });

  const fetchBilancioMese = async (mese, anno) => {
    loadingBilancio.value = true;
    try {
      const { data } = await api.get('/movimenti/bilancio', { params: { mese, anno } });
      bilancioMese.value = data;
      return data;
    } catch {
      return null;
    } finally {
      loadingBilancio.value = false;
    }
  };

  /** Ultime transazioni per la home: cache in store così restano visibili tra navigazioni. */
  const fetchRecentiHome = async ({ limit = 6 } = {}) => {
    const hadCache = recentiHome.value.length > 0;
    if (!hadCache) loadingRecenti.value = true;
    try {
      const { data } = await api.get('/movimenti', {
        params: { limit, ordine: 'caricamento', solo_conti_attivi: true },
      });
      const flat = Array.isArray(data?.movimenti) ? data.movimenti : [];
      if (flat.length) {
        recentiHome.value = flat;
      } else if (Array.isArray(data?.gruppi)) {
        recentiHome.value = data.gruppi.flatMap((g) =>
          (g.movimenti || []).map((m) => ({ ...m, dataLabel: g.label })),
        );
      } else {
        recentiHome.value = [];
      }
      return recentiHome.value;
    } catch {
      // In caso di errore di rete/rate-limit, mantieni la cache precedente.
      return recentiHome.value;
    } finally {
      loadingRecenti.value = false;
    }
  };

  const createMovimento = async (dati) => {
    try {
      const { data } = await api.post('/movimenti', dati);
      return data;
    } catch (err) {
      const error = new Error(saldoInsufficienteMsg(err));
      error.response = err.response;
      throw error;
    }
  };

  const updateMovimento = async (id, dati) => {
    const { data } = await api.put(`/movimenti/${id}`, dati);
    return data;
  };

  const deleteMovimento = async (id) => {
    await api.delete(`/movimenti/${id}`);
  };

  const fetchRicorrenti = async () => {
    const { data } = await api.get('/movimenti/ricorrenti');
    return data.movimenti;
  };

  return {
    movimentiPerData,
    recentiHome,
    bilancioMese,
    filtri,
    pagination,
    loading,
    loadingMore,
    loadingBilancio,
    loadingRecenti,
    fetchMovimenti,
    fetchRecentiHome,
    loadMoreMovimenti,
    fetchBilancioMese,
    createMovimento,
    updateMovimento,
    deleteMovimento,
    fetchRicorrenti,
  };
});
