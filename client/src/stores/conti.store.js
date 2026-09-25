import { defineStore } from 'pinia';
import { computed } from 'vue';
import { useAuthStore } from '@/stores/auth.store';
import api from '@/utils/axios';
import { refreshAfterWrite } from '@/utils/afterWrite';
import { creaRisorsa } from '@/utils/risorsa';

export const useContiStore = defineStore('conti', () => {
  const authStore = useAuthStore();

  const risorsaConti = creaRisorsa(
    async () => {
      const { data } = await api.get('/conti');
      return data;
    },
    { iniziale: null, vuotoSe: (d) => !d || (d.conti || []).length === 0 },
  );

  const risorsaPatrimonio = creaRisorsa(
    async () => {
      const { data } = await api.get('/conti/patrimonio');
      return data;
    },
    { iniziale: null },
  );

  // --- Interfaccia pubblica invariata -------------------------------------
  // Le viste non ancora migrate continuano a leggere questi nomi.
  const conti = computed(() => risorsaConti.data.value?.conti || []);
  const loading = computed(() => risorsaConti.loading.value);

  /**
   * Il patrimonio arriva da due endpoint che usano la stessa identica
   * formula (conti attivi + investimenti attivi). Vince quello dedicato
   * quando c'è, perché porta anche la scomposizione.
   */
  const patrimonioTotale = computed(() => (
    risorsaPatrimonio.data.value?.totale
    ?? risorsaConti.data.value?.patrimonio_totale
    ?? 0
  ));
  const variazioneImporto = computed(() => risorsaPatrimonio.data.value?.variazione_importo || 0);
  const variazionePercentuale = computed(() => risorsaPatrimonio.data.value?.variazione_percentuale || 0);

  const contiAttivi = computed(() => conti.value.filter((c) => c.attivo));

  const patrimonioFormattato = computed(() => {
    const valuta = authStore.user?.valuta || 'EUR';
    return new Intl.NumberFormat('it-IT', { style: 'currency', currency: valuta }).format(patrimonioTotale.value || 0);
  });

  /**
   * Le tre voci mostrate sotto il totale. Il server le manda già entrambe
   * (`totale_conti`, `totale_investimenti`): prima venivano scartate, ed è
   * il motivo per cui la scheda poteva solo dire un numero senza spiegarlo.
   */
  const composizionePatrimonio = computed(() => {
    const p = risorsaPatrimonio.data.value;
    // `null` finché la risposta dedicata non c'è. Il totale ha un fallback
    // su /conti, la scomposizione no: restituire zeri la farebbe contraddire
    // il numero scritto sopra, ed è proprio l'invariante che la scheda deve
    // rendere evidente. Meglio nessuna composizione che una falsa.
    if (!p) return null;
    return {
      totale: patrimonioTotale.value,
      conti: p.totale_conti ?? 0,
      investimenti: p.totale_investimenti ?? 0,
    };
  });

  /**
   * Quanto è davvero spendibile. Arriva dallo stesso endpoint del
   * patrimonio, quindi i due numeri che la home mostra uno sotto l'altro
   * non possono riferirsi a momenti diversi. `null` finché la risposta non
   * c'è: non esiste un fallback sensato: dire "0" sarebbe un'informazione
   * falsa, dire il patrimonio sarebbe peggio.
   */
  const saldoEffettivo = computed(() => risorsaPatrimonio.data.value?.saldo_effettivo ?? null);
  const saldoEffettivoDettaglio = computed(
    () => risorsaPatrimonio.data.value?.saldo_effettivo_dettaglio ?? null,
  );

  const fetchConti = () => risorsaConti.carica();
  const fetchPatrimonio = () => risorsaPatrimonio.carica();

  /** Ricariche post-scrittura: non devono far fallire un'operazione già riuscita. */
  const refreshDopoScrittura = (tipo) => refreshAfterWrite(
    () => fetchConti(),
    () => fetchPatrimonio(),
    ...(tipo === 'scommesse' || tipo === true
      ? [async () => {
        const { useScommesseStore } = await import('./scommesse.store');
        return useScommesseStore().fetchPiattaforme();
      }]
      : []),
  );

  const createConto = async (dati) => {
    const { data } = await api.post('/conti', dati);
    await refreshDopoScrittura(dati.tipo);
    return data;
  };

  const updateConto = async (id, dati, options = {}) => {
    const { data } = await api.put(`/conti/${id}`, dati);
    await refreshDopoScrittura(options.tipo);
    return data.conto;
  };

  const deleteConto = async (id, options = {}) => {
    await api.delete(`/conti/${id}`);
    await refreshDopoScrittura(options.tipo);
  };

  const trasferimento = async (dati, options = {}) => {
    try {
      const { data } = await api.post('/conti/trasferimento', dati);
      await refreshDopoScrittura(options.involvesScommesse === true);
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

  const reset = () => {
    risorsaConti.reset();
    risorsaPatrimonio.reset();
  };

  return {
    risorsaConti,
    risorsaPatrimonio,
    conti,
    patrimonioTotale,
    variazioneImporto,
    variazionePercentuale,
    loading,
    contiAttivi,
    patrimonioFormattato,
    composizionePatrimonio,
    saldoEffettivo,
    saldoEffettivoDettaglio,
    fetchConti,
    fetchPatrimonio,
    createConto,
    updateConto,
    deleteConto,
    trasferimento,
    reset,
  };
});
