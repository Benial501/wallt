/**
 * I reason code di Piano Smart: l'unico vocabolario con cui il motore
 * dichiara *perché* ha deciso così.
 *
 * Regola non negoziabile: un codice non viene mai emesso senza il dato che lo
 * giustifica. Non esistono codici "di cortesia" per riempire la spiegazione,
 * e non esiste un codice che dica qualcosa di più preciso di quanto i dati
 * permettano.
 *
 * L'ordine di `PRIORITA` è l'ordine con cui i codici vengono scelti quando
 * bisogna ridurli ai 3-5 destinati all'interfaccia: prima ciò che vincola la
 * ripartizione (emergenza, cash flow, debito), poi ciò che la orienta
 * (obiettivi, reddito, origine), poi i limiti dichiarati sui dati.
 */

const REASON_CODES = [
  // Vincoli forti: spiegano da soli la forma della ripartizione.
  'NEGATIVE_CASH_FLOW',
  'LOW_EMERGENCY_BUFFER',
  'HIGH_DEBT_PRESSURE',
  'HIGH_EXPENSE_PRESSURE',
  'ZERO_ALLOCATABLE_CAPITAL',

  // Traguardi e cap raggiunti: spiegano dove il denaro NON è andato.
  'EMERGENCY_TARGET_REACHED',
  'SAFETY_CAP_REACHED',
  'GOALS_CAP_REACHED',
  'NO_ACTIVE_GOALS',
  'NO_EMERGENCY_FUND_DEFINED',

  // Obiettivi.
  'HIGH_PRIORITY_GOAL',
  'GOAL_DEADLINE_APPROACHING',
  'GOAL_BEHIND_SCHEDULE',
  'GOAL_AHEAD_OF_SCHEDULE',

  // Reddito e capacità di risparmio.
  'UNSTABLE_INCOME',
  'STABLE_INCOME',
  'HIGH_SAVINGS_CAPACITY',
  'LOW_SAVINGS_CAPACITY',

  // Origine della somma.
  'EXTRA_INCOME',
  'RECURRING_INCOME',

  // Andamento delle spese.
  'SPENDING_INCREASE',
  'SPENDING_DECREASE',

  // Limiti dichiarati: cosa il motore NON ha potuto usare.
  'INSUFFICIENT_HISTORY',
  'SPECIAL_ACCOUNT_LIQUIDITY_EXCLUDED',
  'ILLIQUID_INVESTMENTS_EXCLUDED',
  'MANUAL_CONTEXT_USED',
];

/** Rango di priorità per codice (0 = più importante). Derivato dall'ordine
 * dell'elenco, così non esistono due fonti da tenere allineate. */
const PRIORITA = Object.fromEntries(REASON_CODES.map((codice, i) => [codice, i]));

const isReasonCode = (codice) => Object.prototype.hasOwnProperty.call(PRIORITA, codice);

/**
 * Deduplica e ordina per priorità. `limite` taglia l'elenco destinato
 * all'interfaccia senza toccare quello completo salvato sul piano: la UI
 * mostra le motivazioni principali, il database conserva tutte.
 */
const ordinaReasonCodes = (codici, limite = null) => {
  const unici = [...new Set(codici.filter(isReasonCode))];
  unici.sort((a, b) => PRIORITA[a] - PRIORITA[b]);
  return limite === null ? unici : unici.slice(0, limite);
};

module.exports = {
  REASON_CODES, PRIORITA, isReasonCode, ordinaReasonCodes,
};
