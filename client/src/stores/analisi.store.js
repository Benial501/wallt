import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import api from '@/utils/axios';
import { creaRisorsa } from '@/utils/risorsa';

const PERIODO_LEGACY = { 3: '3m', 6: '6m', 12: '1a' };

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

  /**
   * Andamento del patrimonio: un punto per periodo, con la stessa unita' del
   * confronto. Con `da`/`a` (periodo "Custom") l'API usa i mesi
   * dell'intervallo e ignora unita/quantita.
   *
   * `periodo` viene inviato accanto ai parametri nuovi per la stessa ragione
   * di risorsaConfronto: durante un rilascio l'API puo' essere ancora
   * quella precedente, che conosce solo quel parametro.
   */
  const risorsaAndamento = creaRisorsa(
    async ({ unita = 'mese', quantita = 6, da, a } = {}) => {
      const params = da && a ? { da, a } : { unita, quantita };
      if (!da && unita === 'mese') params.periodo = PERIODO_LEGACY[quantita] || '6m';
      const { data } = await api.get('/analisi/andamento-patrimonio', { params });
      return data;
    },
    { iniziale: {}, vuotoSe: (d) => !d || (d.punti || []).length === 0 },
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
  const andamentoPatrimonio = computed(() => risorsaAndamento.data.value || {});
  const suggerimenti = computed(() => risorsaSuggerimenti.data.value?.suggerimenti || []);

  /**
   * Compatibilità: `loading` era condiviso da tutte e cinque le letture.
   * Le viste non ancora migrate lo leggono ancora, quindi resta come somma
   * logica. Le viste migrate devono usare lo stato della singola risorsa.
   */
  const loading = computed(() => (
    risorsaSpese.loading.value
    || risorsaEntrate.loading.value
    || risorsaConfronto.loading.value
    || risorsaAndamento.loading.value
    || risorsaSuggerimenti.loading.value
  ));

  const fetchDistribuzioneSpese = (da, a) => risorsaSpese.carica(da, a);
  const fetchDistribuzioneEntrate = (da, a) => risorsaEntrate.carica(da, a);
  const fetchConfrontoPeriodi = (opzioni = {}) => risorsaConfronto.carica(opzioni);
  const fetchAndamentoPatrimonio = (opzioni = {}) => risorsaAndamento.carica(opzioni);
  const fetchSuggerimenti = () => risorsaSuggerimenti.carica();

  const reset = () => {
    risorsaSpese.reset();
    risorsaEntrate.reset();
    risorsaConfronto.reset();
    risorsaAndamento.reset();
    risorsaSuggerimenti.reset();
    periodoSelezionato.value = 'mese';
  };

  return {
    risorsaSpese, risorsaEntrate, risorsaConfronto, risorsaAndamento, risorsaSuggerimenti,
    distribuzioneSpese, totaleSpese, distribuzioneEntrate, totaleEntrate,
    confrontoPeriodi, confrontoUnita, andamentoPatrimonio, suggerimenti,
    loading, periodoSelezionato,
    fetchDistribuzioneSpese, fetchDistribuzioneEntrate, fetchConfrontoPeriodi,
    fetchAndamentoPatrimonio, fetchSuggerimenti,
    reset,
  };
});
