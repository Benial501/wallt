/**
 * SmartFinancialProfile: lo strato deterministico fra FinancialContext e
 * l'Allocation Engine.
 *
 * Fa UNA cosa: traduce le metriche del contesto in otto fasce discrete. Non
 * fa query, non salva niente, non calcola una sola media o copertura per
 * conto suo — tutto arriva già calcolato dai servizi di dominio
 * (`entrate`, `spese`, `essenzialita`, `fondoSicurezza`, `debiti`,
 * `liquidita`, `obiettiviStato`, `finestraMesi`). Duplicare una di quelle
 * formule qui la farebbe divergere in silenzio, che è esattamente il difetto
 * che la Regola 20 di CLAUDE.md esiste per prevenire.
 *
 * Il principio che governa ogni fascia: **una metrica assente resta assente**.
 * `null` non diventa un valore centrale. Due casi vanno però distinti, e la
 * differenza è sostanziale:
 *
 * - **Metrica mancante** (`null`): la fascia è `null` e il motore non applica
 *   nessun modificatore per quel driver. Non sapere quanto si spende non
 *   autorizza a dire che si spende "il giusto".
 * - **Classificazione che dichiara di non poter concludere**: la fascia esiste
 *   ed è prudente. `income.stability === 'insufficiente'` non è un dato
 *   mancante: è `entrate.service.js` che afferma "meno di tre mesi completi,
 *   non posso dimostrare stabilità". Quella affermazione è informazione, e la
 *   fascia diventa MEDIUM (prudente) invece di HIGH. Compare in `ignoti` per
 *   abbassare `dataConfidence`, ma il suo modificatore viene applicato.
 */
const { SOGLIE } = require('./config');

const numeroValido = (v) => typeof v === 'number' && Number.isFinite(v);

/** Numero utile come denominatore: presente, finito e strettamente positivo. */
const denominatoreValido = (v) => numeroValido(v) && v > 0;

/**
 * Stabilità del reddito. `stabile`/`variabile` sono conclusioni vere;
 * `insufficiente`/`nessuna_entrata` sono dichiarazioni di impotenza, e
 * diventano MEDIUM + ignoto (vedi il commento di intestazione).
 */
const fasciaIncomeStability = (stability) => {
  if (stability === 'stabile') return { valore: 'HIGH', ignoto: false };
  if (stability === 'variabile') return { valore: 'LOW', ignoto: false };
  return { valore: 'MEDIUM', ignoto: true };
};

/** Spese essenziali mensili sul reddito RICORRENTE (non sul totale, che può
 * contenere entrate occasionali non ripetibili — vedi entrate.service.js). */
const fasciaExpensePressure = (essenziali, redditoRicorrente) => {
  if (!numeroValido(essenziali) || !denominatoreValido(redditoRicorrente)) return null;
  const rapporto = essenziali / redditoRicorrente;
  if (rapporto >= SOGLIE.expensePressure.high) return 'HIGH';
  if (rapporto >= SOGLIE.expensePressure.medium) return 'MEDIUM';
  return 'LOW';
};

/**
 * Capacità di risparmio. Il segno di `monthlySavings` decide NEGATIVE prima di
 * qualunque soglia sul tasso: spendere più di quanto si incassa è una
 * condizione, non un tasso basso.
 */
const fasciaSavingsCapacity = (monthlySavings, savingsRate) => {
  if (!numeroValido(monthlySavings)) return null;
  if (monthlySavings < 0) return 'NEGATIVE';
  if (!numeroValido(savingsRate)) return monthlySavings > 0 ? 'MEDIUM' : 'LOW';
  if (savingsRate >= SOGLIE.savingsRate.medium) return 'HIGH';
  if (savingsRate >= SOGLIE.savingsRate.low) return 'MEDIUM';
  return 'LOW';
};

/**
 * Copertura del fondo di sicurezza in mesi, confrontata col target dell'utente.
 *
 * `null` quando il fondo non esiste (`status: 'assente'`) o quando la copertura
 * non è calcolabile: senza un target scelto dall'utente non c'è niente da
 * confrontare, e derivarne uno da tre mesi di spese significherebbe inventare
 * un obiettivo che l'utente non ha mai posto. Il motore lo dichiara con
 * `NO_EMERGENCY_FUND_DEFINED` e lascia `safety` al suo peso base.
 */
const fasciaEmergencyCoverage = (fondo) => {
  if (!fondo || fondo.status === 'assente') return null;
  const mesi = fondo.coverageMonths;
  if (!numeroValido(mesi)) return null;
  if (mesi < SOGLIE.emergency.mesiCritici) return 'CRITICAL';
  const target = denominatoreValido(fondo.targetMonths)
    ? fondo.targetMonths : SOGLIE.emergency.targetMesiDefault;
  if (mesi < target) return 'LOW';
  if (mesi < target * SOGLIE.emergency.fattoreForte) return 'ADEQUATE';
  return 'STRONG';
};

/** Un obiettivo è eleggibile se non è completato e ha ancora qualcosa da
 * raggiungere. Stati senza importi utilizzabili (`dati_mancanti`,
 * `target_non_valido`) non sono eleggibili: non si alloca denaro su un
 * obiettivo di cui non si conosce il traguardo. */
