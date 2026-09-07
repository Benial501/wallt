import { defineStore } from 'pinia';
import { ref } from 'vue';
import api, { IMPORT_TIMEOUT } from '@/utils/axios';

export const useImportazioniStore = defineStore('importazioni', () => {
  const preview = ref(null);
  const loading = ref(false);
  const error = ref(null);

  const upload = async (file) => {
    loading.value = true;
    error.value = null;

    try {
      const formData = new FormData();
      formData.append('file', file);

      const { data } = await api.post('/importazioni/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: IMPORT_TIMEOUT,
      });

      preview.value = data;
      return data;
    } catch (err) {
      if (err.response?.status === 429) {
        error.value = err.response?.data?.error || 'Troppi tentativi di import. Riprova tra qualche minuto.';
      } else {
        error.value = err.response?.data?.error || err.response?.data?.message || 'Errore upload import';
      }
      throw err;
    } finally {
      loading.value = false;
    }
  };

  const conferma = async (transactions, { aggiornaSaldo = false } = {}) => {
    loading.value = true;
    error.value = null;

    try {
      const { data } = await api.post('/importazioni/conferma', {
        transactions,
        aggiorna_saldo: !!aggiornaSaldo,
      }, { timeout: IMPORT_TIMEOUT });
      return data;
    } catch (err) {
      if (err.response?.status === 429) {
        error.value = err.response?.data?.error || 'Troppi tentativi di import. Riprova tra qualche minuto.';
      } else if (err.code === 'ECONNABORTED') {
        // Il server puo' aver completato comunque: dire "errore" e basta
        // porterebbe a ripetere l'import credendolo fallito.
        error.value = 'L\'import sta ancora finendo sul server. Ricarica i movimenti fra qualche secondo prima di riprovare: potrebbero essere gia\' stati salvati.';
      } else {
        error.value = err.response?.data?.error || err.response?.data?.message || 'Errore conferma import';
      }
      throw err;
    } finally {
      loading.value = false;
    }
  };

  const clear = () => {
    preview.value = null;
    error.value = null;
  };

  return {
    preview,
    loading,
    error,
    upload,
    conferma,
    clear,
  };
});

