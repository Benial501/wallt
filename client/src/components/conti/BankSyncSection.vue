<script setup>
import {
  computed, onMounted, ref, watch,
} from 'vue';
import dayjs from 'dayjs';
import 'dayjs/locale/it';
import WCard from '@/components/common/WCard.vue';
import WButton from '@/components/common/WButton.vue';
import AppDialog from '@/components/common/AppDialog.vue';
import DataState from '@/components/common/DataState.vue';
import PremiumBadge from '@/components/premium/PremiumBadge.vue';
import PremiumModal from '@/components/premium/PremiumModal.vue';
import {
  Landmark, RefreshCw, AlertTriangle, CheckCircle2, ChevronRight, Search,
} from '@/utils/appIcons';
import { usePianoStore } from '@/stores/piano.store';
import { useBankSyncStore } from '@/stores/bankSync.store';
import { useToastStore } from '@/stores/toast.store';
import { useValuta } from '@/composables/useValuta';
import {
  STATO_SOSPESA_ENTITLEMENT, DESTINAZIONE_NUOVO, messaggioErrore,
} from '@/utils/entitlements';

dayjs.locale('it');

/**
 * La sezione Bank Sync dentro "I miei conti".
 *
 * ── Perché è qui e non in una pagina a parte ─────────────────────────────
 * Il brief chiede che Premium si presenti dove l'utente INCONTRA la funzione.
 * Collegare una banca è gestire i propri conti: non ha senso una seconda
 * gestione account da qualche altra parte, e non ha senso un banner su ogni
 * schermata.
 *
 * ── Tre stati, tre azioni diverse ────────────────────────────────────────
 *  • nessun conto collegato → invito (beta gratuita o Premium futuro);
 *  • conto collegato → saldo, ultimo aggiornamento, Sincronizza, Gestisci;
 *  • conto collegato con problema → il messaggio e l'azione corretti, da
 *    `utils/entitlements.js`: "Ricollega" quando il consenso è scaduto,
 *    "Riprova" quando la banca non risponde. Mai un errore generico.
 *
 * ── Se la banca è offline, l'interfaccia non si svuota ───────────────────
 * `DataState` mostra l'ultimo stato riuscito con un avviso. Il saldo a
 * schermo resta quello noto, con l'orario a cui si riferisce.
 */
const pianoStore = usePianoStore();
const bankSyncStore = useBankSyncStore();
const toastStore = useToastStore();
const { formatValuta } = useValuta();

const showPremium = ref(false);
const showGestisci = ref(false);
const showScollega = ref(false);
const showSostituisci = ref(false);
const showScegliBanca = ref(false);
const showSincronizza = ref(false);
const ricercaBanca = ref('');
const sostituendo = ref(false);
const scollegando = ref(false);
const dataDaSync = ref('');
const dataASync = ref('');
const oggiSync = ref('');
const GIORNI_SYNC_MASSIMO = 90;

/** La scelta in corso nella scheda di riconciliazione: quale conto della
 * banca, e a quale conto WALLT associarlo (`DESTINAZIONE_NUOVO` per crearne
 * uno). Finché non sono entrambe decise il pulsante resta disabilitato. */
const contoBancaScelto = ref(null);
const destinazioneScelta = ref(null);
const caricandoRiconciliazione = ref(false);
const erroreRiconciliazione = ref(null);
const confermando = ref(false);

/** L'avviso dei duplicati. `showSoglia` non è una copia dello stato dello
 * store: è il fatto che il modale sia aperto, che l'utente può chiudere senza
 * che la domanda del server smetta di essere stata posta. */
const showSoglia = ref(false);
const importDaSoglia = ref('');

onMounted(() => {
  bankSyncStore.fetchStato();
  if (!pianoStore.risorsa.lastUpdated) pianoStore.fetchPiano();
});

/**
 * Le banche che corrispondono alla ricerca.
 *
 * Il taglio a 40 non è pigrizia: l'elenco italiano supera i trecento
 * istituti, e disegnarli tutti rende la lista inutilizzabile sul telefono.
 * Chi non trova la propria banca scrive due lettere in più.
 */
const MAX_BANCHE_MOSTRATE = 40;

const bancheFiltrate = computed(() => {
  const q = ricercaBanca.value.trim().toLowerCase();
  const tutte = bankSyncStore.istituti;
  const trovate = q
    ? tutte.filter((i) => i.nome.toLowerCase().includes(q))
    : tutte;
  return { elenco: trovate.slice(0, MAX_BANCHE_MOSTRATE), totale: trovate.length };
});

const connessione = computed(() => bankSyncStore.connessione);
const haPermesso = computed(() => pianoStore.bankSyncAttiva);

const sospesa = computed(() => connessione.value?.stato === STATO_SOSPESA_ENTITLEMENT);

/* ── La riconciliazione ───────────────────────────────────────────────────
 *
 * La banca è autorizzata ma nessuno ha ancora detto a quale conto WALLT
 * appartengono i suoi movimenti. È la decisione irreversibile del flusso:
 * agganciare il conto che l'utente già usa conserva lo storico inserito a
 * mano, crearne uno nuovo lascerebbe lo stesso denaro contato due volte.
 *
 * I conti della banca si mostrano TUTTI. Prendere il primo è il difetto che
 * questo lavoro corregge, e sceglierne uno al posto dell'utente
 * nell'interfaccia lo reintrodurrebbe da questo lato.
 */
const contiBanca = computed(() => bankSyncStore.riconciliazione?.conti_banca ?? []);
const contiAgganciabili = computed(() => bankSyncStore.riconciliazione?.conti_wallt ?? []);

const riconciliazionePronta = computed(() => (
  !!contoBancaScelto.value && destinazioneScelta.value !== null
));

