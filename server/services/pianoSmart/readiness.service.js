/**
 * Readiness di Piano Smart: cosa WALLT NON sa, e quindi cosa vale la pena
 * chiedere.
 *
 * Principio unico: **chiedi solo ciò che WALLT non sa**. Se il dato è nel
 * FinancialContext, non diventa una domanda — riproporlo all'utente
 * significherebbe fargli reinserire a mano quello che sta già registrando nei
 * movimenti, e rischiare due verità diverse sullo stesso numero.
 *
 * Secondo principio: **nessuna domanda blocca il piano**. Un utente appena
 * registrato deve poter usare Piano Smart. Per questo `required` è sempre
 * `false`: le risposte migliorano la stima, non la abilitano. Quando mancano,
 * il motore lo dichiara (`INSUFFICIENT_HISTORY`) e propone una ripartizione
 * più prudente. `impact` distingue le domande che cambiano davvero il risultato
 * da quelle di rifinitura, così l'interfaccia può ordinarle.
 */
const { getFinancialContext } = require('../financialContext.service');
const { buildProfile } = require('./profile.service');
const { serializeContextSummary, euroString } = require('./serializer');

const numeroValido = (v) => typeof v === 'number' && Number.isFinite(v);

/** Limiti di validazione dichiarati al client, coerenti con DECIMAL(12,2). */
const VALIDAZIONE_IMPORTO = { min: 0, max: 9999999999.99, decimals: 2 };

/**
 * Le quattro domande possibili. Ognuna esiste solo se il suo dato manca
 * davvero: la funzione `mancante` è l'unico criterio, e guarda il contesto, non
 * un flag.
 */
const DOMANDE = [
  {
    key: 'monthly_income_average',
    type: 'currency',
    label: 'Quanto incassi in media al mese?',
    description: 'Serve a capire quanto pesano le tue spese fisse. Vale solo per questo piano: '
      + 'non crea movimenti e non modifica i tuoi conti.',
    impact: 'alto',
    mancante: (context) => !numeroValido(context.income?.recurringMonthlyAverage)
      || context.income.recurringMonthlyAverage <= 0,
  },
  {
    key: 'essential_monthly_expenses',
    type: 'currency',
    label: 'Quanto spendi al mese per le cose indispensabili?',
    description: 'Affitto o mutuo, bollette, spesa alimentare, trasporti necessari. '
      + 'Serve a capire quanta riserva ti serve davvero.',
    impact: 'alto',
    mancante: (context) => !numeroValido(context.expenses?.byNecessity?.essential?.monthlyAverage),
  },
  {
    key: 'liquid_savings',
    type: 'currency',
    label: 'Quanto hai da parte, disponibile subito?',
    description: 'Solo denaro che puoi usare adesso: non investimenti vincolati '
      + 'né saldi su conti di gioco.',
    impact: 'medio',
    // WALLT non lo sa quando non c'è alcun saldo registrato: senza conti, la
    // liquidità calcolata è zero perché non c'è nulla da sommare, non perché
    // l'utente non abbia risparmi.
    mancante: (context) => (context.liquidity?.total ?? 0) === 0,
  },
  {
    key: 'upcoming_obligations',
    type: 'currency',
    label: 'Hai pagamenti già dovuti nei prossimi giorni?',
    description: 'Somme che hai già impegnato e che non vanno distribuite in questo piano.',
    impact: 'medio',
    // Solo se WALLT non ha nessuna ricorrenza da cui dedurre un impegno: con
    // ricorrenze attive il suggerimento c'è già e la domanda sarebbe un doppione.
    mancante: (context) => (context.recurring?.active ?? 0) === 0
      && (context.liquidity?.commitments ?? 0) === 0,
  },
];

/**
 * Spese obbligatorie suggerite.
 *
 * Supportato SOLO da un numero reale: `liquidity.commitments`, cioè le
 * ricorrenze attive del periodo corrente il cui addebito non è ancora avvenuto
 * (vedi liquidita.service.js, che usa la stessa chiave di idempotenza del
 * cron). Non è una stima: sono uscite che WALLT sa che arriveranno.
 *
 * Le rate dei debiti NON entrano, e non è una dimenticanza: lo schema non
 * collega un debito a una ricorrenza, quindi sommarle produrrebbe una doppia
 * sottrazione quando la rata è già registrata come ricorrente, o un totale
 * inventato quando non lo è (vedi debiti.service.js#statoRiconciliazioneRate).
 *
 * Il valore suggerito non viene MAI sottratto d'ufficio: lo conferma l'utente.
 */
