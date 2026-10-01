import { defineStore } from 'pinia';
import { computed } from 'vue';
import api from '@/utils/axios';
import { creaRisorsa } from '@/utils/risorsa';
import { refreshAfterWrite } from '@/utils/afterWrite';
import {
  FEATURE_BANK_SYNC, PIANO_FREE, PIANO_ETICHETTE, SOURCE_ETICHETTE,
  RICHIESTA_MESSAGGI_UTENTE, puoRichiedere as puoRichiedereStato,
} from '@/utils/entitlements';

/**
 * Il piano e i permessi dell'utente.
 *
 * Una sola lettura (`GET /api/piano`) risponde a tutto: piano commerciale,
 * entitlement, posti beta rimasti e disponibilità dei pagamenti. Tre letture
 * separate potrebbero arrivare da momenti diversi e far mostrare "Premium
 * Beta attivo" accanto a "Bank Sync non disponibile".
 *
 * Passa da `creaRisorsa` (Coding Rule 17): un errore di rete NON azzera i
 * dati già ottenuti, quindi l'interfaccia non può mostrare "sei Free" per un
 * timeout a un utente che ha pagato.
 */
export const usePianoStore = defineStore('piano', () => {
  const risorsa = creaRisorsa(
    async () => {
      const { data } = await api.get('/piano');
      return data;
    },
    { iniziale: null },
  );

  const piano = computed(() => risorsa.data.value?.piano ?? null);

  /**
   * `null` finché la risposta non c'è, non `'free'`.
   *
   * Non è pignoleria: con un ripiego su Free l'interfaccia mostrerebbe a un
   * utente Premium la schermata "Scopri Premium" per il tempo di un
   * caricamento, e dopo un errore di rete non la toglierebbe più. Chi legge
   * questo valore deve gestire il "non lo so ancora".
   */
  const pianoEtichetta = computed(() => (
    piano.value ? (PIANO_ETICHETTE[piano.value] ?? PIANO_ETICHETTE[PIANO_FREE]) : null
  ));

  const gratuito = computed(() => risorsa.data.value?.gratuito ?? null);
  const abbonamento = computed(() => risorsa.data.value?.abbonamento ?? null);
  const pagamentiDisponibili = computed(() => risorsa.data.value?.pagamenti_disponibili === true);

  const bankSync = computed(() => risorsa.data.value?.bank_sync ?? null);
  const bankSyncAttiva = computed(() => bankSync.value?.attiva === true);
  const bankSyncOrigine = computed(() => (
    bankSync.value?.source ? (SOURCE_ETICHETTE[bankSync.value.source] ?? null) : null
  ));

  const beta = computed(() => risorsa.data.value?.beta ?? null);

  /**
   * Va mostrato l'invito ad attivare la beta gratuita?
   *
   * Lo decide il server (`beta.rivendicabile`), non il client: fra questa
   * lettura e il click un altro utente può prendere l'ultimo posto, e il
   * frontend non è la fonte di verità su quanti posti restano. Qui si
   * riflette soltanto la risposta.
   */
  const puoAttivareBeta = computed(() => beta.value?.rivendicabile === true);

  /** Posti esauriti ma feature ancora da ottenere. */
  const betaEsaurita = computed(() => (
    !!beta.value && !bankSyncAttiva.value && beta.value.disponibili === 0
  ));

  /**
   * La beta non è un'opzione per questo utente, qualunque sia la ragione.
   *
   * Non basta guardare `disponibili === 0`: le attivazioni gratuite possono
   * essere chiuse dall'amministratore con `bank_sync_beta_enabled` mentre i
   * posti risultano ancora liberi — ed è lo stato in cui ci si trova finché
   * il provider bancario non è configurato. Guardando solo i posti, l'utente
   * vedeva «Scopri Premium» senza nessun modo di farsi avanti: è lo stesso
   * vicolo cieco che la richiesta di accesso esiste per eliminare.
   *
   * La decisione resta del server (`beta.rivendicabile`), qui si riflette.
   */
  const betaNonAttivabile = computed(() => (
    !!beta.value && !bankSyncAttiva.value && !puoAttivareBeta.value
  ));

  const haFeature = (featureKey) => {
    if (featureKey === FEATURE_BANK_SYNC) return bankSyncAttiva.value;
    const elenco = risorsa.data.value?.entitlements ?? [];
    return elenco.some((e) => e.feature_key === featureKey && e.status === 'active');
  };

  /**
   * La richiesta di accesso a Premium dell'utente.
   *
   * Risorsa separata da quella del piano e non un campo dentro `/api/piano`:
   * il piano lo legge ogni pagina protetta, la richiesta serve a due
   * schermate. Tenerle distinte evita di appesantire la lettura che la SPA
   * fa più spesso, e un errore sulla richiesta non fa sparire il piano.
   */
  const risorsaRichiesta = creaRisorsa(
    async () => {
      const { data } = await api.get('/premium/richieste');
      return data;
    },
    { iniziale: null },
  );

  const richiesta = computed(() => risorsaRichiesta.data.value?.richiesta ?? null);

  const statoRichiesta = computed(() => richiesta.value?.status ?? null);

  /** Cosa legge l'utente sulla propria richiesta. `null` finché non si sa. */
  const messaggioRichiesta = computed(() => (
    statoRichiesta.value ? (RICHIESTA_MESSAGGI_UTENTE[statoRichiesta.value] ?? null) : null
  ));

  /**
   * Va mostrato il pulsante "Richiedi accesso"?
   *
   * Solo a chi non ha già il permesso e non ha una richiesta in corso o già
   * valutata. Come per `puoAttivareBeta`, qui non si decide niente: il
   * server rifiuta comunque una seconda richiesta, e questo valore serve
   * solo a non mostrare un pulsante che non farebbe nulla.
   */
  const puoRichiedere = computed(() => (
    !bankSyncAttiva.value
    && risorsaRichiesta.lastUpdated.value !== null
    && puoRichiedereStato(richiesta.value)
  ));

  const fetchRichiesta = () => risorsaRichiesta.carica();

  /**
   * Chiede l'accesso. Nessun parametro: `user_id` lo ricava il server dal
   * JWT, e la feature ha un default lato server. Mandare qui un corpo
   * sarebbe inutile e suggerirebbe che quei campi contano.
   */
  const richiediAccesso = async () => {
    const { data } = await api.post('/premium/request');
    await refreshAfterWrite(() => risorsaRichiesta.carica());
    return data;
  };

  const annullaRichiesta = async (id) => {
    const { data } = await api.delete(`/premium/richieste/${id}`);
    await refreshAfterWrite(() => risorsaRichiesta.carica());
    return data;
  };

  const fetchPiano = () => risorsa.carica();

  const reset = () => {
    risorsa.reset();
    risorsaRichiesta.reset();
  };

  return {
    risorsa,
    piano,
    pianoEtichetta,
    gratuito,
    abbonamento,
    pagamentiDisponibili,
    bankSync,
    bankSyncAttiva,
    bankSyncOrigine,
    beta,
    puoAttivareBeta,
    betaEsaurita,
    betaNonAttivabile,
    haFeature,
    fetchPiano,
    risorsaRichiesta,
    richiesta,
    statoRichiesta,
    messaggioRichiesta,
    puoRichiedere,
    fetchRichiesta,
    richiediAccesso,
    annullaRichiesta,
    reset,
  };
});
