import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import api from '@/utils/axios';
import { creaRisorsa } from '@/utils/risorsa';

export const useAnalisiStore = defineStore('analisi', () => {
  const periodoSelezionato = ref('mese');

  const risorsaSpese = creaRisorsa(
    async (da, a) => {
      const { data } = await api.get('/analisi/distribuzione-spese', { params: { da, a } });
      return data;
    },
    { iniziale: null, vuotoSe: (d) => !d || (d.distribuzione || []).length === 0 },
  );

  const risorsaEntrate = creaRisorsa(
    async (da, a) => {
      const { data } = await api.get('/analisi/distribuzione-entrate', { params: { da, a } });
      return data;
    },
    { iniziale: null, vuotoSe: (d) => !d || (d.distribuzione || []).length === 0 },
  );

  /**
   * Confronto fra periodi. L'unita' segue il periodo scelto nella pagina:
   * settimane, mesi o anni. Con `da`/`a` (periodo "Custom") l'API risponde
   * invece con i mesi toccati dall'intervallo e ignora unita/quantita.
   *
   * `mesi` viene inviato accanto a `quantita` per i soli mesi: durante un
   * rilascio l'API puo' essere ancora la versione precedente, che conosce
   * solo quel parametro. Vedi il commento in analisi.controller.js.
   */
  const risorsaConfronto = creaRisorsa(
    async ({ unita = 'mese', quantita = 6, da, a } = {}) => {
      const params = da && a ? { da, a } : { unita, quantita };
      if (!da && unita === 'mese') params.mesi = quantita;
      const { data } = await api.get('/analisi/confronto-mesi', { params });
      return { ...data, unitaRichiesta: data.unita || (da && a ? 'mese' : unita) };
    },
    { iniziale: null, vuotoSe: (d) => !d || (d.mesi || []).length === 0 },
  );

  const risorsaSuggerimenti = creaRisorsa(
    async () => {
      const { data } = await api.get('/analisi/suggerimenti');
      return data;
    },
    { iniziale: null, vuotoSe: (d) => !d || (d.suggerimenti || []).length === 0 },
  );

  // --- Interfaccia pubblica invariata -------------------------------------
  const distribuzioneSpese = computed(() => risorsaSpese.data.value?.distribuzione || []);
  const totaleSpese = computed(() => risorsaSpese.data.value?.totale || 0);
  const distribuzioneEntrate = computed(() => risorsaEntrate.data.value?.distribuzione || []);
  const totaleEntrate = computed(() => risorsaEntrate.data.value?.totale || 0);
  const confrontoPeriodi = computed(() => risorsaConfronto.data.value?.mesi || []);
  const confrontoUnita = computed(() => risorsaConfronto.data.value?.unitaRichiesta || 'mese');
  const suggerimenti = computed(() => risorsaSuggerimenti.data.value?.suggerimenti || []);

  const fetchDistribuzioneSpese = (da, a) => risorsaSpese.carica(da, a);
  const fetchDistribuzioneEntrate = (da, a) => risorsaEntrate.carica(da, a);
  const fetchConfrontoPeriodi = (opzioni = {}) => risorsaConfronto.carica(opzioni);
  const fetchSuggerimenti = () => risorsaSuggerimenti.carica();

  const reset = () => {
    risorsaSpese.reset();
    risorsaEntrate.reset();
    risorsaConfronto.reset();
    risorsaSuggerimenti.reset();
    periodoSelezionato.value = 'mese';
  };

  return {
    risorsaSpese, risorsaEntrate, risorsaConfronto, risorsaSuggerimenti,
    distribuzioneSpese, totaleSpese, distribuzioneEntrate, totaleEntrate,
    confrontoPeriodi, confrontoUnita, suggerimenti,
    periodoSelezionato,
    fetchDistribuzioneSpese, fetchDistribuzioneEntrate, fetchConfrontoPeriodi,
    fetchSuggerimenti,
    reset,
  };
});
