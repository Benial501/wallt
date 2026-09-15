import { ref, computed } from 'vue';
import { creaRisorsa } from '../utils/risorsa.js';

/**
 * Andamento del patrimonio nel tempo, per il grafico condiviso fra Dashboard
 * e Analisi.
 *
 * Il periodo vive QUI, non nello store. Prima le due viste si contendevano
 * `analisiStore.risorsaAndamento`: finché nessuna delle due aveva un
 * selettore il difetto restava invisibile, ma con un selettore in entrambe
 * scegliere "1 anno" in Analisi cambiava anche la sparkline della Dashboard.
 * Una risorsa per istanza del composable toglie la contesa alla radice.
 *
 * Tutto ciò che esce di qui è un ref di PRIMO LIVELLO, mai l'oggetto risorsa.
 * Dentro un componente una risorsa è un oggetto semplice con ref annidati, e
 * i ref annidati non si scompattano nel template: restituire `{ stato, punti }`
 * elimina la classe di errore invece di chiedere di ricordarsene. È la stessa
 * trappola di client/tests/storeUnwrap.test.js, vista dall'altro lato.
 */

/**
 * "3 mesi" chiede dodici settimane e non tre mesi, perché tre punti non sono
 * una linea. Dodici settimane sono 84 giorni: l'approssimazione è voluta, il
 * tetto settimanale resta 12 per non toccare il selettore del confronto nelle
 * Analisi, e le date vere si leggono sull'asse e nel tooltip.
 */
export const PERIODI_ANDAMENTO = [
  { id: 'giorni_7', label: '7 giorni', unita: 'giorno', quantita: 7 },
  { id: 'giorni_30', label: '30 giorni', unita: 'giorno', quantita: 30 },
  { id: 'mesi_3', label: '3 mesi', unita: 'settimana', quantita: 12 },
  { id: 'anno_1', label: '1 anno', unita: 'mese', quantita: 12 },
];

/** Sotto questa base la percentuale è vera e priva di significato. */
const BASE_MINIMA_PER_PERCENTUALE = 1;

const numero = (valore) => (Number.isFinite(Number(valore)) ? Number(valore) : 0);

/**
 * Statistiche del periodo. Il server le calcola già tutte: qui si rinominano
 * e si aggiunge l'unica regola che è di presentazione, non di calcolo.
 */
export const statistichePunti = (dati) => {
  const variazioneImporto = numero(dati?.variazione_importo);
  const inizio = numero(dati?.inizio);

  return {
    inizio,
    fine: numero(dati?.fine),
    min: numero(dati?.min),
    max: numero(dati?.max),
    variazioneImporto,
    variazionePercentuale: numero(dati?.variazione_percentuale),
    mostraPercentuale: Math.abs(inizio) >= BASE_MINIMA_PER_PERCENTUALE,
  };
};

/**
 * Lettura reale dall'API, usata quando chi chiama `useAndamentoPatrimonio`
 * non inietta un `fetcher` proprio. `api` è importato qui dentro con un
 * `import()` dinamico, non in cima al file: `axios.js` importa
 * `config/api.js` (che legge `import.meta.env`, un global di Vite assente
 * sotto Node) e `utils/session.js` (che importa a sua volta tutti e 12 gli
 * store Pinia). Sotto `node --test` (niente bundler) un import statico
 * farebbe fallire la risoluzione dell'intero modulo ancora prima che un
 * singolo assert giri — verificato rimettendolo temporaneamente: tutti e
 * sei i test del primo giro fallivano, compresi quelli che non chiamano
 * mai `carica()`.
 *
 * `client/src/utils/categorie.js` usa lo stesso `import()` dinamico, ma per
 * un motivo diverso: lì spezza un ciclo reale (`axios` → `session` →
 * `categorie` → `axios`) che romperebbe anche in produzione, non solo sotto
 * i test. Qui non c'è nessun ciclo: il solo vincolo è la compatibilità con
 * `node --test` sotto ESM.
 */
const fetcherPredefinito = async (unita, quantita) => {
  const { default: api } = await import('../utils/axios');
  const { data } = await api.get('/analisi/andamento-patrimonio', {
    params: { unita, quantita },
  });
  return data;
};

/**
 * @param {Object} [opzioni]
 * @param {string} [opzioni.periodoIniziale]  id in PERIODI_ANDAMENTO.
 * @param {Function} [opzioni.fetcher]  lettura dall'API, iniettabile nei
 *   test. Senza un valore proprio, provare `carica`/`cambiaPeriodo` o
 *   `vuotoSe` richiederebbe un doppione del file: con `fetcher` come
 *   parametro con valore predefinito (come `oggi` in `buildPeriodi` e `now`
 *   in `getDateRange`) bastano un mock e nessuna rete. Vedi
 *   `fetcherPredefinito` sopra per l'implementazione vera.
 */
export const useAndamentoPatrimonio = ({ periodoIniziale = 'mesi_3', fetcher } = {}) => {
  const periodo = ref(periodoIniziale);

  const risorsa = creaRisorsa(
    fetcher || fetcherPredefinito,
    {
      // Vuoto significa "non c'è ancora niente da disegnare": nessun punto,
      // oppure una serie tutta a zero e senza movimenti. Un utente con
      // patrimonio zero ma con movimenti registrati NON è vuoto.
      vuotoSe: (dati) => {
        const punti = dati?.punti || [];
        if (!punti.length) return true;
        return punti.every((p) => numero(p.patrimonio) === 0 && numero(p.delta) === 0);
      },
    },
  );

  const carica = () => {
    const scelto = PERIODI_ANDAMENTO.find((p) => p.id === periodo.value) || PERIODI_ANDAMENTO[2];
    return risorsa.carica(scelto.unita, scelto.quantita);
  };

  const cambiaPeriodo = (id) => {
    if (!PERIODI_ANDAMENTO.some((p) => p.id === id)) return undefined;
    periodo.value = id;
    return carica();
  };

  return {
    // Ref di primo livello: vedi il commento in cima al file.
    stato: risorsa.stato,
    lastUpdated: risorsa.lastUpdated,
    loading: risorsa.loading,
    punti: computed(() => risorsa.data.value?.punti || []),
    statistiche: computed(() => statistichePunti(risorsa.data.value)),
    periodo,
    periodi: PERIODI_ANDAMENTO,
    carica,
    cambiaPeriodo,
    riprova: risorsa.riprova,
  };
};
