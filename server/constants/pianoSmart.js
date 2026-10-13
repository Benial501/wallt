/**
 * Vocabolari condivisi di Piano Smart. Stanno in `constants/` e non dentro un
 * service perché li usano validator, controller, motore e test: un solo
 * elenco, non cinque copie che divergono (stesso principio di
 * `constants/categorie.js`).
 */

/** Le cinque categorie, in ordine FISSO. L'ordine non è estetico: è lo
 * spareggio deterministico della ripartizione al resto maggiore, quindi
 * cambiarlo cambia l'output del motore a parità di input. */
const CATEGORIE = ['needs', 'safety', 'goals', 'future', 'freedom'];

/**
 * Origini ammesse per la somma in ingresso. È NATURE_ENTRATA di
 * `services/entrate.service.js` meno 'sconosciuto': l'utente che pianifica
 * una somma sa da dove arriva, e un'origine ignota non aggiungerebbe
 * informazione al motore. Allineato al CHECK della migration.
 */
const SOURCE_TYPES = ['stipendio', 'pensione', 'compenso', 'bonus', 'regalo', 'rimborso', 'vendita', 'altro'];

/**
 * Origini trattate come reddito ricorrente quando l'utente non dichiara
 * diversamente. `source_recurring` resta comunque un campo esplicito: questo
 * elenco serve solo a proporre un default coerente, non a sovrascrivere la
 * scelta dell'utente.
 */
const SOURCE_TYPES_RICORRENTI = ['stipendio', 'pensione'];

const STATI_PIANO = ['draft', 'active', 'completed', 'archived'];

/** Transizioni di stato ammesse. `archived` è terminale: non esiste un
 * DELETE, quindi archiviare non deve poter essere annullato in silenzio. */
const TRANSIZIONI_STATO = {
  draft: ['active', 'archived'],
  active: ['completed', 'archived'],
  completed: ['archived'],
  archived: [],
};

/** Chiavi delle risposte manuali di contesto. Valgono per il piano corrente,
 * entrano nello snapshot e NON scrivono nulla sulle entità finanziarie. */
const CHIAVI_CONTESTO_MANUALE = [
  'monthly_income_average',
  'essential_monthly_expenses',
  'liquid_savings',
  'upcoming_obligations',
];

/**
 * Orizzonte di spesa: entro quale termine il capitale deve bastare.
 * `mensile` è il ciclo che si rinnova col mese civile (comportamento
 * storico); `data` è un termine fisso scelto dall'utente, che si avvicina
 * ogni giorno.
 */
const ORIZZONTE_TIPI = ['mensile', 'data'];

/** Tetto alla data scelta. Non è una regola di prodotto ma di calcolo: oltre
 * questo limite la proiezione delle ricorrenze diventa un esercizio teorico
 * (e un ciclo di migliaia di giorni per ogni richiesta). */
const ORIZZONTE_MESI_MAX = 36;

/**
 * Copertura scelta dall'utente per la riserva prudenziale
 * (`profili_utente.mesi_riserva_piano_smart`), in mesi di spese essenziali.
 * Un solo numero, non due copie: prima di questa costante il tetto era
 * scritto due volte lato server (qui e nel validatore) e una terza volta,
 * sganciata, nell'opzione `v-for` del selettore lato client.
 */
const RISERVA_MESI_MIN = 1;
const RISERVA_MESI_MAX = 6;

/**
 * Stato di `horizon` (`orizzonte.service.js`). `in_ritardo` esiste perché un
 * capitale che basta non vuol dire "al ritmo giusto": se al ritmo attuale il
 * capitale si esaurirebbe prima del termine scelto, il piano non è "in
 * rotta" — prima della sua introduzione questa distinzione viveva solo in
 * un confronto di date lato client, indipendente dallo stato del server, e i
 * due potevano risultare veri insieme.
 */
const ORIZZONTE_STATI = ['non_stimabile', 'scaduto', 'scoperto', 'in_ritardo', 'in_rotta'];

/**
 * `current.dailyLimitBasis`: quale valore determina il limite giornaliero
 * mostrato. `orizzonte_data` è l'unico discriminante con cui il client sa
 * che il tetto della spesa media storica non si applica (modalità data).
 */
const DAILY_LIMIT_BASIS = ['margine_mese', 'spesa_media', 'orizzonte_data'];

module.exports = {
  CATEGORIE,
  SOURCE_TYPES,
  SOURCE_TYPES_RICORRENTI,
  STATI_PIANO,
  TRANSIZIONI_STATO,
  CHIAVI_CONTESTO_MANUALE,
  ORIZZONTE_TIPI,
  ORIZZONTE_MESI_MAX,
  RISERVA_MESI_MIN,
  RISERVA_MESI_MAX,
  ORIZZONTE_STATI,
  DAILY_LIMIT_BASIS,
};
