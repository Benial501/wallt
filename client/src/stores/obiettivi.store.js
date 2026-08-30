import { defineStore } from 'pinia';
import { ref } from 'vue';
import api from '@/utils/axios';

export const useObiettiviStore = defineStore('obiettivi', () => {
  const obiettivi = ref({ attivi: [], completati: [] });
  const loading = ref(false);

  const fetchObiettivi = async () => {
    loading.value = true;
    try {
      const { data } = await api.get('/obiettivi');
      obiettivi.value = { attivi: data.attivi, completati: data.completati };
      return data;
    } finally {
      loading.value = false;
    }
  };

  const createObiettivo = async (dati) => {
    const { data } = await api.post('/obiettivi', dati);
    await fetchObiettivi();
    return data.obiettivo;
  };

  const updateObiettivo = async (id, dati) => {
    const { data } = await api.put(`/obiettivi/${id}`, dati);
    await fetchObiettivi();
    return data.obiettivo;
  };

  const deleteObiettivo = async (id) => {
    await api.delete(`/obiettivi/${id}`);
    await fetchObiettivi();
  };

  const addContributo = async (id, dati) => {
    const { data } = await api.post(`/obiettivi/${id}/contributi`, dati);
    await fetchObiettivi();
    return data;
  };

  const fetchProiezione = async (id) => {
    const { data } = await api.get(`/obiettivi/${id}/proiezione`);
    return data;
  };

  return {
    obiettivi, loading,
    fetchObiettivi, createObiettivo, updateObiettivo, deleteObiettivo,
    addContributo, fetchProiezione,
  };
});
