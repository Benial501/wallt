/**
 * Serializzazione di Piano Smart verso l'API.
 *
 * REGOLA UNICA DEL NAMESPACE: ogni importo monetario esce come **stringa
 * decimale** con due decimali (`"800.00"`), `contextSummary` compreso. Nessuna
 * eccezione.
 *
 * Perché le stringhe e non i numeri, dato che il resto di WALLT serializza gli
 * aggregati come numeri: l'invariante di Piano Smart è che la somma delle
 * cinque quote sia ESATTAMENTE il capitale allocabile. Con le stringhe il
 * client non fa aritmetica float sul denaro e può verificare quell'invariante
 * da sé; con i numeri l'invariante diventa indimostrabile sul lato che lo deve
 * mostrare. Il prezzo è che questo namespace si scosta dallo stile degli altri
 * endpoint: è documentato in docs/piano-smart-api-contract.md.
 *
 * NON sono importi e restano numeri: percentuali, rapporti (tasso di
 * risparmio, pressione debitoria), mesi di copertura, conteggi. Trasformarli
 * in stringhe monetarie li farebbe sembrare euro.
 */
const { fromCents } = require('./money');
const { spiegaReasonCodes } = require('./explanation.service');

/**
 * Euro (numero, come lo producono i servizi di dominio) → stringa decimale.
 *
 * Gestisce i negativi, che esistono davvero in questo dominio:
 * `liquidity.allocatable` può essere negativo, e `liquidita.service.js` NON lo
 * tronca a zero per progetto (un negativo è il segnale reale che
 * allocato+impegnato supera i conti ordinari). Troncarlo qui cancellerebbe
 * quell'informazione.
 *
 * `null` per un valore assente: un dato che non c'è non diventa "0.00".
 */
const euroString = (valore) => {
  if (typeof valore !== 'number' || !Number.isFinite(valore)) return null;
  const centesimi = Math.round(valore * 100);
  const segno = centesimi < 0 ? '-' : '';
  return `${segno}${fromCents(Math.abs(centesimi))}`;
};

/** Centesimi interi → stringa decimale, per gli importi che il motore produce. */
const centsString = (centesimi) => (Number.isInteger(centesimi) ? fromCents(centesimi) : null);

/**
 * Riepilogo del contesto: gli aggregati con cui il piano è stato deciso.
 *
 * Contiene SOLO aggregati, mai una copia dei movimenti (sarebbe uno snapshot
 * inutilmente grande e una duplicazione dei dati personali). Le finestre
 * temporali ci sono per intero perché senza di esse una media non si può
 * interpretare: "1500 al mese" non significa niente se non si sa su quanti
 * mesi completi è calcolata.
 */
