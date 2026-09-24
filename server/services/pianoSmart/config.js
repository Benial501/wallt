/**
 * Configurazione del motore Piano Smart, versione `smart-v1`.
 *
 * Qui stanno TUTTI i numeri: pesi di partenza, fattori dei modificatori,
 * soglie delle fasce, banda della libertà, limiti di iterazione. Fuori da
 * questo file il motore non contiene una sola costante numerica di dominio.
 * Il motivo è pratico: la ripartizione di un piano salvato è riproducibile
 * solo se si sa con quali numeri è stata prodotta, ed `engine_version` è il
 * riferimento a questo file.
 *
 * Cambiare un numero qui significa cambiare `ENGINE_VERSION`: i piani già
 * salvati conservano la loro versione e non vanno reinterpretati con pesi
 * nuovi.
 *
 * ATTENZIONE: `PESI_BASE` NON sono percentuali finali. Sono il punto di
 * partenza su cui agiscono i modificatori, la banda della libertà, i cap e la
 * redistribuzione. Un piano che finisse esattamente 25/25/20/20/10 sarebbe una
 * coincidenza, non il comportamento previsto.
 */
const { CATEGORIE } = require('../../constants/pianoSmart');

const ENGINE_VERSION = 'smart-v1';

const PESI_BASE = {
  needs: 25,
  safety: 25,
  goals: 20,
  future: 20,
  freedom: 10,
};

/**
 * Soglie che traducono le metriche del FinancialContext in fasce.
 *
 * Nessuna soglia è "naturale": sono scelte, e stanno qui per essere
 * discutibili in un punto solo. Dove una soglia esisteva già altrove nel
 * progetto è stata ripresa e non reinventata (la stabilità del reddito, per
 * esempio, arriva già classificata da `entrate.service.js` con CV <= 0.25).
 */
const SOGLIE = {
  /** spese essenziali mensili / reddito ricorrente mensile */
  expensePressure: { medium: 0.5, high: 0.7 },
  /** tasso di risparmio (monthlySavings / reddito medio) */
  savingsRate: { low: 0.05, medium: 0.2 },
  /** rate mensili equivalenti / reddito ricorrente (vedi debiti.service.js) */
  debtPressure: { low: 0.15, medium: 0.35 },
  emergency: {
    /** sotto un mese di copertura la situazione è critica, non "bassa" */
    mesiCritici: 1,
    /** usato solo quando il fondo esiste ma non espone un target in mesi */
    targetMesiDefault: 3,
    /** oltre target * questo fattore la copertura è considerata solida */
    fattoreForte: 1.5,
  },
  goal: {
    /** mesi residui entro cui una scadenza è urgente */
    urgenteMesi: 3,
    /** mesi residui entro cui una scadenza si avvicina */
    vicinoMesi: 6,
  },
  flexibility: {
    /** liquidità allocabile espressa in mesi di spese essenziali */
    mediaMesi: 1,
    altaMesi: 3,
  },
  dataConfidence: {
    /** mesi civili completi necessari per una confidenza piena */
    mesiBuoni: 3,
    /** almeno un mese completo per non essere in INSUFFICIENT */
    mesiLimitati: 1,
  },
  /** variazione della spesa dell'ultimo mese completo rispetto alla media dei
   * precedenti, oltre la quale si dichiara un aumento o una diminuzione */
  variazioneSpesa: 0.15,
};

/**
 * Modificatori moltiplicativi, una tabella per driver.
 *
 * Moltiplicativi e non additivi perché devono comporsi: emergenza critica
 * *insieme* a cash flow negativo deve dare una ripartizione più prudente di
 * ciascuna delle due da sola, e con i pesi additivi l'effetto combinato
 * dipenderebbe dall'ordine di applicazione.
 *
 * Una categoria assente da una tabella vale 1 (nessun effetto). Un driver la
 * cui metrica è `null` non applica NIENTE: l'assenza di dato non è un neutro
 * dichiarato, abbassa `dataConfidence` (vedi profile.service.js).
 */