/** Il saldo di un conto bancario può non esserci: con Enable Banking si legge
 * con una chiamata per conto che questa rotta non fa. Un «saldo: 0» inventato
 * sarebbe peggio del silenzio, perché è un numero che l'utente crederebbe. */
const haSaldo = (conto) => conto.saldo !== null && conto.saldo !== undefined;

const caricaRiconciliazione = async () => {
  caricandoRiconciliazione.value = true;
  erroreRiconciliazione.value = null;
  try {
    const dati = await bankSyncStore.caricaRiconciliazione();
    // Con un solo conto la scelta è già fatta, ma resta visibile: è diverso
    // dal non mostrarla.
    contoBancaScelto.value = dati.conti_banca?.length === 1
      ? dati.conti_banca[0].provider_account_id
      : null;
    destinazioneScelta.value = null;
  } catch (err) {
    erroreRiconciliazione.value = err?.response?.data?.message
      || 'Non è stato possibile leggere i conti della banca. Riprova fra poco.';
  } finally {
    caricandoRiconciliazione.value = false;
  }
};

// I dati per scegliere non si tengono in cache (lo dice lo store): si
// rileggono quando la connessione entra in questo stato, perché un elenco
// vecchio porterebbe a scegliere un conto bancario che non c'è più.
watch(() => bankSyncStore.daRiconciliare, (attesa) => {
  if (attesa && !bankSyncStore.riconciliazione) caricaRiconciliazione();
}, { immediate: true });

const confermaRiconciliazione = async () => {
  if (!riconciliazionePronta.value) return;
  confermando.value = true;
  try {
    const esito = await bankSyncStore.confermaRiconciliazione({
      providerAccountId: contoBancaScelto.value,
      destinazione: destinazioneScelta.value,
    });
    contoBancaScelto.value = null;
    destinazioneScelta.value = null;
    toastStore.success(
      esito.creato
        ? 'Conto creato e collegato alla banca.'
        : 'Collegamento associato al conto: i movimenti che hai già restano dove sono.',
    );
  } catch (err) {
    toastStore.error(
      err?.response?.data?.message
      || 'Non è stato possibile associare il collegamento. Riprova fra poco.',
    );
  } finally {
    confermando.value = false;
  }
};

/** L'orario assoluto dell'ultimo aggiornamento riuscito. Non relativo:
 * "3 minuti fa" invecchierebbe in silenzio senza un timer (stessa scelta di
 * DataState). */
const ultimoAggiornamento = computed(() => {
  const quando = bankSyncStore.ultimaSincronizzazione;
  if (!quando) return null;
  const d = dayjs(quando);
  return d.isSame(dayjs(), 'day')
    ? `Oggi ${d.format('HH:mm')}`
    : `${d.format('D MMMM')} alle ${d.format('HH:mm')}`;
});

const dataMinimaSync = computed(() => (
  oggiSync.value ? dayjs(oggiSync.value).subtract(GIORNI_SYNC_MASSIMO - 1, 'day').format('YYYY-MM-DD') : ''
));
const intervalloSyncValido = computed(() => {
  if (!dataDaSync.value || !dataASync.value || !oggiSync.value) return false;
  const giorni = dayjs(dataASync.value).diff(dayjs(dataDaSync.value), 'day');
  return dataDaSync.value >= dataMinimaSync.value
    && dataDaSync.value <= dataASync.value
    && dataASync.value <= oggiSync.value
    && giorni < GIORNI_SYNC_MASSIMO;
});

const consensoInScadenza = computed(() => {
  const scade = connessione.value?.consenso_scade_il;
  if (!scade) return null;
  const giorni = dayjs(scade).diff(dayjs(), 'day');
  // Avvisare 14 giorni prima: abbastanza perché l'utente ci pensi senza che
  // l'avviso diventi arredamento permanente.
  return giorni >= 0 && giorni <= 14 ? giorni : null;
});

const apriSincronizzazione = () => {
  oggiSync.value = dayjs().format('YYYY-MM-DD');
  dataDaSync.value = dayjs(oggiSync.value).subtract(29, 'day').format('YYYY-MM-DD');
  dataASync.value = oggiSync.value;
  showGestisci.value = false;
  showSincronizza.value = true;
};

/** L'esito di una sincronizzazione, qualunque sia la strada che l'ha avviata.
 *
 * La soglia NON passa da qui e non passa dalla mappa dei messaggi d'errore:
 * `SYNC_ERROR_CODES` non la contiene di proposito, perché non è un guasto ma
 * una domanda, e `messaggioErrore` le darebbe il ripiego sbagliato («riprova
 * fra poco»). Chi la riceve è il modale, aperto dal watch sullo stato. */
const mostraEsito = (esito) => {
  if (esito.soglia) return;
  if (esito.ok) {
    showSincronizza.value = false;
    showSoglia.value = false;
    const { importati = 0, duplicati_evitati: duplicati = 0 } = esito.esito;
    if (importati > 0) {
      toastStore.success(
        importati === 1 ? '1 movimento importato' : `${importati} movimenti importati`,
      );
    } else {
      toastStore.success(
        duplicati > 0 ? 'Sei già aggiornato' : 'Nessun movimento nuovo dalla banca',
      );
    }
  } else {
    // Il titolo del codice d'errore, non un messaggio generico: è ciò che
    // distingue "ricollega" da "riprova".
    toastStore.error(esito.errore.titolo);
  }
};

const sincronizza = async () => {
  mostraEsito(await bankSyncStore.sincronizza({
    dataDa: dataDaSync.value,
    dataA: dataASync.value,
  }));
};

