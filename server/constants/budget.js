/**
 * Vocabolario condiviso del budget a tre voci (Bisogni, Desideri, Futuro).
 *
 * Sta in `constants/` e non dentro un service per la stessa ragione di
 * `constants/fondoEmergenza.js`: questi valori li usano validatore, servizi,
 * notifiche e il test-contratto del client, e un solo elenco non può divergere.
 *
 * Il file deve restare importabile da `client/tests/budgetContratto.test.js`,
 * che gira nel job "Frontend (build)" della CI dove `server/node_modules` non
 * esiste: qui dentro non deve entrare nessun `require` (CLAUDE.md, Regola 22).
 */

// Le tre macro-categorie, nell'ordine in cui la pagina le mostra. L'ordine
// conta anche per i centesimi: a parità di resto l'arrotondamento premia la
// voce che viene prima (vedi services/budgetModello.js).
const VOCI = ['bisogni', 'desideri', 'futuro'];

const ETICHETTE_VOCI = { bisogni: 'Bisogni', desideri: 'Desideri', futuro: 'Futuro' };

// I modelli pronti. Le percentuali si copiano sul profilo al momento della
// scelta: cambiare un numero qui non altera i piani già salvati.
const MODELLI_PRONTI = {
  equilibrato: { bisogni: 50, desideri: 30, futuro: 20 },
  spese_fisse_alte: { bisogni: 70, desideri: 20, futuro: 10 },
  risparmio_deciso: { bisogni: 40, desideri: 30, futuro: 30 },
};

const MODELLO_PERSONALIZZATO = 'personalizzato';

const MODELLI_IDS = [...Object.keys(MODELLI_PRONTI), MODELLO_PERSONALIZZATO];

// Oltre questa quota dell'entrata, le spese fisse dichiarate nell'onboarding
// fanno consigliare 70/20/10. Il 40% lascia circa dieci punti dei Bisogni a
// spesa alimentare e salute, che il profilo non dichiara.
const SOGLIA_SPESE_FISSE_ALTE = 0.40;

// Percentuali d'uso di una voce che fanno partire un avviso.
const SOGLIE_AVVISO = [80, 100];

// Mesi completi consecutivi con i Bisogni oltre l'obiettivo prima di
// suggerire un altro modello.
const MESI_SUGGERIMENTO_MODELLO = 3;

// Un trasferimento verso uno di questi conti è denaro messo da parte.
// 'emergenza' è il tipo del fondo di emergenza (constants/fondoEmergenza.js):
// il test-contratto verifica che i due valori restino uguali.
const TIPI_CONTO_FUTURO = ['risparmio', 'investimenti', 'emergenza'];

// Categorie con una voce fissa, che l'essenzialità non sposta: un versamento
// in investimenti è Futuro anche se il catalogo la dice discrezionale, e un
// deposito su una piattaforma di gioco resta un Desiderio.
const CATEGORIE_VOCE_FISSA = { investimento: 'futuro', deposito_scommesse: 'desideri' };

// I casi della frase del consulente, in ordine di priorità.
const CODICI_CONSIGLIO = ['entrata_mancante', 'bisogni_oltre', 'desideri_oltre', 'futuro_indietro', 'in_regola'];

/** Vero solo per un piano con esattamente le tre voci, ciascuna un intero
 * da 0 a 100, che sommano a 100. È lo stesso vincolo che il database impone
 * con un CHECK su profili_utente. */
const percentualiValide = (percentuali) => {
  if (!percentuali || typeof percentuali !== 'object') return false;
  const chiavi = Object.keys(percentuali);
  if (chiavi.length !== VOCI.length || !VOCI.every((v) => chiavi.includes(v))) return false;
  const valori = VOCI.map((v) => percentuali[v]);
  if (!valori.every((n) => Number.isInteger(n) && n >= 0 && n <= 100)) return false;
  return valori.reduce((a, b) => a + b, 0) === 100;
};

module.exports = {
  VOCI,
  ETICHETTE_VOCI,
  MODELLI_PRONTI,
  MODELLO_PERSONALIZZATO,
  MODELLI_IDS,
  SOGLIA_SPESE_FISSE_ALTE,
  SOGLIE_AVVISO,
  MESI_SUGGERIMENTO_MODELLO,
  TIPI_CONTO_FUTURO,
  CATEGORIE_VOCE_FISSA,
  CODICI_CONSIGLIO,
  percentualiValide,
};
