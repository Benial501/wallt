import { defineStore } from 'pinia';
import { ref } from 'vue';
import api from '@/utils/axios';

export const useAnalisiStore = defineStore('analisi', () => {
  const distribuzioneSpese = ref([]);
  const totaleSpese = ref(0);
  const confrontoMesi = ref([]);
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

  const fetchConfrontoMesi = async (mesi = 6) => {
    loading.value = true;
    try {
      const { data } = await api.get('/analisi/confronto-mesi', { params: { mesi } });
      confrontoMesi.value = data.mesi;
      return data;
    } finally {
      loading.value = false;
    }
  };

  const fetchAndamentoPatrimonio = async (periodo = '6m') => {
    loading.value = true;
    try {
      const { data } = await api.get('/analisi/andamento-patrimonio', { params: { periodo } });
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
    distribuzioneSpese, totaleSpese, confrontoMesi, andamentoPatrimonio,
    suggerimenti, loading, periodoSelezionato,
    fetchDistribuzioneSpese, fetchConfrontoMesi, fetchAndamentoPatrimonio, fetchSuggerimenti,
  };
});