/* ── L'avviso dei duplicati ───────────────────────────────────────────────
 *
 * Il server si rifiuta di importare sopra uno storico già inserito a mano
 * senza che l'utente abbia detto da quando partire: WALLT non può riconoscere
 * un movimento scritto a mano come lo stesso di uno della banca.
 *
 * `data_suggerita` è il giorno dopo l'ultimo movimento dell'utente, e arriva
 * all'utente come il server la calcola. Non viene più abbassata a oggi: per
 * chi è in pari col proprio storico la proposta è esattamente DOMANI, il
 * server la accetta (`validateBankSyncSoglia`, commit 8633011) e significa
 * «non importare nulla adesso, tieni questo pavimento per dopo». Riportarla
 * a oggi scaricherebbe le operazioni di oggi, cioè proprio il doppione che
 * questo modale esiste per evitare.
 *
 * Può essere nulla (tutti i movimenti sono futuri): in quel caso si parte dal
 * limite della finestra, cioè da tutto lo storico disponibile.
 *
 * Il giorno civile è quello di Roma, non quello del browser: è il fuso in cui
 * il server valida (Regola 16), e un browser avanti di qualche ora
 * proporrebbe un `max` che il server rifiuta. Stessa primitiva già usata in
 * `PianoSmartExpenseFunding.vue`, nessuna dipendenza nuova.
 */
const FUSO_APP = 'Europe/Rome';

