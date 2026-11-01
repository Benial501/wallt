import { defineStore } from 'pinia';
import { computed } from 'vue';
import api from '@/utils/axios';
import { creaRisorsa } from '@/utils/risorsa';

/**
 * Gli abbonamenti: un quadro da leggere, che non muove denaro.
 *
 * Il server rilegge le transazioni a ogni `GET /abbonamenti`, quindi ricaricare è
 * anche il modo per vedere un servizio appena pagato. Conti e totali arrivano
 * già fatti: qui non si ricalcola nulla (CLAUDE.md Regola 28).
 */
export const useAbbonamentiStore = defineStore('abbonamenti', () => {
  const risorsa = creaRisorsa(
    async () => {
      const { data } = await api.get('/abbonamenti');
      return data;
    },
    { vuotoSe: (d) => !d || (d.attivi.length === 0 && d.non_attivi.length === 0) },
  );

  const attivi = computed(() => risorsa.data.value?.attivi ?? []);
  const nonAttivi = computed(() => risorsa.data.value?.non_attivi ?? []);
  const totali = computed(() => risorsa.data.value?.totali ?? null);
  const stato = computed(() => risorsa.stato.value);
  const lastUpdated = computed(() => risorsa.lastUpdated.value);

  const fetchAbbonamenti = () => risorsa.carica();
  const reset = () => risorsa.reset();

  // La scrittura è già riuscita quando la rilettura parte: `carica` non lancia,
  // e un suo errore resta uno stato della risorsa, non un salvataggio fallito.
  const dopoScrittura = async (richiesta) => {
    const { data } = await richiesta;
    await fetchAbbonamenti();
    return data.abbonamento;
  };

  const crea = (dati) => dopoScrittura(api.post('/abbonamenti', dati));
  const modifica = (id, dati) => dopoScrittura(api.put(`/abbonamenti/${id}`, dati));
  const annulla = (id) => dopoScrittura(api.patch(`/abbonamenti/${id}/annulla`));
  const escludi = (id) => dopoScrittura(api.patch(`/abbonamenti/${id}/escludi`));
  const ripristina = (id) => dopoScrittura(api.patch(`/abbonamenti/${id}/ripristina`));

  return {
    attivi, nonAttivi, totali, stato, lastUpdated, fetchAbbonamenti, crea, modifica, annulla, escludi, ripristina, reset,
  };
});