const obiettivoEleggibile = (o) => o
  && o.stato !== 'completato'
  && o.stato !== 'dati_mancanti'
  && o.stato !== 'target_non_valido'
  && numeroValido(o.importo_restante)
  && o.importo_restante > 0;

/** Urgenza di un singolo obiettivo, dallo stato che obiettiviStato.service.js
 * già calcola più i mesi rimanenti. Nessuna data viene riletta qui. */
const urgenzaObiettivo = (o) => {
  if (o.stato === 'scaduto' || o.stato === 'scadenza_oggi') return 'scaduto';
  if (o.stato === 'scadenza_mese_corrente') return 'scadenza_mese_corrente';
  if (o.stato === 'senza_scadenza') return 'senza_scadenza';
  if (numeroValido(o.mesi_rimanenti)) {
    if (o.mesi_rimanenti <= SOGLIE.goal.urgenteMesi) return 'urgente';
    if (o.mesi_rimanenti <= SOGLIE.goal.vicinoMesi) return 'vicino';
  }
  return 'in_corso';
};

const RANGO_URGENZA = {
  senza_scadenza: 0, in_corso: 1, vicino: 2, urgente: 3, scadenza_mese_corrente: 3, scaduto: 4,
};

/** NONE quando non c'è un obiettivo su cui allocare: è un fatto osservato
 * (l'utente non ne ha, o li ha già completati), non un dato mancante. */
const fasciaGoalPressure = (eleggibili) => {
  if (eleggibili.length === 0) return 'NONE';
  const rangoMassimo = Math.max(...eleggibili.map((o) => RANGO_URGENZA[urgenzaObiettivo(o)] ?? 1));
  if (rangoMassimo >= 3) return 'HIGH';
  if (rangoMassimo === 2) return 'MEDIUM';
  return 'LOW';
};

/**
 * Pressione debitoria. NONE quando non ci sono debiti (fatto osservato);
 * `null` quando i debiti ci sono ma il rapporto non è calcolabile perché il
 * reddito affidabile è ignoto (vedi debiti.service.js, che ritorna `null` e
 * non zero proprio per non fingere un rapporto).
 */
const fasciaDebtPressure = (debts) => {
  const nessunDebito = !debts || (debts.totalOutstanding === 0 && debts.totalMonthlyPayments === 0);
  if (nessunDebito) return 'NONE';
  const pressione = debts.debtPressure;
  if (!numeroValido(pressione)) return null;
  if (pressione >= SOGLIE.debtPressure.medium) return 'HIGH';
  if (pressione >= SOGLIE.debtPressure.low) return 'MEDIUM';
  return 'LOW';
};

/**
 * Flessibilità: quanti mesi di spese essenziali copre la liquidità
 * ALLOCABILE.
 *
 * Si usa `liquidity.allocatable` e non `liquidity.total` per progetto: è la
 * grandezza che `liquidita.service.js` già depura da ciò che è allocato su
 * obiettivi, dagli impegni ricorrenti non ancora addebitati e dai conti
 * speciali (scommesse). Un saldo su un conto di gioco non è flessibilità
 * finanziaria disponibile, e un euro già promesso a un obiettivo non si può
 * contare due volte.
 */
const fasciaFinancialFlexibility = (allocabile, essenziali) => {
  if (!numeroValido(allocabile) || !denominatoreValido(essenziali)) return null;
  const mesi = allocabile / essenziali;
  if (mesi >= SOGLIE.flexibility.altaMesi) return 'HIGH';
  if (mesi >= SOGLIE.flexibility.mediaMesi) return 'MEDIUM';
  return 'LOW';
};

/**
 * Confidenza sui dati. Tre ingredienti: quanti mesi civili completi esistono,
 * se il contesto dichiara lo storico sufficiente, e quante fasce sono risultate
 * ignote o assenti.
 *
 * Una risposta manuale non può portare a GOOD: una dichiarazione dell'utente
 * vale per questo piano, ma non è uno storico osservato. Il massimo che può
 * fare è far salire un nuovo utente da INSUFFICIENT a LIMITED.
 */
const fasciaDataConfidence = ({
  completeMonths, hasSufficientHistory, missingClassificationData, ignoti, manualUsed,
}) => {
  const mesi = numeroValido(completeMonths) ? completeMonths : 0;
  if (mesi < SOGLIE.dataConfidence.mesiLimitati) {
    return manualUsed.length > 0 ? 'LIMITED' : 'INSUFFICIENT';
  }
  if (mesi < SOGLIE.dataConfidence.mesiBuoni) return 'LIMITED';
  if (!hasSufficientHistory) return 'LIMITED';
  if (missingClassificationData) return 'LIMITED';
  if (ignoti.length > 0 || manualUsed.length > 0) return 'LIMITED';
  return 'GOOD';
};

/**
 * Risposta manuale utilizzabile: un numero finito e non negativo. Una stringa
 * numerica è accettata (arriva da un form), qualunque altra cosa viene
 * ignorata in silenzio — non è un errore dell'utente da bloccare, è un dato
 * che semplicemente non si può usare.
 */