const oggiRoma = () => {
  const parti = new Intl.DateTimeFormat('en-CA', {
    timeZone: FUSO_APP, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const v = Object.fromEntries(parti.map((parte) => [parte.type, parte.value]));
  return `${v.year}-${v.month}-${v.day}`;
};

/* Aritmetica fra giorni civili già noti: nessuna conversione di fuso residua. */
const dataMinimaSoglia = computed(() => dayjs(oggiRoma()).subtract(GIORNI_SYNC_MASSIMO - 1, 'day').format('YYYY-MM-DD'));
/** Il limite del campo è DOMANI, non oggi: è il massimo che la proposta del
 * server può produrre, e il massimo che la sua validazione accetta. */
const dataMassimaSoglia = computed(() => dayjs(oggiRoma()).add(1, 'day').format('YYYY-MM-DD'));
const dataMinimaSogliaTesto = computed(() => dayjs(dataMinimaSoglia.value).format('D MMMM YYYY'));

/** Resta il solo pavimento, e non è un ripiego: una soglia più vecchia della
 * finestra equivale a non averla (il server applica `max(finestra, import_da)`
 * su 90 giorni), ma come valore del campo sarebbe sotto il `min` e il browser
 * rifiuterebbe l'invio. Il tetto non si tocca più. */
const nonPrimaDellaFinestra = (data) => (
  data < dataMinimaSoglia.value ? dataMinimaSoglia.value : data
);

watch(() => bankSyncStore.sogliaRichiesta, (soglia) => {
  if (!soglia) return;
  showSincronizza.value = false;
  importDaSoglia.value = soglia.data_suggerita
    ? nonPrimaDellaFinestra(soglia.data_suggerita)
    : dataMinimaSoglia.value;
  showSoglia.value = true;
});

const confermaSoglia = async () => {
  if (!importDaSoglia.value) return;
  mostraEsito(await bankSyncStore.sincronizza({ importDa: importDaSoglia.value }));
};

/** «Importa tutto lo storico disponibile» non è una seconda strada: scrive
 * nello stesso campo la data più vecchia che la banca può dare. */
const vuoiTuttoLoStorico = () => { importDaSoglia.value = dataMinimaSoglia.value; };

/**
 * Apre la scelta della banca.
 *
 * Prima questa funzione prendeva `istituti[0]` — la prima dell'elenco — e ci
 * mandava l'utente dritto. Con un provider che restituisce centinaia di
 * istituti italiani significa spedire chiunque sulla prima banca in ordine
 * alfabetico invece che sulla sua. La banca la sceglie l'utente.
 *
 * `fetchIstituti` passa da `creaRisorsa`, che per contratto NON lancia:
 * l'errore diventa uno stato. Per questo il `catch` qui sotto non lo
 * vedrebbe mai, e l'elenco vuoto va interpretato leggendo `error` — da cui
 * si ricava il codice e, con esso, la frase giusta. Dire «Nessuna banca
 * disponibile, riprova più tardi» quando il provider non è configurato è
 * falso due volte: le banche ci sono, e riprovare non serve a niente.
 */
const apriSceltaBanca = async ({ sostituisci = false } = {}) => {
  sostituendo.value = sostituisci;
  await bankSyncStore.fetchIstituti();

  const errore = bankSyncStore.risorsaIstituti.error;
  if (errore) {
    const codice = errore?.response?.data?.codice ?? errore?.response?.data?.motivo ?? null;
    const { titolo, testo } = messaggioErrore(codice);
    toastStore.error(codice ? `${titolo}. ${testo}` : titolo);
    return;
  }

  if (bankSyncStore.istituti.length === 0) {
    toastStore.error('La banca che cerchi non è ancora collegabile da WALLT.');
    return;
  }

  ricercaBanca.value = '';
  showScegliBanca.value = true;
};

/** Il collegamento vero, dopo che l'utente ha scelto la banca. */
const avviaCollegamento = async (istituto) => {
  try {
    const esito = await bankSyncStore.avviaCollegamento({
      institutionId: istituto.id,
      sostituisci: sostituendo.value,
    });
    showScegliBanca.value = false;
    // La navigazione verso la banca è un effetto sul browser e sta qui, non
    // nello store.
    window.location.assign(esito.url_autorizzazione);
  } catch (err) {
    toastStore.error(
      err?.response?.data?.message
      || 'Non è stato possibile avviare il collegamento. Riprova fra poco.',
    );
  }
};

const ricollega = async () => {
  try {
    const esito = await bankSyncStore.ricollega();
    window.location.assign(esito.url_autorizzazione);
  } catch (err) {
    toastStore.error(
      err?.response?.data?.message || 'Non è stato possibile ricollegare il conto.',
    );
  }
};

const scollega = async () => {
  scollegando.value = true;
  try {
    await bankSyncStore.scollega();
    toastStore.success('Conto scollegato. I movimenti già importati restano disponibili.');
    showScollega.value = false;
    showGestisci.value = false;
  } catch (err) {
    toastStore.error(err?.response?.data?.message || 'Non è stato possibile scollegare il conto.');
  } finally {
    scollegando.value = false;
  }
};

const confermaSostituzione = async () => {
  showSostituisci.value = false;
  showGestisci.value = false;
  await apriSceltaBanca({ sostituisci: true });
};
</script>

<template>
  <section class="bank-sync">
    <div class="bank-sync__divisore" aria-hidden="true" />

    <DataState
      :stato="bankSyncStore.risorsaStato.stato"
      :last-updated="bankSyncStore.risorsaStato.lastUpdated"
      messaggio-errore="Non è stato possibile leggere lo stato del collegamento bancario."
      skeleton-type="card"
      :skeleton-lines="2"
      @riprova="bankSyncStore.risorsaStato.riprova()"
    >
      <!-- ── Nessun conto collegato ─────────────────────────────────── -->
      <WCard v-if="!connessione" class="bank-sync__card">
        <div class="bank-sync__intestazione">
          <span class="bank-sync__icona">
            <Landmark :size="22" :stroke-width="1.65" aria-hidden="true" />
          </span>
          <div class="bank-sync__titolo-riga">
            <h2 class="bank-sync__titolo">Collega la tua banca</h2>
            <PremiumBadge v-if="!haPermesso" />
          </div>
        </div>

        <p class="bank-sync__testo">
          Sincronizza automaticamente saldo e movimenti, senza inserirli a mano.
          WALLT non chiede mai le credenziali della tua banca.
        </p>

        <WButton
          v-if="haPermesso"
          variant="primary"
          size="md"
          :loading="bankSyncStore.collegando"
          @click="apriSceltaBanca()"
        >
          Collega conto bancario
        </WButton>
        <WButton
          v-else
          variant="secondary"
          size="md"
          @click="showPremium = true"
        >
          Scopri come attivarlo
          <ChevronRight :size="16" :stroke-width="1.75" aria-hidden="true" />
        </WButton>
      </WCard>

      <!-- ── Banca autorizzata, conto ancora da scegliere ───────────────
           Sta PRIMA della scheda del conto collegato perché finché la scelta
           manca non esiste nessun conto collegato da mostrare, e il saldo
           sarebbe uno zero inventato. -->
      <WCard v-else-if="bankSyncStore.daRiconciliare" class="bank-sync__card">
        <div class="bank-sync__intestazione">
          <span class="bank-sync__icona">
            <Landmark :size="22" :stroke-width="1.65" aria-hidden="true" />
          </span>
          <div class="bank-sync__titolo-riga">
            <h2 class="bank-sync__titolo">
              {{ connessione.istituto?.nome || 'Banca collegata' }}
            </h2>
            <span class="bank-sync__stato bank-sync__stato--problema">
              <AlertTriangle :size="14" :stroke-width="1.9" aria-hidden="true" />
              Da completare
            </span>
          </div>
        </div>

        <p class="bank-sync__testo">
          Associa questo collegamento a un conto che usi già: i movimenti che
          hai inserito a mano restano, e da ora in poi li scrive la banca.
          Oppure creane uno nuovo.
        </p>

        <p v-if="caricandoRiconciliazione" class="bank-sync__attesa">
          Stiamo leggendo i conti dalla tua banca…
        </p>

        <template v-else-if="erroreRiconciliazione || !contiBanca.length">
          <div class="bank-sync__avviso" role="status">
            <AlertTriangle :size="16" :stroke-width="1.75" aria-hidden="true" />
            <div>
              <p class="bank-sync__avviso-titolo">Conti della banca non disponibili</p>
              <p class="bank-sync__avviso-testo">
                {{ erroreRiconciliazione
                  || 'La banca non ha restituito nessun conto per questa autorizzazione.' }}
              </p>
            </div>
          </div>
          <div class="bank-sync__azioni">
            <WButton variant="secondary" size="md" @click="caricaRiconciliazione">
              Riprova
            </WButton>
          </div>
        </template>

        <template v-else>
          <!-- TUTTI i conti che la banca espone, non il primo. -->
          <fieldset class="bank-sync__gruppo">
            <legend>
              {{ contiBanca.length === 1
                ? 'Il conto che la banca ha autorizzato'
                : `La banca ha autorizzato ${contiBanca.length} conti: scegli quale sincronizzare` }}
            </legend>
            <label
              v-for="cb in contiBanca"
              :key="cb.provider_account_id"
              class="bank-sync__opzione"
              :class="{ 'bank-sync__opzione--scelta': contoBancaScelto === cb.provider_account_id }"
            >
              <input
                v-model="contoBancaScelto"
                type="radio"
                name="conto-banca"
                :value="cb.provider_account_id"
              />
              <span class="bank-sync__opzione-testo">
                <strong>{{ cb.nome || 'Conto bancario' }}</strong>
                <small>
                  {{ cb.iban_mascherato || 'IBAN non comunicato' }}
                  <!-- Il saldo si mostra solo se la banca l'ha dato: uno zero
                       al posto di un dato mancante sarebbe una bugia. -->
                  <template v-if="haSaldo(cb)"> · {{ formatValuta(cb.saldo) }}</template>
                </small>
              </span>
            </label>
          </fieldset>

          <fieldset class="bank-sync__gruppo">
            <legend>A quale conto WALLT appartiene</legend>
            <label
              v-for="cw in contiAgganciabili"
              :key="cw.id"
              class="bank-sync__opzione"
              :class="{ 'bank-sync__opzione--scelta': destinazioneScelta === cw.id }"
            >
              <input
                v-model="destinazioneScelta"
                type="radio"
                name="destinazione-conto"
                :value="cw.id"
              />
              <span class="bank-sync__opzione-testo">
                <strong>{{ cw.nome }}</strong>
                <small>{{ formatValuta(cw.saldo) }} · i movimenti già presenti restano</small>
              </span>
            </label>

            <label
              class="bank-sync__opzione"
              :class="{ 'bank-sync__opzione--scelta': destinazioneScelta === DESTINAZIONE_NUOVO }"
            >
              <input
                v-model="destinazioneScelta"
                type="radio"
                name="destinazione-conto"
                :value="DESTINAZIONE_NUOVO"
              />
              <span class="bank-sync__opzione-testo">
                <strong>Crea un conto nuovo</strong>
                <small>Scegli questa se non hai ancora un conto per questa banca</small>
              </span>
            </label>
          </fieldset>

          <div class="bank-sync__azioni">
            <WButton
              variant="primary"
              size="md"
              :loading="confermando"
              :disabled="!riconciliazionePronta"
              @click="confermaRiconciliazione"
            >
              Collega a questo conto
            </WButton>
          </div>
        </template>
      </WCard>

      <!-- ── Conto collegato ─────────────────────────────────────────── -->
      <WCard v-else class="bank-sync__card">
        <div class="bank-sync__intestazione">
          <span class="bank-sync__icona">
            <Landmark :size="22" :stroke-width="1.65" aria-hidden="true" />
          </span>
          <div class="bank-sync__titolo-riga">
            <h2 class="bank-sync__titolo">
              {{ connessione.istituto.nome || connessione.conto_nome || 'Conto bancario' }}
            </h2>
            <span
              class="bank-sync__stato"
              :class="{
                'bank-sync__stato--ok': connessione.stato === 'attiva',
                'bank-sync__stato--problema': connessione.richiede_riconnessione || connessione.stato === 'errore',
              }"
            >
              <component
                :is="connessione.stato === 'attiva' ? CheckCircle2 : AlertTriangle"
                :size="14"
                :stroke-width="1.9"
                aria-hidden="true"
              />
              {{ connessione.stato === 'attiva' ? 'Connesso' : 'Da sistemare' }}
            </span>
          </div>
        </div>

        <!-- Un problema di sincronizzazione NON svuota la card: il saldo noto
             resta, con l'orario a cui si riferisce. -->
        <div
          v-if="bankSyncStore.erroreConnessione"
          class="bank-sync__avviso"
          role="status"
        >
          <AlertTriangle :size="16" :stroke-width="1.75" aria-hidden="true" />
          <div>
            <p class="bank-sync__avviso-titolo">{{ bankSyncStore.erroreConnessione.titolo }}</p>
            <p class="bank-sync__avviso-testo">{{ bankSyncStore.erroreConnessione.testo }}</p>
            <p v-if="ultimoAggiornamento" class="bank-sync__avviso-orario">
              Ultimo aggiornamento riuscito: {{ ultimoAggiornamento }}
            </p>
          </div>
        </div>

        <div v-else-if="sospesa" class="bank-sync__avviso" role="status">
          <AlertTriangle :size="16" :stroke-width="1.75" aria-hidden="true" />
          <div>
            <p class="bank-sync__avviso-titolo">Sincronizzazione sospesa</p>
            <p class="bank-sync__avviso-testo">
              Il tuo accesso alla sincronizzazione bancaria non è attivo.
              I movimenti già importati restano disponibili.
            </p>
          </div>
        </div>

        <p
          v-else-if="consensoInScadenza !== null"
          class="bank-sync__avviso bank-sync__avviso--leggero"
          role="status"
        >
          <AlertTriangle :size="16" :stroke-width="1.75" aria-hidden="true" />
          <span>
            L'autorizzazione della banca va rinnovata
            {{ consensoInScadenza === 0 ? 'oggi' : `fra ${consensoInScadenza} giorni` }}.
          </span>
        </p>

        <dl class="bank-sync__dati">
          <div>
            <dt>Saldo</dt>
            <dd class="bank-sync__saldo">{{ formatValuta(connessione.saldo ?? 0) }}</dd>
          </div>
          <div>
            <dt>Ultimo aggiornamento</dt>
            <dd>{{ ultimoAggiornamento || 'Mai' }}</dd>
          </div>
          <div v-if="connessione.iban_mascherato">
            <dt>Conto</dt>
            <dd>{{ connessione.iban_mascherato }}</dd>
          </div>
        </dl>

        <div class="bank-sync__azioni">
          <WButton
            v-if="connessione.richiede_riconnessione"
            variant="primary"
            size="md"
            :loading="bankSyncStore.collegando"
            @click="ricollega"
          >
            Ricollega banca
          </WButton>
          <WButton
            v-else-if="connessione.sincronizzabile"
            variant="primary"
            size="md"
            :loading="bankSyncStore.sincronizzando"
            @click="apriSincronizzazione"
          >
            <RefreshCw :size="16" :stroke-width="1.75" aria-hidden="true" />
            Sincronizza
          </WButton>

          <!-- Con un conto già collegato NON si offre "aggiungi un altro":
               il limite è di un conto sincronizzato per utente, e il server
               lo rifiuterebbe. -->
          <WButton variant="secondary" size="md" @click="showGestisci = true">
            Gestisci conto
          </WButton>
        </div>
      </WCard>
    </DataState>

    <PremiumModal
      :open="showPremium"
      @close="showPremium = false"
      @attivato="bankSyncStore.fetchStato()"
    />

    <AppDialog
      :open="showSincronizza"
      title="Sincronizza movimenti"
      @close="showSincronizza = false"
    >
      <form class="bank-sync__intervallo" @submit.prevent="sincronizza">
        <p>Scegli il periodo di movimenti da leggere dalla banca. Puoi selezionare fino a 90 giorni.</p>
        <label>
          <span>Dal</span>
          <input
            v-model="dataDaSync"
            class="form-input"
            type="date"
            :min="dataMinimaSync"
            :max="oggiSync"
            required
          />
        </label>
        <label>
          <span>Al</span>
          <input
            v-model="dataASync"
            class="form-input"
            type="date"
            :min="dataDaSync || dataMinimaSync"
            :max="oggiSync"
            required
          />
        </label>
        <div class="bank-sync__intervallo-azioni">
          <WButton variant="secondary" size="md" @click="showSincronizza = false">
            Annulla
          </WButton>
          <WButton
            type="submit"
            variant="primary"
            size="md"
            :loading="bankSyncStore.sincronizzando"
            :disabled="!intervalloSyncValido"
          >
            Sincronizza periodo
          </WButton>
        </div>
      </form>
    </AppDialog>

    <!-- ── Da quando importare ─────────────────────────────────────────
         Non è un errore da mostrare con un messaggio generico: è una domanda,
         e la risposta è una data. -->
    <AppDialog
      :open="showSoglia"
      title="Da quando vuoi importare?"
      @close="showSoglia = false"
    >
      <form class="bank-sync__intervallo" @submit.prevent="confermaSoglia">
        <p>
          Hai già
          {{ bankSyncStore.sogliaRichiesta?.movimenti_preesistenti ?? 0 }}
          movimenti registrati. Importando da una data precedente potresti
          ritrovarti la stessa spesa due volte: WALLT non può riconoscere i
          movimenti che hai inserito a mano.
        </p>
        <label>
          <span>Importa i movimenti dal</span>
          <input
            v-model="importDaSoglia"
            class="form-input"
            type="date"
            :min="dataMinimaSoglia"
            :max="dataMassimaSoglia"
            required
          />
        </label>
        <button type="button" class="bank-sync__link" @click="vuoiTuttoLoStorico">
          Importa tutto lo storico disponibile (dal {{ dataMinimaSogliaTesto }})
        </button>
        <!-- È l'unico punto del prodotto in cui questo si può dire: la soglia
             resta sulla connessione e nessuna schermata la rimette in
             discussione. La via d'uscita esiste davvero (un periodo scelto a
             mano supera il pavimento), quindi va detta insieme. -->
        <p class="bank-sync__nota-soglia">
          La data vale anche per le sincronizzazioni successive: da sola WALLT
          non tornerà più indietro di qui. Se un giorno ti servisse lo storico
          precedente, puoi chiederlo scegliendo un periodo a mano da
          «Sincronizza».
        </p>
        <div class="bank-sync__intervallo-azioni">
          <WButton variant="secondary" size="md" @click="showSoglia = false">
            Annulla
          </WButton>
          <WButton
            type="submit"
            variant="primary"
            size="md"
            :loading="bankSyncStore.sincronizzando"
            :disabled="!importDaSoglia"
          >
            Importa da questa data
          </WButton>
        </div>
      </form>
    </AppDialog>

    <!-- ── Gestisci conto ──────────────────────────────────────────────── -->
    <!-- La banca la sceglie l'utente: l'elenco italiano supera i trecento
         istituti, e partire dal primo significherebbe mandare chiunque su
         una banca che non è la sua. -->
    <AppDialog
      :open="showScegliBanca"
      title="Scegli la tua banca"
      @close="showScegliBanca = false"
    >
      <div class="bank-sync__scelta">
        <label class="bank-sync__ricerca">
          <Search :size="16" :stroke-width="1.75" aria-hidden="true" />
          <input
            v-model="ricercaBanca"
            class="form-input"
            type="search"
            placeholder="Cerca la tua banca"
            autocomplete="off"
          />
        </label>

        <p v-if="bancheFiltrate.totale === 0" class="bank-sync__nessuna">
          Nessuna banca corrisponde a «{{ ricercaBanca }}».
        </p>

        <ul v-else class="bank-sync__banche">
          <li v-for="istituto in bancheFiltrate.elenco" :key="istituto.id">
            <button
              type="button"
              class="bank-sync__banca"
              :disabled="bankSyncStore.collegando"
              @click="avviaCollegamento(istituto)"
            >
              <span class="bank-sync__banca-nome">{{ istituto.nome }}</span>
              <ChevronRight :size="16" :stroke-width="1.75" aria-hidden="true" />
            </button>
          </li>
        </ul>

        <p v-if="bancheFiltrate.totale > bancheFiltrate.elenco.length" class="bank-sync__altre">
          Altre {{ bancheFiltrate.totale - bancheFiltrate.elenco.length }} banche
          corrispondono: scrivi qualche lettera in più per restringere.
        </p>

        <p class="bank-sync__privacy-nota">
          Verrai portato sul sito della tua banca per autorizzare l'accesso.
          WALLT non vede mai le tue credenziali bancarie.
        </p>
      </div>
    </AppDialog>

    <AppDialog :open="showGestisci" title="Gestisci conto bancario" @close="showGestisci = false">
      <div class="bank-sync__gestisci">
        <button
          v-if="connessione?.sincronizzabile"
          type="button"
          class="bank-sync__voce"
          :disabled="bankSyncStore.sincronizzando"
          @click="apriSincronizzazione"
        >
          <span>Sincronizza ora</span>
          <small>Scarica i movimenti più recenti dalla banca</small>
        </button>

        <button type="button" class="bank-sync__voce" @click="ricollega">
          <span>Ricollega autorizzazione</span>
          <small>Rinnova il consenso senza perdere i movimenti già importati</small>
        </button>

        <button type="button" class="bank-sync__voce" @click="showSostituisci = true">
          <span>Sostituisci conto</span>
          <small>Collega una banca diversa. I movimenti attuali restano.</small>
        </button>

        <button
          type="button"
          class="bank-sync__voce bank-sync__voce--pericolo"
          @click="showScollega = true"
        >
          <span>Scollega conto</span>
          <small>Interrompe la sincronizzazione. I movimenti restano.</small>
        </button>

        <p class="bank-sync__gestisci-nota">
          Per eliminare anche i movimenti importati dalla banca vai in
          Impostazioni → Piano e abbonamento: è un'operazione separata e
          irreversibile.
        </p>
      </div>
    </AppDialog>

    <!-- ── Conferma sostituzione ───────────────────────────────────────── -->
    <AppDialog :open="showSostituisci" title="Sostituire il conto?" @close="showSostituisci = false">
      <div class="bank-sync__conferma">
        <p>
          Il collegamento con
          <strong>{{ connessione?.istituto?.nome || 'la banca attuale' }}</strong>
          verrà revocato e potrai collegarne un altro.
        </p>
        <p class="bank-sync__conferma-rassicura">
          <CheckCircle2 :size="16" :stroke-width="1.75" aria-hidden="true" />
          I movimenti già importati NON vengono cancellati.
        </p>
        <div class="bank-sync__conferma-azioni">
          <WButton variant="secondary" size="md" @click="showSostituisci = false">Annulla</WButton>
          <WButton variant="primary" size="md" @click="confermaSostituzione">
            Sostituisci conto
          </WButton>
        </div>
      </div>
    </AppDialog>

    <!-- ── Conferma scollegamento ──────────────────────────────────────── -->
    <AppDialog :open="showScollega" title="Scollegare il conto?" @close="showScollega = false">
      <div class="bank-sync__conferma">
        <p>
          WALLT non leggerà più saldo e movimenti dalla tua banca, e
          l'autorizzazione verrà revocata presso la banca stessa.
        </p>
        <p class="bank-sync__conferma-rassicura">
          <CheckCircle2 :size="16" :stroke-width="1.75" aria-hidden="true" />
          Il conto e i movimenti già importati restano in WALLT: potrai
          continuare a usarli e ad aggiungerne a mano.
        </p>
        <div class="bank-sync__conferma-azioni">
          <WButton variant="secondary" size="md" @click="showScollega = false">Annulla</WButton>
          <WButton variant="danger" size="md" :loading="scollegando" @click="scollega">
            Scollega conto
          </WButton>
        </div>
      </div>
    </AppDialog>
  </section>
