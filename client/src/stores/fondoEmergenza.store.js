import { defineStore } from 'pinia';
import { computed } from 'vue';
import api from '@/utils/axios';
import { creaRisorsa } from '@/utils/risorsa';

/**
 * Il fondo di emergenza: un conto separato, fuori dai soldi spendibili, in cui
 * tenere una riserva per gli imprevisti.
 *
 * `GET /fondo-emergenza` risponde 200 anche quando il fondo non esiste, con
 * `esiste: false`: "non ce l'hai" è un dato, non un errore, e la card in home
 * deve poterlo distinguere da una richiesta fallita (vedi creaRisorsa).
 * Per questo `vuotoSe` non guarda `esiste`: la risposta è comunque un dato
 * pronto da mostrare.
 */
export const useFondoEmergenzaStore = defineStore('fondoEmergenza', () => {
  const risorsaFondo = creaRisorsa(
    async () => {
      const { data } = await api.get('/fondo-emergenza');
      return data;
    },
    { vuotoSe: (d) => !d },
  );

  const fondo = computed(() => risorsaFondo.data.value);
  const esiste = computed(() => !!risorsaFondo.data.value?.esiste);

  const fetchFondo = () => risorsaFondo.carica();
  const reset = () => risorsaFondo.reset();

  /** Crea il conto del fondo, vuoto. I soldi vi entrano dopo, con un
   * trasferimento: creare il fondo non muove denaro. */
  const creaFondo = async ({ mesiTarget }) => {
    const { data } = await api.post('/fondo-emergenza', { mesi_target: mesiTarget });
    await fetchFondo();
    return data;
  };

  const aggiornaMesiTarget = async (mesiTarget) => {
    const { data } = await api.patch('/fondo-emergenza', { mesi_target: mesiTarget });
    await fetchFondo();
    return data;
  };

  return {
    risorsaFondo, fondo, esiste, fetchFondo, creaFondo, aggiornaMesiTarget, reset,
  };
});
