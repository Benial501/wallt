/**
 * Vocabolario di Bank Sync (connessioni bancarie Open Banking).
 *
 * Come `constants/entitlements.js`: nessun `require` qui dentro, perché il
 * file deve restare importabile dal test-contratto del client, che gira dove
 * Sequelize non è installato.
 */

// ── Provider ───────────────────────────────────────────────────────────────

/** GoCardless Bank Account Data (ex Nordigen). */
const PROVIDER_GOCARDLESS = 'gocardless';
/** Provider finto, locale, per sviluppo e test. Rifiutato in produzione
 * (vedi providers/index.js): non è un mock introdotto in produzione, è un
 * ambiente di sviluppo che la produzione si rifiuta di usare. */
const PROVIDER_SANDBOX = 'sandbox';

/**
 * Enable Banking.
 *
 * Sostituisce GoCardless come provider praticabile: da luglio 2025
 * GoCardless ha disabilitato i nuovi account Bank Account Data, quindi
 * quell'adapter resta nel codice ma non è più ottenibile da zero. Enable
 * Banking ha registrazione self-service, è gratuito per uso personale e
 * valutazione, e in "Restricted Production" permette di collegare i propri
 * conti senza che WALLT debba essere un TPP autorizzato: si appoggia alla
 * licenza AISP del fornitore.
 *
 * Due differenze che l'adapter deve assorbire, e che il resto di WALLT non
 * deve vedere: l'autenticazione è un JWT firmato con chiave privata RSA
 * (non una coppia id/segreto), e una banca si identifica con nome + paese
 * invece che con un id opaco.
 */
const PROVIDER_ENABLE_BANKING = 'enablebanking';

const PROVIDERS = [PROVIDER_GOCARDLESS, PROVIDER_ENABLE_BANKING, PROVIDER_SANDBOX];

// ── Stato di una connessione ───────────────────────────────────────────────
//
// Il ciclo di vita, e quali stati "occupano" l'unico posto disponibile per
// utente. Lo storico non va perso (una connessione revocata resta come riga),
// quindi un UNIQUE(user_id) ingenuo è sbagliato: l'unicità vale sui soli
// stati vivi, con un indice parziale (vedi la migrazione).

/** Autorizzazione avviata, l'utente è sulla pagina della banca. Occupa il
 * posto, ma scade: una connessione abbandonata non blocca l'utente per
 * sempre (vedi `STATE_TTL_MINUTI`). */
const STATO_IN_ATTESA = 'in_attesa';
/** Consenso concesso, ma l'utente non ha ancora detto a quale conto WALLT
 * appartengono questi movimenti. Occupa il posto (l'autorizzazione presso la
 * banca esiste) e NON è sincronizzabile: finché la destinazione è ignota,
 * importare significherebbe duplicare lo storico inserito a mano. */
const STATO_DA_RICONCILIARE = 'da_riconciliare';
/** Consenso concesso, conto collegato, sincronizzabile. */
const STATO_ATTIVA = 'attiva';
/** Il consenso bancario è scaduto: serve ricollegare. Lo storico resta. */
const STATO_CONSENSO_SCADUTO = 'consenso_scaduto';
/** L'ultima sincronizzazione è fallita per un errore del provider o della
 * banca. I dati già importati restano validi. */
const STATO_ERRORE = 'errore';
/** L'entitlement è stato revocato: nessuna nuova sync, nessun dato perso. */
const STATO_SOSPESA_ENTITLEMENT = 'sospesa_entitlement';
/** Terminale. Autorizzazione revocata presso il provider. Libera il posto. */
const STATO_REVOCATA = 'revocata';

const CONNECTION_STATUS = [
  STATO_IN_ATTESA,
  STATO_DA_RICONCILIARE,
  STATO_ATTIVA,
  STATO_CONSENSO_SCADUTO,
  STATO_ERRORE,
  STATO_SOSPESA_ENTITLEMENT,
  STATO_REVOCATA,
];

/** Gli stati che occupano l'unico posto per utente: tutti tranne il
 * terminale. È l'elenco applicativo gemello dell'indice parziale
 * `bank_connections_una_viva_per_utente`: il database resta la garanzia, qui
 * serve solo a dare un messaggio sensato prima di sbatterci contro. */
const STATI_VIVI = CONNECTION_STATUS.filter((s) => s !== STATO_REVOCATA);

/** Gli stati da cui una sincronizzazione può partire. */
const STATI_SINCRONIZZABILI = [STATO_ATTIVA, STATO_ERRORE];