</template>

<style scoped>
.bank-sync__scelta { display: flex; flex-direction: column; gap: 0.75rem; }

.bank-sync__ricerca {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: var(--text-muted);
}

.bank-sync__ricerca .form-input { flex: 1; }

.bank-sync__banche {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  margin: 0;
  padding: 0;
  list-style: none;
  max-height: 22rem;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}

.bank-sync__banca {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  width: 100%;
  min-height: 44px;
  padding: 0.625rem 0.75rem;
  font-family: inherit;
  font-size: 0.875rem;
  text-align: left;
  color: var(--text-primary);
  background: var(--glass-secondary-bg);
  border: 1px solid var(--glass-secondary-border);
  border-radius: var(--radius-md);
  cursor: pointer;
}

.bank-sync__banca:hover:not(:disabled) { background: var(--glass-interactive-bg-hover); }
.bank-sync__banca:disabled { opacity: 0.6; cursor: default; }

.bank-sync__banca:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
}

.bank-sync__banca-nome { flex: 1; min-width: 0; }
.bank-sync__banca svg { flex-shrink: 0; color: var(--text-muted); }

.bank-sync__nessuna,
.bank-sync__altre,
.bank-sync__privacy-nota {
  margin: 0;
  font-size: var(--text-xs);
  line-height: var(--leading-snug);
  color: var(--text-muted);
}