const serializeContextSummary = (context, profile) => ({
  period: {
    timezone: context.period?.timezone ?? null,
    referenceDate: context.period?.referenceDate ?? null,
    requested: context.period?.requested ?? null,
    observed: context.period?.observed ?? null,
    averageMonths: context.period?.averageMonths ?? null,
  },
  dataQuality: {
    historyMonthsAvailable: context.dataQuality?.historyMonthsAvailable ?? 0,
    completeMonths: context.dataQuality?.completeMonths ?? 0,
    incompleteMonths: context.dataQuality?.incompleteMonths ?? 0,
    firstObservedMonthPartial: context.dataQuality?.firstObservedMonthPartial ?? false,
    missingIncomeData: context.dataQuality?.missingIncomeData ?? true,
    missingExpenseData: context.dataQuality?.missingExpenseData ?? true,
    missingClassificationData: context.dataQuality?.missingClassificationData ?? false,
    hasSufficientHistory: context.dataQuality?.hasSufficientHistory ?? false,
    // Limite dichiarato da finestraMesi.service.js: senza collegamento
    // bancario la completezza delle registrazioni non è osservabile.
    registrationCompleteness: context.dataQuality?.registrationCompleteness ?? 'non_verificabile',
  },
  income: {
    monthlyAverage: euroString(context.income?.monthlyAverage),
    recurringMonthlyAverage: euroString(context.income?.recurringMonthlyAverage),
    stability: context.income?.stability ?? null,
    stabilityMonths: context.income?.stabilityMonths ?? 0,
  },
  expenses: {
    monthlyAverage: euroString(context.expenses?.monthlyAverage),
    essentialMonthlyAverage: euroString(context.expenses?.byNecessity?.essential?.monthlyAverage),
    semiEssentialMonthlyAverage: euroString(context.expenses?.byNecessity?.semiEssential?.monthlyAverage),
    discretionaryMonthlyAverage: euroString(context.expenses?.byNecessity?.discretionary?.monthlyAverage),
    unclassifiedMonthlyAverage: euroString(context.expenses?.byNecessity?.unclassified?.monthlyAverage),
  },
  cashFlow: {
    monthlySavings: euroString(context.cashFlow?.monthlySavings),
    // Rapporto, non un importo: resta un numero.
    savingsRate: context.cashFlow?.savingsRate ?? null,
    averageMonths: context.cashFlow?.averageMonths ?? 0,
  },
  liquidity: {
    total: euroString(context.liquidity?.total),
    ordinary: euroString(context.liquidity?.ordinary),
    specialAccounts: euroString(context.liquidity?.specialAccounts),
    allocated: euroString(context.liquidity?.allocated),
    commitments: euroString(context.liquidity?.commitments),
    allocatable: euroString(context.liquidity?.allocatable),
  },
  emergencyFund: {
    status: context.emergencyFund?.status ?? null,
    current: euroString(context.emergencyFund?.current),
    target: euroString(context.emergencyFund?.target),
    missingAmount: euroString(context.emergencyFund?.missingAmount),
    // Mesi di copertura: una durata, non un importo.
    coverageMonths: context.emergencyFund?.coverageMonths ?? null,
    targetMonths: context.emergencyFund?.targetMonths ?? null,
    limitedHistory: context.emergencyFund?.limitedHistory ?? null,
  },
  debts: {
    totalOutstanding: euroString(context.debts?.totalOutstanding),
    totalMonthlyPayments: euroString(context.debts?.totalMonthlyPayments),
    debtPressure: context.debts?.debtPressure ?? null,
    // Dichiarato: la rata mensile equivalente NON è un impegno accertato e non
    // viene sottratta dalla liquidità (vedi debiti.service.js).
    monthlyPaymentsIncludedInCommitments: false,
  },
  investments: {
    totalValue: euroString(context.investments?.totalValue),
    liquidValue: euroString(context.investments?.liquidValue),
    nonLiquidValue: euroString(context.investments?.nonLiquidValue),
    unknownLiquidityValue: euroString(context.investments?.unknownLiquidityValue),
    // Dichiarato: gli investimenti non aumentano il capitale allocabile.
    countedAsAllocatableCapital: false,
  },
  goals: {
    active: (context.goals || []).filter((g) => g.stato !== 'completato').length,
    completed: (context.goals || []).filter((g) => g.stato === 'completato').length,
    totalRemaining: euroString(
      (context.goals || [])
        .filter((g) => g.stato !== 'completato' && typeof g.importo_restante === 'number')
        .reduce((s, g) => s + g.importo_restante, 0),
    ),
  },
  recurring: {
    active: context.recurring?.active ?? 0,
    paused: context.recurring?.paused ?? 0,
    ended: context.recurring?.ended ?? 0,
    monthlyCommitments: euroString(context.recurring?.commitments),
  },
  netWorth: {
    assets: euroString(context.netWorth?.assets),
    liabilities: euroString(context.netWorth?.liabilities),
    total: euroString(context.netWorth?.total),
  },
  profile: profile ? serializeProfile(profile) : null,
});

/** Le otto fasce più ciò che le rende leggibili: quali non erano dimostrabili
 * dai dati e quali risposte manuali sono state usate o scartate. */
function serializeProfile(profile) {
  return {
    incomeStability: profile.incomeStability,
    expensePressure: profile.expensePressure,
    savingsCapacity: profile.savingsCapacity,
    emergencyCoverage: profile.emergencyCoverage,
    goalPressure: profile.goalPressure,
    debtPressure: profile.debtPressure,
    financialFlexibility: profile.financialFlexibility,
    dataConfidence: profile.dataConfidence,
    unknownBands: profile.ignoti,
    manualAnswersUsed: profile.manualUsed,
    manualAnswersIgnored: profile.manualIgnored,
  };
}

/** Metadata di una categoria, con gli importi convertiti in stringhe. */
const serializeMetadata = (metadata) => {
  if (!metadata || typeof metadata !== 'object') return {};
  const esito = { ...metadata };
  if (Array.isArray(metadata.goals)) {
    esito.goals = metadata.goals.map((g) => ({
      id: g.id,
      nome: g.nome,
      priorita: g.priorita,
      urgenza: g.urgenza,
      stato: g.stato,
      amount: centsString(g.amountCents),
      remaining: centsString(g.remainingCents),
      score: g.score,
    }));
  }
  if (metadata.totalRemainingCents !== undefined) {
    esito.totalRemaining = centsString(metadata.totalRemainingCents);
    delete esito.totalRemainingCents;
  }
  if (metadata.emergencyGapCents !== undefined) {
    esito.emergencyGap = metadata.emergencyGapCents === null
      ? null : centsString(metadata.emergencyGapCents);
    delete esito.emergencyGapCents;
  }
  return esito;
};

