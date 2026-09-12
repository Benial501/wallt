import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import api from '@/utils/axios';
import { creaRisorsa } from '@/utils/risorsa';

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
  const risorsaMovimenti = creaRisorsa(
    async (params = {}) => {
      const { data } = await api.get('/movimenti', { params: { ...params, page: 1, limit: PAGE_SIZE } });
      return data;
    },
    { iniziale: null, vuotoSe: (d) => !d || (d.gruppi || []).length === 0 },
  );

  /**
   * Ultime transazioni della home. L'API può rispondere con `movimenti`
   * già piatti oppure con `gruppi` da appiattire: la normalizzazione stava
   * già nel codice precedente e va conservata, altrimenti la home resta
   * vuota su una delle due forme di risposta.
   */
  const risorsaRecenti = creaRisorsa(
    async ({ limit = 6 } = {}) => {
      const { data } = await api.get('/movimenti', {
        params: { limit, ordine: 'caricamento', solo_conti_attivi: true },
      });
      const flat = Array.isArray(data?.movimenti) ? data.movimenti : [];
      if (flat.length) return flat;
      if (Array.isArray(data?.gruppi)) {
        return data.gruppi.flatMap((g) =>
          (g.movimenti || []).map((m) => ({ ...m, dataLabel: g.label })),
        );
      }
      return [];
    },
    { iniziale: [] },
  );

  // Un bilancio a zero è un dato legittimo, non un'assenza: senza questo
  // `vuotoSe`, un mese senza movimenti mostrerebbe uno stato vuoto al posto
  // di "0,00 €".
  const risorsaBilancio = creaRisorsa(
    async (mese, anno) => {
      const { data } = await api.get('/movimenti/bilancio', { params: { mese, anno } });
      return data;
    },
    { iniziale: {}, vuotoSe: () => false },
  );

  // --- Interfaccia pubblica invariata -------------------------------------
  const recentiHome = computed(() => risorsaRecenti.data.value || []);
  const bilancioMese = computed(() => risorsaBilancio.data.value || {});
  const filtri = ref({});
  const loading = computed(() => risorsaMovimenti.loading.value);
  const loadingBilancio = computed(() => risorsaBilancio.loading.value);
  const loadingRecenti = computed(() => risorsaRecenti.loading.value);

  /** Gruppi accumulati dalle pagine successive alla prima. */
  const paginaExtra = ref([]);
  const loadingMore = ref(false);
  const errorMore = ref(null);
  const paginaCorrente = ref(1);

  const movimentiPerData = computed(() => {
    const prima = risorsaMovimenti.data.value?.gruppi || [];
    return paginaExtra.value.length ? mergeGruppi(prima, paginaExtra.value) : prima;
  });

  const pagination = computed(() => ({
    page: paginaCorrente.value,
    total: risorsaMovimenti.data.value?.pagination?.total || 0,
    pages: risorsaMovimenti.data.value?.pagination?.pages || 0,
  }));

  const fetchMovimenti = async (params = {}) => {
    filtri.value = params;
    // Una nuova ricerca annulla le pagine accumulate: appartenevano ai
    // filtri precedenti.
    paginaExtra.value = [];
    paginaCorrente.value = 1;
    errorMore.value = null;
    return risorsaMovimenti.carica(params);
  };

  /**
   * Una pagina successiva che fallisce non rende vecchi i dati già a
   * schermo: sono validi e freschi, manca solo il seguito. L'errore resta
   * quindi locale al pulsante e non passa da DataState.
   */
  const loadMoreMovimenti = async () => {
    if (loadingMore.value) return;
    loadingMore.value = true;
    errorMore.value = null;
    try {
      const { data } = await api.get('/movimenti', {
        params: { ...filtri.value, page: paginaCorrente.value + 1, limit: PAGE_SIZE },
      });
      paginaExtra.value = mergeGruppi(paginaExtra.value, data.gruppi || []);
      paginaCorrente.value += 1;
    } catch (e) {
      errorMore.value = e;
    } finally {
      loadingMore.value = false;
    }
  };

  const fetchBilancioMese = (mese, anno) => risorsaBilancio.carica(mese, anno);

  /** Ultime transazioni per la home: la cache resta in `risorsaRecenti.data`. */
  const fetchRecentiHome = (opzioni = {}) => risorsaRecenti.carica(opzioni);

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

  const reset = () => {
    risorsaMovimenti.reset();
    risorsaRecenti.reset();
    risorsaBilancio.reset();
    paginaExtra.value = [];
    paginaCorrente.value = 1;
    errorMore.value = null;
    filtri.value = {};
  };

  return {
    risorsaMovimenti,
    risorsaRecenti,
    risorsaBilancio,
    movimentiPerData,
    recentiHome,
    bilancioMese,
    filtri,
    pagination,
    loading,
    loadingMore,
    loadingBilancio,
    loadingRecenti,
    errorMore,
    fetchMovimenti,
    fetchRecentiHome,
    loadMoreMovimenti,
    fetchBilancioMese,
    createMovimento,
    updateMovimento,
    deleteMovimento,
    fetchRicorrenti,
    reset,
  };
});