const rispostaNumerica = (valore) => {
  if (valore === null || valore === undefined || valore === '' || typeof valore === 'boolean') return null;
  const n = Number(valore);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

/**
 * Costruisce il profilo.
 *
 * @param {Object} context - output di `getFinancialContext`
 * @param {Object} [manualAnswers] - risposte di contesto per QUESTO piano.
 *   Riempiono un driver assente; se il dato è osservato, l'osservato vince e la
 *   chiave finisce in `manualIgnored`. Non scrivono niente da nessuna parte.
 * @returns {Object} otto fasce + `ignoti` + `driver` (i numeri che le hanno
 *   prodotte, per lo snapshot e la spiegazione) + tracciamento del manuale.
 */
const buildProfile = (context, manualAnswers = {}) => {
  const risposte = manualAnswers && typeof manualAnswers === 'object' ? manualAnswers : {};
  const manualUsed = [];
  const manualIgnored = [];

  /** Sceglie fra osservato e dichiarato secondo la regola unica: l'osservato
   * vince sempre; il dichiarato riempie solo un buco. */
  const conRisposta = (osservato, chiave) => {
    const dichiarato = rispostaNumerica(risposte[chiave]);
    if (numeroValido(osservato)) {
      if (dichiarato !== null) manualIgnored.push(chiave);
      return osservato;
    }
    if (dichiarato === null) return osservato;
    manualUsed.push(chiave);
    return dichiarato;
  };

  const essenzialiMensili = conRisposta(
    context.expenses?.byNecessity?.essential?.monthlyAverage ?? null,
    'essential_monthly_expenses',
  );
  const redditoRicorrente = conRisposta(
    context.income?.recurringMonthlyAverage ?? null,
    'monthly_income_average',
  );
  const liquiditaAllocabile = conRisposta(
    context.liquidity?.allocatable ?? null,
    'liquid_savings',
  );

  const stability = fasciaIncomeStability(context.income?.stability);
  const eleggibili = (context.goals || []).filter(obiettivoEleggibile);

  const expensePressure = fasciaExpensePressure(essenzialiMensili, redditoRicorrente);
  const savingsCapacity = fasciaSavingsCapacity(
    context.cashFlow?.monthlySavings ?? null,
    context.cashFlow?.savingsRate ?? null,
  );
  const emergencyCoverage = fasciaEmergencyCoverage(context.emergencyFund);
  const goalPressure = fasciaGoalPressure(eleggibili);
  const debtPressure = fasciaDebtPressure(context.debts);
  const financialFlexibility = fasciaFinancialFlexibility(liquiditaAllocabile, essenzialiMensili);

  // `ignoti` raccoglie ogni fascia che i dati non hanno potuto stabilire. Serve
  // a due cose: abbassare `dataConfidence` e permettere al motore di sapere
  // quali modificatori NON deve applicare.
  const ignoti = [];
  if (stability.ignoto) ignoti.push('incomeStability');
  if (expensePressure === null) ignoti.push('expensePressure');
  if (savingsCapacity === null) ignoti.push('savingsCapacity');
  if (emergencyCoverage === null) ignoti.push('emergencyCoverage');
  if (debtPressure === null) ignoti.push('debtPressure');
  if (financialFlexibility === null) ignoti.push('financialFlexibility');

  const dataConfidence = fasciaDataConfidence({
    completeMonths: context.dataQuality?.completeMonths,
    hasSufficientHistory: context.dataQuality?.hasSufficientHistory,
    missingClassificationData: context.dataQuality?.missingClassificationData,
    ignoti,
    manualUsed,
  });

  return {
    incomeStability: stability.valore,
    expensePressure,
    savingsCapacity,
    emergencyCoverage,
    goalPressure,
    debtPressure,
    financialFlexibility,
    dataConfidence,

    ignoti,
    manualUsed,
    manualIgnored,

    // I numeri con cui le fasce sono state decise. Finiscono nello snapshot del
    // piano: senza di essi "perché safety è alta" resta indimostrabile.
    driver: {
      essentialMonthlyExpenses: essenzialiMensili,
      recurringMonthlyIncome: redditoRicorrente,
      allocatableLiquidity: liquiditaAllocabile,
      monthlySavings: context.cashFlow?.monthlySavings ?? null,
      savingsRate: context.cashFlow?.savingsRate ?? null,
      emergencyCoverageMonths: context.emergencyFund?.coverageMonths ?? null,
      emergencyTargetMonths: context.emergencyFund?.targetMonths ?? null,
      emergencyMissingAmount: context.emergencyFund?.missingAmount ?? null,
      emergencyFundStatus: context.emergencyFund?.status ?? null,
      debtPressureRatio: context.debts?.debtPressure ?? null,
      debtMonthlyPayments: context.debts?.totalMonthlyPayments ?? 0,
      incomeStabilityRaw: context.income?.stability ?? null,
      completeMonths: context.dataQuality?.completeMonths ?? 0,
      eligibleGoals: eleggibili.length,
    },
  };
};

module.exports = {
  buildProfile,
  obiettivoEleggibile,
  urgenzaObiettivo,
};