const suggerisciSpeseObbligatorie = (context) => {
  const impegni = context.liquidity?.commitments ?? 0;
  if (!numeroValido(impegni) || impegni <= 0) {
    return {
      supported: false,
      amount: null,
      source: null,
      detail: 'WALLT non ha ricorrenze attive da cui dedurre spese già dovute in questo periodo.',
      appliedAutomatically: false,
    };
  }
  return {
    supported: true,
    amount: euroString(impegni),
    source: 'impegni_ricorrenti_non_addebitati',
    detail: 'Somma delle ricorrenze attive di questo periodo il cui addebito non è ancora avvenuto. '
      + 'Le rate dei debiti non sono incluse: WALLT non sa se siano già registrate come ricorrenti, '
      + 'e sommarle rischierebbe di contarle due volte.',
    appliedAutomatically: false,
  };
};

/** Avvisi sullo stato dei dati, in italiano, indipendenti da un piano. */
const avvisiReadiness = (context, profile) => {
  const avvisi = [];
  if (profile.dataConfidence === 'INSUFFICIENT') {
    avvisi.push('Non ci sono ancora mesi completi registrati: Piano Smart funziona comunque, '
      + 'ma la proposta sarà prudente. Rispondere alle domande la rende più aderente.');
  } else if (profile.dataConfidence === 'LIMITED') {
    avvisi.push('Lo storico registrato è limitato: la proposta terrà un margine di prudenza.');
  }
  if (context.dataQuality?.firstObservedMonthPartial) {
    avvisi.push('Il primo mese di storico non parte dal giorno 1, quindi è escluso dalle medie: '
      + 'delle spese precedenti al primo movimento non si sa nulla.');
  }
  if (context.dataQuality?.missingClassificationData) {
    avvisi.push('Una parte delle uscite non ha una categoria con essenzialità impostata: '
      + 'le spese essenziali potrebbero risultare più basse del reale.');
  }
  if (context.emergencyFund?.status === 'assente') {
    avvisi.push('Non hai un obiettivo di tipo fondo di sicurezza: la quota Sicurezza non avrà '
      + 'un traguardo a cui fermarsi.');
  }
  if (context.emergencyFund?.limitedHistory) {
    avvisi.push('La copertura del fondo di sicurezza è calcolata su meno di tre mesi completi.');
  }
  if ((context.liquidity?.specialAccounts ?? 0) > 0) {
    avvisi.push('I saldi dei conti di gioco non sono considerati liquidità disponibile.');
  }
  const illiquidi = (context.investments?.nonLiquidValue ?? 0)
    + (context.investments?.unknownLiquidityValue ?? 0);
  if (illiquidi > 0) {
    avvisi.push('Alcuni investimenti sono vincolati o con liquidabilità sconosciuta: '
      + 'non contano come denaro disponibile.');
  }
  return avvisi;
};

/**
 * Stato di preparazione per un utente.
 *
 * @param {number} userId
 * @param {Object} [options] - `referenceDate` iniettabile per test riproducibili
 * @returns {Promise<Object>} readiness completa + `contextSummary`
 */
const getReadiness = async (userId, options = {}) => {
  const context = await getFinancialContext(userId, options);
  const profile = buildProfile(context);

  const domandeAttive = DOMANDE.filter((d) => d.mancante(context));
  const missingFields = domandeAttive.map((d) => d.key);

  return {
    dataConfidence: profile.dataConfidence,
    dataQuality: {
      confidence: profile.dataConfidence,
      completeMonths: context.dataQuality?.completeMonths ?? 0,
      historyMonthsAvailable: context.dataQuality?.historyMonthsAvailable ?? 0,
      hasSufficientHistory: context.dataQuality?.hasSufficientHistory ?? false,
      missingIncomeData: context.dataQuality?.missingIncomeData ?? true,
      missingExpenseData: context.dataQuality?.missingExpenseData ?? true,
      missingClassificationData: context.dataQuality?.missingClassificationData ?? false,
      registrationCompleteness: context.dataQuality?.registrationCompleteness ?? 'non_verificabile',
      unknownBands: profile.ignoti,
    },
    missingFields,
    questions: domandeAttive.map((d) => ({
      key: d.key,
      type: d.type,
      label: d.label,
      description: d.description,
      // Sempre false: nessuna risposta è necessaria per generare un piano.
      required: false,
      impact: d.impact,
      validation: { ...VALIDAZIONE_IMPORTO },
      options: null,
      suggestedValue: null,
    })),
    warnings: avvisiReadiness(context, profile),
    suggestedMandatoryExpenses: suggerisciSpeseObbligatorie(context),
    contextSummary: serializeContextSummary(context, profile),
  };
};

module.exports = {
  getReadiness,
  DOMANDE,
  VALIDAZIONE_IMPORTO,
  suggerisciSpeseObbligatorie,
  avvisiReadiness,
};