.bank-sync { margin-top: 1.5rem; }

.bank-sync__divisore {
  height: 1px;
  margin-bottom: 1.5rem;
  background: var(--glass-primary-border);
}

.bank-sync__card {
  display: flex;
  flex-direction: column;
  gap: 0.875rem;
}

.bank-sync__intestazione {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.bank-sync__icona {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 2.5rem;
  height: 2.5rem;
  border-radius: var(--radius-md);
  color: var(--text-primary);
  background: var(--glass-interactive-bg);
  border: 1px solid var(--glass-interactive-border);
}

.bank-sync__titolo-riga {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.5rem;
  min-width: 0;
}

.bank-sync__titolo {
  margin: 0;
  font-size: 1rem;
  font-weight: 700;
  color: var(--text-primary);
}

.bank-sync__stato {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--text-muted);
}

/* L'icona accompagna sempre il colore: il significato non deve dipendere
   dal solo colore. */
.bank-sync__stato--ok { color: var(--positive); }
.bank-sync__stato--problema { color: var(--warning); }

.bank-sync__testo {
  margin: 0;
  font-size: 0.875rem;
  line-height: var(--leading-snug);
  color: var(--text-secondary);
}

.bank-sync__avviso {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  padding: 0.625rem 0.75rem;
  background: var(--glass-secondary-bg);
  border: 1px solid var(--glass-secondary-border);
  border-left: 3px solid var(--warning);
  border-radius: var(--radius-md);
}