const MODIFICATORI = {
  emergencyCoverage: {
    // Sotto un mese di copertura tutto il resto viene dopo.
    CRITICAL: {
      needs: 1.2, safety: 2.2, goals: 0.9, future: 0.4, freedom: 0.5,
    },
    LOW: { safety: 1.5, future: 0.8, freedom: 0.8 },
    // Target raggiunto: la sicurezza smette di essere prioritaria e il
    // capitale è più utile altrove.
    ADEQUATE: { safety: 0.6, goals: 1.2, future: 1.2 },
    STRONG: {
      safety: 0.2, goals: 1.3, future: 1.4, freedom: 1.15,
    },
  },

  savingsCapacity: {
    // Spende più di quanto incassa: il futuro non è il problema di oggi.
    NEGATIVE: {
      needs: 1.5, safety: 1.3, future: 0.35, freedom: 0.4,
    },
    LOW: { needs: 1.2, future: 0.7, freedom: 0.85 },
    MEDIUM: {},
    HIGH: { needs: 0.85, goals: 1.15, future: 1.3 },
  },

  incomeStability: {
    HIGH: { future: 1.1, freedom: 1.1 },
    // MEDIUM è anche il caso "non dimostrabile": prudente, non neutro.
    MEDIUM: { safety: 1.1, future: 0.95 },
    LOW: {
      needs: 1.15, safety: 1.35, future: 0.75, freedom: 0.8,
    },
  },

  expensePressure: {
    LOW: {},
    MEDIUM: { needs: 1.15, freedom: 0.9 },
    HIGH: { needs: 1.35, future: 0.8, freedom: 0.75 },
  },

  debtPressure: {
    NONE: {},
    LOW: {},
    MEDIUM: {
      needs: 1.15, safety: 1.1, future: 0.85, freedom: 0.85,
    },
    // Più prudenza, MAI estinzione aggressiva: Piano Smart non propone di
    // usare tutto per chiudere un debito.
    HIGH: {
      needs: 1.3, safety: 1.2, future: 0.7, freedom: 0.7,
    },
  },

  goalPressure: {
    // NONE è gestito dall'azzeramento di eleggibilità, non da un fattore.
    NONE: {},
    LOW: {},
    MEDIUM: { goals: 1.3 },
    HIGH: { goals: 1.6, freedom: 0.9 },
  },

  /**
   * Origine della somma. Una somma ricorrente deve coprire il mese che viene,
   * quindi pesa di più su `needs`; una una tantum non ha un mese da coprire e
   * può spingere su sicurezza, obiettivi e futuro. `freedom` non viene
   * azzerata in nessuno dei due casi.
   */
  sourceKind: {
    ricorrente: { needs: 1.25 },
    occasionale: {
      needs: 0.6, safety: 1.2, goals: 1.2, future: 1.2,
    },
  },

  /** Meno si sa, più prudente è la proposta. Non è una penalità: è l'unico
   * modo onesto di allocare quando lo storico non può confermare nulla. */
  dataConfidence: {
    GOOD: {},
    LIMITED: { safety: 1.1, future: 0.95 },
    INSUFFICIENT: { safety: 1.2, future: 0.8, freedom: 0.9 },
  },
};

/**
 * Banda della libertà, in quota sul capitale allocabile.
 *
 * `freedom` non è un residuo: serve alla sostenibilità del piano. Un piano che
 * non lascia niente all'utente viene abbandonato, e un piano abbandonato non
 * protegge nessuno. Per questo ha un minimo, e il minimo scende — non
 * sparisce — quando la situazione lo impone.
 */
const LIBERTA = {
  minNormale: 0.05,
  maxNormale: 0.15,
  /** con cash flow negativo, emergenza critica o debito alto */
  minCompressa: 0.02,
};

/** Punteggi per distribuire la quota `goals` fra più obiettivi. `null` (l'utente
 * non ha ancora scelto una priorità) sta in mezzo: non è "bassa". */
const PESO_PRIORITA = {
  alta: 3, media: 2, bassa: 1, sconosciuta: 1.5,
};

/** Urgenza derivata dallo stato che `obiettiviStato.service.js` già calcola. */
const PESO_URGENZA = {
  scaduto: 3,
  scadenza_oggi: 3,
  scadenza_mese_corrente: 2.5,
  urgente: 2,
  vicino: 1.5,
  in_corso: 1,
  senza_scadenza: 0.8,
};

/** Solo `goals` e `safety` hanno un cap, quindi due passaggi bastano: il
 * limite a 5 è un guardrail contro un loop, non una previsione. */
const MAX_ITERAZIONI_REDISTRIBUZIONE = 5;

/** Ordine di ultima istanza per il residuo che nessuna categoria eleggibile
 * può accogliere. Non dovrebbe mai servire (needs/future/freedom non hanno
 * cap), ma un residuo perso romperebbe l'invariante della somma. */
const DESTINATARI_ULTIMA_ISTANZA = ['freedom', 'needs', 'future'];

module.exports = {
  ENGINE_VERSION,
  CATEGORIE,
  PESI_BASE,
  SOGLIE,
  MODIFICATORI,
  LIBERTA,
  PESO_PRIORITA,
  PESO_URGENZA,
  MAX_ITERAZIONI_REDISTRIBUZIONE,
  DESTINATARI_ULTIMA_ISTANZA,
};
