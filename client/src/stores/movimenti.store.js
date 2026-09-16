import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import api from '@/utils/axios';
import { creaRisorsa } from '@/utils/risorsa';
import { FILTRI_INIZIALI } from '@/utils/filtriMovimenti';
import { mergeGruppi, ordinePerImporto } from '@/utils/movimentiGruppi';

const PAGE_SIZE = 100;

const saldoInsufficienteMsg = (err) => {
  const data = err.response?.data;
  if (data?.error === 'Saldo insufficiente') {
    const saldo = parseFloat(data.saldo_disponibile || 0).toFixed(2);
    return `Saldo insufficiente: disponibili €${saldo}`;
  }
  return data?.messaggio || data?.message || data?.error || 'Errore';
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

  /**
   * Entrate e uscite di oggi per le due schede della dashboard. Stessa
   * ragione di risorsaBilancio: uno zero è un dato vero ("nessuna spesa
   * oggi"), non un'assenza da mostrare come stato vuoto.
   */
  const risorsaOggi = creaRisorsa(
    async (da, a, oggiStr) => {
      const { data } = await api.get('/movimenti', { params: { da, a, limit: 200 } });
      let entrate = 0;
      let uscite = 0;
      (data?.gruppi || []).forEach((g) => {
        if (g.data === oggiStr) {
          entrate = g.totale_entrate_giorno;
          uscite = g.totale_uscite_giorno;
        }
      });
      return { entrate, uscite };
    },
    { iniziale: { entrate: 0, uscite: 0 }, vuotoSe: () => false },
  );

  // --- Interfaccia pubblica invariata -------------------------------------
  const recentiHome = computed(() => risorsaRecenti.data.value || []);
  const bilancioMese = computed(() => risorsaBilancio.data.value || {});
  const entrateOggi = computed(() => risorsaOggi.data.value?.entrate || 0);
  const usciteOggi = computed(() => risorsaOggi.data.value?.uscite || 0);
  const filtri = ref({});
  /**
   * Stato dei filtri a livello di interfaccia: più ricco dei parametri della
   * query, perché `periodo: 'mese'` non è `da`/`a` e va ricostruito quando si
   * torna alla pagina.
   *
   * Vive in memoria e basta. I blocchi 1-2 hanno escluso il disco per i dati
   * finanziari, e una ricerca salvata può essere altrettanto rivelatrice di un
   * importo. `reset()` lo azzera, quindi `resetPiniaStores()` lo pulisce già
   * al logout senza aggiungere nulla.
   */
  const filtriUI = ref({ ...FILTRI_INIZIALI });
  const impostaFiltriUI = (valore) => { filtriUI.value = { ...valore }; };

  /**
   * Categorie viste nei movimenti recenti, dalla più frequente. Serve alla
   * scorciatoia del pannello filtri: nessun endpoint nuovo per
   * un'informazione che la dashboard carica già.
   */
  const categorieRecenti = computed(() => {
    const conteggi = new Map();
    (risorsaRecenti.data.value || []).forEach((movimento) => {
      if (!movimento.categoria) return;
      conteggi.set(movimento.categoria, (conteggi.get(movimento.categoria) || 0) + 1);
    });
    return [...conteggi.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
  });
  const loading = computed(() => risorsaMovimenti.loading.value);
  const loadingBilancio = computed(() => risorsaBilancio.loading.value);
  const loadingRecenti = computed(() => risorsaRecenti.loading.value);

  /** Gruppi accumulati dalle pagine successive alla prima. */
  const paginaExtra = ref([]);
  const loadingMore = ref(false);
  const errorMore = ref(null);
  const paginaCorrente = ref(1);

  /**
   * Token di generazione condiviso fra la lettura principale, le pagine
   * successive e il reset. `creaRisorsa` ha la propria guardia di sequenza,
   * ma le pagine accumulate vivono FUORI dalla risorsa e ne servono una loro.
   */
  let generazione = 0;

  const movimentiPerData = computed(() => {
    const prima = risorsaMovimenti.data.value?.gruppi || [];
    const perImporto = ordinePerImporto(filtri.value.ordine);
    return paginaExtra.value.length
      ? mergeGruppi(prima, paginaExtra.value, { preservaOrdine: perImporto })
      : prima;
  });

  const pagination = computed(() => ({
    page: paginaCorrente.value,
    total: risorsaMovimenti.data.value?.pagination?.total || 0,
    pages: risorsaMovimenti.data.value?.pagination?.pages || 0,
  }));

  const fetchMovimenti = async (params = {}) => {
    generazione += 1;
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
    const mia = generazione;
    loadingMore.value = true;
    errorMore.value = null;
    try {
      const { data } = await api.get('/movimenti', {
        params: { ...filtri.value, page: paginaCorrente.value + 1, limit: PAGE_SIZE },
      });
      // Se nel frattempo i filtri sono cambiati, queste righe appartengono a
      // una ricerca che non è più a schermo. Mescolarle sarebbe peggio di
      // un errore visibile: sembrerebbero dati veri.
      if (mia !== generazione) return;
      // Stesso flag di movimentiPerData: senza, la pagina 2 di un ordine per
      // importo passa dal ramo che riaccorpa per data e perde l'ordine globale.
      paginaExtra.value = mergeGruppi(paginaExtra.value, data.gruppi || [], {
        preservaOrdine: ordinePerImporto(filtri.value.ordine),
      });
      paginaCorrente.value += 1;
    } catch (e) {
      if (mia !== generazione) return;
      errorMore.value = e;
    } finally {
      // Una sola pagina successiva può essere in volo (guardia in testa),
      // quindi chi finisce è sempre il proprietario del flag.
      loadingMore.value = false;
    }
  };

  const fetchBilancioMese = (mese, anno) => risorsaBilancio.carica(mese, anno);

  /** Ultime transazioni per la home: la cache resta in `risorsaRecenti.data`. */
  const fetchRecentiHome = (opzioni = {}) => risorsaRecenti.carica(opzioni);

  const fetchOggi = (da, a, oggiStr) => risorsaOggi.carica(da, a, oggiStr);

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
    generazione += 1;
    risorsaMovimenti.reset();
    risorsaRecenti.reset();
    risorsaBilancio.reset();
    risorsaOggi.reset();
    paginaExtra.value = [];
    paginaCorrente.value = 1;
    errorMore.value = null;
    filtri.value = {};
    filtriUI.value = { ...FILTRI_INIZIALI };
  };

  return {
    risorsaMovimenti,
    risorsaRecenti,
    risorsaBilancio,
    risorsaOggi,
    movimentiPerData,
    recentiHome,
    bilancioMese,
    entrateOggi,
    usciteOggi,
    filtri,
    filtriUI,
    impostaFiltriUI,
    categorieRecenti,
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
    fetchOggi,
    createMovimento,
    updateMovimento,
    deleteMovimento,
    fetchRicorrenti,
    reset,
  };
});