.bank-sync__avviso svg {
  flex-shrink: 0;
  margin-top: 0.0625rem;
  color: var(--warning);
}

.bank-sync__avviso--leggero {
  margin: 0;
  align-items: center;
  font-size: 0.875rem;
  color: var(--text-secondary);
}

.bank-sync__avviso-titolo {
  margin: 0;
  font-size: 0.875rem;
  font-weight: 700;
  color: var(--text-primary);
}

.bank-sync__avviso-testo {
  margin: 0.125rem 0 0;
  font-size: 0.875rem;
  line-height: var(--leading-snug);
  color: var(--text-secondary);
}

.bank-sync__avviso-orario {
  margin: 0.25rem 0 0;
  font-size: var(--text-xs);
  color: var(--text-muted);
}

.bank-sync__dati {
  display: flex;
  flex-wrap: wrap;
  gap: 1.25rem;
  margin: 0;
}

.bank-sync__dati dt {
  margin: 0 0 0.125rem;
  font-size: var(--text-xs);
  color: var(--text-muted);
}

.bank-sync__dati dd {
  margin: 0;
  font-size: 0.9375rem;
  font-weight: 600;
  color: var(--text-primary);
}

.bank-sync__saldo {
  font-size: 1.25rem !important;
  font-variant-numeric: tabular-nums;
}

