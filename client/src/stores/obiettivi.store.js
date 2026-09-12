import { defineStore } from 'pinia';
import { computed } from 'vue';
import api from '@/utils/axios';
import { creaRisorsa } from '@/utils/risorsa';

export const useObiettiviStore = defineStore('obiettivi', () => {
  const risorsaObiettivi = creaRisorsa(
    async () => {
      const { data } = await api.get('/obiettivi');
      return { attivi: data.attivi, completati: data.completati };
    },
    {
      iniziale: { attivi: [], completati: [] },
      vuotoSe: (d) => !d || ((d.attivi || []).length === 0 && (d.completati || []).length === 0),
    },
  );

  const obiettivi = computed(() => risorsaObiettivi.data.value || { attivi: [], completati: [] });
  const loading = computed(() => risorsaObiettivi.loading.value);

  const fetchObiettivi = () => risorsaObiettivi.carica();
  const reset = () => risorsaObiettivi.reset();

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
    risorsaObiettivi,
    obiettivi, loading,
    fetchObiettivi, createObiettivo, updateObiettivo, deleteObiettivo,
    addContributo, fetchProiezione, reset,
  };
});
