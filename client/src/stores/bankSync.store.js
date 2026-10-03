import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import api from '@/utils/axios';
import { creaRisorsa } from '@/utils/risorsa';
import { refreshAfterWrite } from '@/utils/afterWrite';
import { messaggioErrore, STATO_ATTIVA } from '@/utils/entitlements';
import { getWithOneRetry } from '@/utils/getWithOneRetry';

/**
 * La connessione bancaria dell'utente.
 *
 * ── Un errore non svuota l'interfaccia ───────────────────────────────────
 * Passa da `creaRisorsa` (Coding Rule 17): se la lettura dello stato
 * fallisce, i dati precedenti restano e `DataState` mostra "Dati non
 * aggiornati — ultimo aggiornamento riuscito ieri alle 22:10". Era il
 * requisito esplicito: se la banca è offline, WALLT continua a funzionare e
 * l'utente non deve credere di aver perso il conto.
 *
 * ── Gli errori di sincronizzazione sono stato, non eccezioni ─────────────
 * `ultimoErrore` conserva il codice dell'ultimo tentativo fallito, così la
 * vista può mostrare il messaggio e l'azione giusti ("Ricollega" è diverso
 * da "Riprova") senza che ogni chiamante debba interpretare un oggetto
 * errore di axios.
 */
export const useBankSyncStore = defineStore('bankSync', () => {
  const risorsaStato = creaRisorsa(
    async () => {
      // È una lettura iniziale necessaria per mostrare la banca collegata.
      // Usa lo stesso margine di /conti: il limite Axios generale di 12s
      // trasformava risposte lente ma valide in un falso errore di connessione.
      const { data } = await getWithOneRetry(
        () => api.get('/bank-sync/status', { timeout: 30000 }),
      );
      return data;
    },
    { iniziale: null },
  );

  /** Le banche collegabili. Caricata solo quando serve: è una chiamata al
   * provider, non un dato che la pagina Conti debba avere sempre pronto. */
  const risorsaIstituti = creaRisorsa(
    async (paese = 'IT') => {
      const { data } = await api.get('/bank-sync/istituti', { params: { paese } });
      return data.istituti;
    },
    { iniziale: [], vuotoSe: (d) => !d || d.length === 0 },
  );

  const sincronizzando = ref(false);
  const collegando = ref(false);
  /** @type {import('vue').Ref<{codice: string, titolo: string, testo: string, azione: string}|null>} */
  const ultimoErrore = ref(null);
  const ultimoEsito = ref(null);

  /** Getter calcolati: dentro lo store `data` è un ref vero, ma attraverso il
   * proxy Pinia i ref annidati sono già scompattati e `.value` da una vista
   * sarebbe `undefined`. Chi scrive le viste legge da qui. */
  const istituti = computed(() => risorsaIstituti.data.value ?? []);
  const connessione = computed(() => risorsaStato.data.value?.connessione ?? null);
  const permesso = computed(() => risorsaStato.data.value?.permesso ?? null);
  const haConnessione = computed(() => !!connessione.value);
  const collegata = computed(() => connessione.value?.stato === STATO_ATTIVA);
  const richiedeRiconnessione = computed(() => connessione.value?.richiede_riconnessione === true);
  const sincronizzabile = computed(() => connessione.value?.sincronizzabile === true);
  const ultimaSincronizzazione = computed(() => connessione.value?.ultima_sincronizzazione ?? null);

  /** Dal codice d'errore salvato sulla connessione: è ciò che permette di
   * mostrare lo stato anche al primo caricamento della pagina, senza che
   * l'utente abbia premuto niente. */
  const erroreConnessione = computed(() => (
    connessione.value?.codice_errore ? messaggioErrore(connessione.value.codice_errore) : null
  ));

  /** Estrae il codice da una risposta d'errore dell'API. Mai lo stack, mai
   * il corpo grezzo: solo il codice, che è un contratto. */
  const codiceDa = (err) => err?.response?.data?.codice
    ?? err?.response?.data?.motivo
    ?? null;

  const fetchStato = () => risorsaStato.carica();
  const fetchIstituti = (paese = 'IT') => risorsaIstituti.carica(paese);

  /** Attiva la beta gratuita. Solo dopo un click esplicito dell'utente. */
  const attivaBeta = async () => {
    const { data } = await api.post('/bank-sync/claim-beta');
    // Il piano cambia: va riletto, altrimenti la pagina resterebbe convinta
    // che l'utente sia ancora Free.
    const { usePianoStore } = await import('./piano.store');
    await refreshAfterWrite(() => usePianoStore().fetchPiano(), () => fetchStato());
    return data;
  };

  /**
   * Avvia il collegamento e restituisce l'URL della banca: la navigazione la
   * fa la vista, non lo store, perché è un effetto sul browser.
   */
  const avviaCollegamento = async ({ institutionId, sostituisci = false }) => {
    collegando.value = true;
    ultimoErrore.value = null;
    try {
      const { data } = await api.post('/bank-sync/connect', {
        institution_id: institutionId,
        ...(sostituisci ? { sostituisci: true } : {}),
      });
      return data;
    } catch (err) {
      const codice = codiceDa(err);
      ultimoErrore.value = codice ? { codice, ...messaggioErrore(codice) } : null;
      throw err;
    } finally {
      collegando.value = false;
    }
  };

  /** Rinnova l'autorizzazione della banca già collegata. L'istituto lo
   * decide il server dalla connessione esistente. */
  const ricollega = async () => {
    collegando.value = true;
    ultimoErrore.value = null;
    try {
      const { data } = await api.post('/bank-sync/reconnect');
      return data;
    } finally {
      collegando.value = false;
    }
  };

  /** Completa il collegamento al ritorno dalla banca. */
  const completaCollegamento = async (state, code = null) => {
    const { data } = await api.post('/bank-sync/callback', {
      state,
      // Inviato solo se il provider lo ha consegnato: il server lo tratta
      // come facoltativo, e l'adapter che ne ha bisogno fallisce in modo
      // esplicito se manca.
      ...(code ? { code } : {}),
    });
    const { usePianoStore } = await import('./piano.store');
    const { useContiStore } = await import('./conti.store');
    await refreshAfterWrite(
      () => fetchStato(),
      () => usePianoStore().fetchPiano(),
      () => useContiStore().fetchConti(),
      () => useContiStore().fetchPatrimonio(),
    );
    return data;
  };

  /**
   * Sincronizzazione manuale.
   *
   * Non lancia: l'esito è stato, come in `creaRisorsa`. Restituisce
   * `{ ok, esito }` oppure `{ ok: false, errore }`, perché la vista deve
   * poter mostrare "la banca non risponde, i tuoi dati precedenti sono
   * ancora disponibili" senza un try/catch in ogni punto.
   */
  const sincronizza = async ({ dataDa = null, dataA = null } = {}) => {
    sincronizzando.value = true;
    ultimoErrore.value = null;
    try {
      const { data } = await api.post('/bank-sync/sync', dataDa && dataA
        ? { data_da: dataDa, data_a: dataA }
        : {});
      ultimoEsito.value = data;
      // I movimenti importati cambiano saldi, patrimonio e liste: vanno
      // ricaricati, e un fallimento di queste letture non deve far sembrare
      // fallita una sincronizzazione riuscita.
      const { useContiStore } = await import('./conti.store');
      const { useMovimentiStore } = await import('./movimenti.store');
      await refreshAfterWrite(
        () => fetchStato(),
        () => useContiStore().fetchConti(),
        () => useContiStore().fetchPatrimonio(),
        () => useMovimentiStore().fetchMovimenti?.(),
      );
      return { ok: true, esito: data };
    } catch (err) {
      const codice = codiceDa(err);
      const errore = { codice, ...messaggioErrore(codice) };
      ultimoErrore.value = errore;
      // Lo stato della connessione porta ora il codice d'errore: ricaricarlo
      // fa comparire l'avviso nella card anche senza interazione.
      await refreshAfterWrite(() => fetchStato());
      return { ok: false, errore };
    } finally {
      sincronizzando.value = false;
    }
  };

  /** Scollega. Non cancella movimenti: lo dichiara anche la risposta. */
  const scollega = async () => {
    const { data } = await api.post('/bank-sync/disconnect');
    const { useContiStore } = await import('./conti.store');
    await refreshAfterWrite(
      () => fetchStato(),
      () => useContiStore().fetchConti(),
    );
    return data;
  };

  /**
   * Cancella i movimenti importati dopo la conferma esplicita dell'utente.
   */
  const eliminaDatiImportati = async (confirm) => {
    const { data } = await api.delete('/bank-sync/dati-importati', {
      data: { confirm },
    });
    const { useContiStore } = await import('./conti.store');
    const { useMovimentiStore } = await import('./movimenti.store');
    await refreshAfterWrite(
      () => fetchStato(),
      () => useContiStore().fetchConti(),
      () => useContiStore().fetchPatrimonio(),
      () => useMovimentiStore().fetchMovimenti?.(),
    );
    return data;
  };

  const reset = () => {
    risorsaStato.reset();
    risorsaIstituti.reset();
    sincronizzando.value = false;
    collegando.value = false;
    ultimoErrore.value = null;
    ultimoEsito.value = null;
  };

  return {
    risorsaStato,
    risorsaIstituti,
    istituti,
    connessione,
    permesso,
    haConnessione,
    collegata,
    richiedeRiconnessione,
    sincronizzabile,
    ultimaSincronizzazione,
    erroreConnessione,
    sincronizzando,
    collegando,
    ultimoErrore,
    ultimoEsito,
    fetchStato,
    fetchIstituti,
    attivaBeta,
    avviaCollegamento,
    ricollega,
    completaCollegamento,
    sincronizza,
    scollega,
    eliminaDatiImportati,
    reset,
  };
});
