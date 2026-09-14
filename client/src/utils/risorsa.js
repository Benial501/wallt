import { ref, computed } from 'vue';

/**
 * Stato di una lettura dall'API.
 *
 * Nasce da un difetto concreto: più store azzeravano i dati nel gestore
 * dell'errore (`catch { lista.value = [] }`), e la vista mostrava lo stato
 * vuoto — "Nessun budget per settembre" — al posto di un errore di rete.
 * L'utente leggeva una perdita di dati dove c'era solo una richiesta fallita.
 *
 * Qui la regola non è una convenzione da ricordare: è l'unico modo in cui
 * `carica` è scritta. In caso di fallimento viene scritto SOLO `error`.
 *
 * I dati vivono in memoria e basta: niente localStorage, mai. Un saldo non
 * deve finire su disco (stessa scelta già fatta per il payload delle push).
 *
 * @param {Function} fetcher  funzione asincrona che restituisce i dati già
 *                            estratti dalla risposta.
 * @param {Object}   opzioni
 * @param {*}        opzioni.iniziale  valore di partenza di `data`.
 * @param {Function} opzioni.vuotoSe   predicato: cosa significa "vuoto" qui.
 */
export const creaRisorsa = (fetcher, { iniziale = null, vuotoSe } = {}) => {
  const data = ref(iniziale);
  const loading = ref(false);
  const error = ref(null);
  const lastUpdated = ref(null);

  // Numero di sequenza: la dashboard lancia otto caricamenti in parallelo e
  // `onSaved` li rilancia tutti insieme. Senza guardia una risposta lenta
  // partita prima sovrascrive una veloce partita dopo, e i saldi tornano
  // indietro nel tempo.
  let sequenza = 0;
  let ultimiArgs = [];

  const vuotoPredefinito = (valore) => {
    if (Array.isArray(valore)) return valore.length === 0;
    return valore === null || valore === undefined;
  };
  const isVuoto = typeof vuotoSe === 'function' ? vuotoSe : vuotoPredefinito;

  /**
   * L'ordine è vincolante. `caricamento` precede `errore` così un "Riprova"
   * dopo un fallimento senza dati mostra di nuovo lo scheletro, invece di
   * lasciare il pannello d'errore fino alla risposta. Con dati precedenti,
   * invece, `errore-con-dati` sopravvive al tentativo in corso: il dato a
   * schermo è ancora vecchio finché non arriva quello nuovo, e dirlo a
   * metà strada e poi ridirlo sarebbe un lampeggio.
   */
  const stato = computed(() => {
    if (loading.value && lastUpdated.value === null) return 'caricamento';
    if (error.value && lastUpdated.value === null) return 'errore';
    if (error.value) return 'errore-con-dati';
    // Mai richiesta e mai riuscita: non è vuota, semplicemente non lo
    // sappiamo ancora. Dire "non hai nulla" prima di aver chiesto è la
    // stessa bugia che questo file esiste per impedire.
    if (lastUpdated.value === null) return 'caricamento';
    if (isVuoto(data.value)) return 'vuoto';
    return 'pronto';
  });

  /**
   * Non lancia mai: l'errore è uno stato, non un'eccezione. Chi chiama non
   * deve incatenare `.catch()` per evitare una rejection non gestita, e chi
   * ha bisogno di sapere com'è andata guarda `error` oppure il valore di
   * ritorno (i dati, oppure `undefined`).
   */
  const carica = async (...args) => {
    ultimiArgs = args;
    const mia = ++sequenza;
    loading.value = true;
    try {
      const risultato = await fetcher(...args);
      if (mia !== sequenza) return undefined;
      data.value = risultato;
      lastUpdated.value = Date.now();
      // Solo un successo cancella l'errore precedente.
      error.value = null;
      return risultato;
    } catch (e) {
      if (mia !== sequenza) return undefined;
      // INVARIANTE: `data` e `lastUpdated` non vengono toccati.
      error.value = e;
      return undefined;
    } finally {
      if (mia === sequenza) loading.value = false;
    }
  };

  const riprova = () => carica(...ultimiArgs);

  /**
   * L'incremento di `sequenza` non è un dettaglio: invalida le richieste in
   * volo, così una risposta che arriva dopo il logout non può ripopolare la
   * risorsa con i dati dell'utente precedente.
   */
  const reset = () => {
    sequenza += 1;
    data.value = iniziale;
    loading.value = false;
    error.value = null;
    lastUpdated.value = null;
    ultimiArgs = [];
  };

  return { data, loading, error, lastUpdated, stato, carica, riprova, reset };
};