// ── Codici d'errore ────────────────────────────────────────────────────────
//
// "Errore generico" non è una risposta: "connessione scaduta → ricollega" e
// "la banca non risponde → riprova" portano l'utente a due azioni diverse.
// Il codice tecnico resta qui, il testo mostrato sta nel client.

const ERR_NETWORK = 'NETWORK_ERROR';
const ERR_PROVIDER = 'PROVIDER_ERROR';
const ERR_RATE_LIMIT = 'RATE_LIMIT';
const ERR_CONSENT_EXPIRED = 'CONSENT_EXPIRED';
const ERR_AUTHORIZATION_REVOKED = 'AUTHORIZATION_REVOKED';
const ERR_BANK_UNAVAILABLE = 'BANK_UNAVAILABLE';
const ERR_SYNC_FAILED = 'SYNC_FAILED';
const ERR_NO_TRANSACTIONS = 'NO_TRANSACTIONS';
const ERR_SYNC_IN_CORSO = 'SYNC_IN_CORSO';
const ERR_COOLDOWN = 'COOLDOWN';
const ERR_CONFIG = 'PROVIDER_NON_CONFIGURATO';
/** Il primo Sincronizza di un utente che ha già movimenti propri: serve che
 * scelga da quando importare, altrimenti i 90 giorni si sommerebbero a
 * quanto ha inserito a mano. Non è un guasto, è una domanda. */
const ERR_SOGLIA_RICHIESTA = 'SOGLIA_RICHIESTA';
/** Le sincronizzazioni manuali di oggi sono esaurite. Come la soglia, non è
 * un guasto: è un limite raggiunto, e per questo non entra in
 * `SYNC_ERROR_CODES` — scriverlo in `error_code` mostrerebbe un conto "da
 * sistemare" a chi ha solo premuto il pulsante una volta di troppo. */
const ERR_LIMITE_MANUALI = 'LIMITE_MANUALI_GIORNALIERO';

const SYNC_ERROR_CODES = [
  ERR_NETWORK,
  ERR_PROVIDER,
  ERR_RATE_LIMIT,
  ERR_CONSENT_EXPIRED,
  ERR_AUTHORIZATION_REVOKED,
  ERR_BANK_UNAVAILABLE,
  ERR_SYNC_FAILED,
  ERR_NO_TRANSACTIONS,
  ERR_SYNC_IN_CORSO,
  ERR_COOLDOWN,
  ERR_CONFIG,
];

/** Gli errori che richiedono un'azione dell'utente (ricollegare), non un
 * nuovo tentativo. Separarli è ciò che permette alla UI di proporre il
 * pulsante giusto. */
const ERRORI_RICHIEDONO_RICONNESSIONE = [ERR_CONSENT_EXPIRED, ERR_AUTHORIZATION_REVOKED];

// ── Stato di una transazione presso la banca ───────────────────────────────

const TX_BOOKED = 'booked';
const TX_PENDING = 'pending';

const TRANSACTION_STATUS = [TX_BOOKED, TX_PENDING];

/**
 * Solo le transazioni `booked` entrano nei movimenti WALLT.
 *
 * È la garanzia più forte possibile contro il doppio conteggio richiesto dal
 * brief (pending → booked come due spese distinte): una transazione non
 * ancora contabilizzata dalla banca non diventa un movimento, quindi non
 * esiste nessuna coppia da riconciliare. Le `pending` vengono comunque
 * contate e riportate nell'esito della sincronizzazione, così l'interfaccia
 * può dire "3 operazioni in attesa presso la banca" senza che nessun saldo
 * ne dipenda.
 *
 * Il motore resta pronto all'altra scelta: `normalizer.js` conserva lo stato
 * e `movimenti.stato_banca` lo persiste, quindi passare a importare anche le
 * pending significherebbe cambiare questo elenco e gestire la conversione in
 * `syncEngine`, non riscrivere la pipeline.
 */
const STATI_IMPORTABILI = [TX_BOOKED];

// ── Riconciliazione con i conti esistenti ──────────────────────────────────

/**
 * Il valore che, nel campo `destinazione` di `POST /bank-sync/riconciliazione`,
 * chiede di creare un conto nuovo invece di agganciarne uno esistente.
 *
 * Sta qui e non come stringa scritta a mano nei tre punti che la confrontano
 * (validazione, controller, servizio): è un valore di protocollo, e tre copie
 * di una stringa di protocollo divergono alla prima modifica.
 */
const DESTINAZIONE_NUOVO = 'nuovo';

