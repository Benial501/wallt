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

module.exports = {
  CATEGORIE,
  SOURCE_TYPES,
  SOURCE_TYPES_RICORRENTI,
  STATI_PIANO,
  TRANSIZIONI_STATO,
  CHIAVI_CONTESTO_MANUALE,
};