/**
 * Preview: il piano raccomandato, non salvato.
 *
 * `finalAmount` è presente e uguale a `recommendedAmount`: il client lavora su
 * una sola forma di allocazione sia in preview sia in dettaglio, e non deve
 * sapere che in preview non esiste ancora un "finale".
 */
const serializePreview = (piano, context) => ({
  engineVersion: piano.engineVersion,
  status: piano.status,
  incomingAmount: centsString(piano.incomingCents),
  mandatoryExpenses: centsString(piano.mandatoryCents),
  allocatableCapital: centsString(piano.allocatableCents),
  recommendedTotal: centsString(piano.allocatableCents),
  sourceType: piano.sourceType,
  recurring: piano.sourceRecurring,
  financialProfile: serializeProfile(piano.profile),
  dataConfidence: piano.profile.dataConfidence,
  allocations: piano.allocations.map((a) => ({
    category: a.category,
    recommendedAmount: centsString(a.recommendedCents),
    recommendedPercentage: a.recommendedPercentage,
    finalAmount: centsString(a.recommendedCents),
    finalPercentage: a.recommendedPercentage,
    metadata: serializeMetadata(a.metadata),
    reasonCodes: a.reasonCodes,
  })),
  reasonCodes: piano.reasonCodes,
  reasons: spiegaReasonCodes(piano.reasonCodes),
  warnings: piano.warnings,
  contextSummary: serializeContextSummary(context, piano.profile),
});

/**
 * Snapshot da persistere. Include i cap **in centesimi**: un PATCH successivo
 * sulle allocazioni finali deve poter essere rivalidato contro i limiti validi
 * QUANDO il piano è stato creato, non contro un contesto che nel frattempo è
 * cambiato. Rivalidare su un contesto fresco rifiuterebbe allocazioni che
 * erano legittime al momento della scelta.
 */
const buildContextSnapshot = ({ piano, context, manualAnswers }) => ({
  engineVersion: piano.engineVersion,
  generatedAt: new Date().toISOString(),
  capsCents: piano.caps,
  weights: piano.pesi,
  manualAnswers: manualAnswers && Object.keys(manualAnswers).length > 0 ? manualAnswers : {},
  warnings: piano.warnings,
  context: serializeContextSummary(context, piano.profile),
});

/** Dettaglio di un piano salvato, dalle righe del database. */
const serializePiano = (piano, allocazioni) => {
  const snapshot = piano.context_snapshot || {};
  const reasonCodes = Array.isArray(piano.reason_codes) ? piano.reason_codes : [];
  return {
    id: piano.id,
    status: piano.status,
    engineVersion: piano.engine_version,
    createdAt: piano.createdAt,
    updatedAt: piano.updatedAt,
    incomingAmount: euroString(Number(piano.incoming_amount)),
    mandatoryExpenses: euroString(Number(piano.mandatory_expenses)),
    allocatableCapital: euroString(Number(piano.allocatable_capital)),
    recommendedTotal: euroString(Number(piano.recommended_total)),
    sourceType: piano.source_type,
    recurring: piano.source_recurring,
    financialProfile: snapshot.context?.profile ?? null,
    dataConfidence: snapshot.context?.profile?.dataConfidence ?? null,
    allocations: (allocazioni || []).map((a) => ({
      category: a.category,
      recommendedAmount: euroString(Number(a.recommended_amount)),
      recommendedPercentage: a.recommended_percentage === null
        ? null : Number(a.recommended_percentage),
      finalAmount: euroString(Number(a.final_amount)),
      finalPercentage: a.final_percentage === null ? null : Number(a.final_percentage),
      metadata: a.metadata || {},
      reasonCodes: Array.isArray(a.reason_codes) ? a.reason_codes : [],
    })),
    reasonCodes,
    reasons: spiegaReasonCodes(reasonCodes),
    warnings: snapshot.warnings || [],
    contextSummary: snapshot.context ?? null,
  };
};

/** Riga di elenco: quel che serve a mostrare lo storico, niente di più. */
const serializePianoLista = (piano, allocazioni) => ({
  id: piano.id,
  status: piano.status,
  createdAt: piano.createdAt,
  incomingAmount: euroString(Number(piano.incoming_amount)),
  mandatoryExpenses: euroString(Number(piano.mandatory_expenses)),
  allocatableCapital: euroString(Number(piano.allocatable_capital)),
  sourceType: piano.source_type,
  recurring: piano.source_recurring,
  engineVersion: piano.engine_version,
  allocations: (allocazioni || []).map((a) => ({
    category: a.category,
    finalAmount: euroString(Number(a.final_amount)),
    finalPercentage: a.final_percentage === null ? null : Number(a.final_percentage),
  })),
});

module.exports = {
  euroString,
  centsString,
  serializeProfile,
  serializeMetadata,
  serializeContextSummary,
  serializePreview,
  serializePiano,
  serializePianoLista,
  buildContextSnapshot,
};