// ── Origine di un movimento ────────────────────────────────────────────────
//
// Il campo `movimenti.origine` dice da dove viene una riga. Esisteva già
// implicitamente (manuale vs import da file) ma non era registrato: senza di
// esso non è possibile sapere quali movimenti ha scritto una connessione, e
// quindi nemmeno offrire "elimina anche i dati importati" in modo onesto.

const ORIGINE_MANUALE = 'manuale';
const ORIGINE_IMPORT = 'import';
const ORIGINE_OPEN_BANKING = 'open_banking';

const ORIGINI_MOVIMENTO = [ORIGINE_MANUALE, ORIGINE_IMPORT, ORIGINE_OPEN_BANKING];

// ── Limiti e finestre temporali ────────────────────────────────────────────

/** Un solo conto bancario sincronizzato per utente. Requisito di prodotto,
 * applicato dal database (indice parziale) e dal servizio. */
const MAX_CONNESSIONI_PER_UTENTE = 1;

/** Validità del `state` dell'autorizzazione. Oltre questo tempo una
 * connessione `in_attesa` è considerata abbandonata e può essere sostituita:
 * senza scadenza, chi chiude la pagina della banca resterebbe bloccato. */
const STATE_TTL_MINUTI = 30;

/** Oltre questo tempo un lock di sincronizzazione è considerato orfano (il
 * processo che lo aveva preso è morto). Su Vercel una funzione non può durare
 * più di 60s, quindi 10 minuti sono abbondantemente al di là di ogni sync
 * legittima ancora in corso. */
const SYNC_LOCK_SCADENZA_MINUTI = 10;

/** Finestra di storico richiesta al provider alla prima sincronizzazione. */
const GIORNI_STORICO_INIZIALE = 90;

/** Finestra richiesta nelle sincronizzazioni successive. Sovrapposizione
 * voluta rispetto all'ultima sync: una transazione può essere contabilizzata
 * con qualche giorno di ritardo, e la deduplica rende la sovrapposizione
 * gratuita.
 *
 * Non può scendere a 1: la data di un movimento è la `booking_date` della
 * banca, non il giorno in cui WALLT scarica. Un pagamento di lunedì che
 * diventa `booked` mercoledì, con una finestra `oggi→oggi`, non rientrerebbe
 * in nessuna richiesta — né mercoledì (chiesto per mercoledì) né lunedì (già
 * passato). Tre giorni coprono il ritardo tipico delle carte; l'unica cosa
 * che la sovrapposizione produce è un incremento di `duplicati_evitati`. */
const GIORNI_STORICO_INCREMENTALE = 3;

/** Limite della finestra selezionabile dall'utente, coerente con lo storico
 * massimo richiesto al provider al primo collegamento. */
const GIORNI_STORICO_MANUALE_MASSIMO = 90;

module.exports = {
  PROVIDER_GOCARDLESS,
  PROVIDER_ENABLE_BANKING,
  PROVIDER_SANDBOX,
  PROVIDERS,
  STATO_IN_ATTESA,
  STATO_DA_RICONCILIARE,
  STATO_ATTIVA,
  STATO_CONSENSO_SCADUTO,
  STATO_ERRORE,
  STATO_SOSPESA_ENTITLEMENT,
  STATO_REVOCATA,
  CONNECTION_STATUS,
  STATI_VIVI,
  STATI_SINCRONIZZABILI,
  ERR_NETWORK,
  ERR_PROVIDER,
  ERR_RATE_LIMIT,
  ERR_CONSENT_EXPIRED,
  ERR_AUTHORIZATION_REVOKED,
  ERR_BANK_UNAVAILABLE,
  ERR_SYNC_FAILED,
  ERR_NO_TRANSACTIONS,
  ERR_SYNC_IN_CORSO,
  ERR_COOLDOWN,
  ERR_CONFIG,
  ERR_SOGLIA_RICHIESTA,
  ERR_LIMITE_MANUALI,
  SYNC_ERROR_CODES,
  ERRORI_RICHIEDONO_RICONNESSIONE,
  TX_BOOKED,
  TX_PENDING,
  TRANSACTION_STATUS,
  STATI_IMPORTABILI,
  ORIGINE_MANUALE,
  ORIGINE_IMPORT,
  ORIGINE_OPEN_BANKING,
  ORIGINI_MOVIMENTO,
  DESTINAZIONE_NUOVO,
  MAX_CONNESSIONI_PER_UTENTE,
  STATE_TTL_MINUTI,
  SYNC_LOCK_SCADENZA_MINUTI,
  GIORNI_STORICO_INIZIALE,
  GIORNI_STORICO_INCREMENTALE,
  GIORNI_STORICO_MANUALE_MASSIMO,
};