.bank-sync__azioni {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

/* --- Riconciliazione ----------------------------------------------------- */
.bank-sync__attesa {
  margin: 0;
  font-size: 0.875rem;
  color: var(--text-muted);
}

.bank-sync__gruppo {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  margin: 0;
  padding: 0;
  border: 0;
}

.bank-sync__gruppo legend {
  padding: 0 0 0.375rem;
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--text-muted);
}

.bank-sync__opzione {
  display: flex;
  align-items: flex-start;
  gap: 0.625rem;
  /* 44px di area toccabile su mobile. */
  min-height: 44px;
  padding: 0.625rem 0.75rem;
  background: var(--glass-secondary-bg);
  border: 1px solid var(--glass-secondary-border);
  border-radius: var(--radius-md);
  cursor: pointer;
}

.bank-sync__opzione:hover { background: var(--glass-interactive-bg-hover); }
.bank-sync__opzione--scelta { border-color: var(--accent-green); }

.bank-sync__opzione input { margin-top: 0.25rem; flex-shrink: 0; }

.bank-sync__opzione:focus-within {
  outline: none;
  box-shadow: var(--focus-ring);
}

.bank-sync__opzione-testo {
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
  min-width: 0;
}

.bank-sync__opzione-testo strong {
  font-size: 0.9375rem;
  font-weight: 600;
  color: var(--text-primary);
  overflow-wrap: anywhere;
}

.bank-sync__opzione-testo small {
  font-size: var(--text-xs);
  line-height: var(--leading-snug);
  color: var(--text-muted);
  overflow-wrap: anywhere;
}

.bank-sync__link {
  align-self: flex-start;
  padding: 0.25rem 0;
  font-family: inherit;
  font-size: var(--text-xs);
  color: var(--accent-text);
  background: none;
  border: 0;
  cursor: pointer;
  text-decoration: underline;
}

.bank-sync__link:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
}

/* Più specifica di `.bank-sync__intervallo p`, che altrimenti vincerebbe sul
   colore essendo dichiarata più sotto. */
.bank-sync__intervallo .bank-sync__nota-soglia {
  margin: 0;
  font-size: var(--text-xs);
  line-height: var(--leading-snug);
  color: var(--text-muted);
}

/* --- Gestisci ------------------------------------------------------------ */
.bank-sync__intervallo { display: flex; flex-direction: column; gap: 1rem; }
.bank-sync__intervallo p { margin: 0; color: var(--text-secondary); line-height: var(--leading-snug); }
.bank-sync__intervallo label { display: flex; flex-direction: column; gap: 0.375rem; }
.bank-sync__intervallo label span { font-size: var(--text-sm); font-weight: 600; color: var(--text-primary); }
.bank-sync__intervallo-azioni { display: flex; justify-content: flex-end; gap: 0.5rem; margin-top: 0.25rem; }

.bank-sync__gestisci {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.bank-sync__voce {
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
  /* 44px di area toccabile su mobile. */
  min-height: 44px;
  padding: 0.75rem 0.875rem;
  text-align: left;
  background: var(--glass-secondary-bg);
  border: 1px solid var(--glass-secondary-border);
  border-radius: var(--radius-md);
  cursor: pointer;
  font-family: inherit;
  transition: background var(--dur-fast) var(--ease-out);
}

.bank-sync__voce:hover:not(:disabled) { background: var(--glass-interactive-bg-hover); }
.bank-sync__voce:disabled { opacity: 0.6; cursor: default; }

.bank-sync__voce:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
}

.bank-sync__voce span {
  font-size: 0.9375rem;
  font-weight: 600;
  color: var(--text-primary);
}

.bank-sync__voce small {
  font-size: var(--text-xs);
  line-height: var(--leading-snug);
  color: var(--text-muted);
}

.bank-sync__voce--pericolo span { color: var(--negative); }

.bank-sync__gestisci-nota {
  margin: 0.25rem 0 0;
  font-size: var(--text-xs);
  line-height: var(--leading-snug);
  color: var(--text-muted);
}

/* --- Conferme ----------------------------------------------------------- */
.bank-sync__conferma {
  display: flex;
  flex-direction: column;
  gap: 0.875rem;
}

.bank-sync__conferma p {
  margin: 0;
  font-size: 0.9375rem;
  line-height: var(--leading-snug);
  color: var(--text-secondary);
}

.bank-sync__conferma-rassicura {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  padding: 0.625rem 0.75rem;
  background: var(--glass-secondary-bg);
  border: 1px solid var(--glass-secondary-border);
  border-radius: var(--radius-md);
  color: var(--text-primary) !important;
}

.bank-sync__conferma-rassicura svg {
  flex-shrink: 0;
  margin-top: 0.125rem;
  color: var(--positive);
}

.bank-sync__conferma-azioni {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

@media (max-width: 480px) {
  .bank-sync__azioni,
  .bank-sync__conferma-azioni { flex-direction: column; }
  .bank-sync__azioni :deep(.w-btn),
  .bank-sync__conferma-azioni :deep(.w-btn) { width: 100%; }
}
</style>
