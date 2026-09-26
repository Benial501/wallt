const { fromCents, toCents } = require('../pianoSmart/money');
const { oggiLocale, fineMese, inizioMese } = require('../../utils/dateRome');

const cents = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number * 100) : null;
};

const money = (value) => (value === null ? null : fromCents(value));
const euro = (value) => {
  const formatted = signedMoney(value);
  return formatted === null ? null : formatted.replace('.', ',');
};
const signedMoney = (value) => {
  if (value === null) return null;
  return value < 0 ? `-${fromCents(Math.abs(value))}` : fromCents(value);
};


const buildSuggestion = ({ key, title, reason, effect, priority, action = null }) => ({
  key, title, reason, effect, priority, action,
});

// Il vocabolario di `stato` è quello di obiettiviStato.service.js
// (`completato`, `in_corso`, `scaduto`, …), non quello dei piani: il
// conteggio vive qui perché il client non deve reinterpretare uno stato
// di dominio (vedi il vincolo "il backend resta l'unica fonte di verità").
const obiettivoAttivo = (goal) => goal.stato !== 'completato';

/** Simula una spesa aggiuntiva senza scrivere dati finanziari. */
function simulatePurchase(situation, rawAmount) {
  const amount = toCents(rawAmount);
  if (!situation || amount === null || amount <= 0) return null;
  const available = cents(situation.current?.availableToSpend);
  const shortfall = cents(situation.current?.shortfall);
  const dailyLimit = cents(situation.current?.dailyLimit);
  const averageDailyExpenses = cents(situation.current?.averageDailyExpenses);
  const dailyLimitBasis = situation.current?.dailyLimitBasis;
  const forecast = cents(situation.forecast?.endOfMonthAvailable);
  const remainingDays = Number(situation.current?.remainingDays);
  if (available === null || shortfall === null || !Number.isInteger(remainingDays) || remainingDays <= 0) return null;

  const availableAfter = available - shortfall - amount;
  const marginLimitAfter = Math.floor(Math.max(availableAfter, 0) / remainingDays);
  const dailyLimitAfter = marginLimitAfter === null ? null
    : dailyLimitBasis === 'spesa_media' && averageDailyExpenses !== null
      ? Math.min(marginLimitAfter, averageDailyExpenses) : marginLimitAfter;
  const forecastAfter = forecast === null ? null : forecast - amount;
  const status = availableAfter < 0 || (forecastAfter !== null && forecastAfter < 0) ? 'rischio'
    : dailyLimitAfter === null || forecastAfter === null ? 'non_stimabile'
      : amount <= dailyLimit ? 'compatibile' : 'attenzione';
  const impact = available === 0 || amount * 100 > available * 45 ? 'alto'
    : amount * 100 > available * 20 ? 'moderato' : 'basso';

  return {
    amount: fromCents(amount),
    availableBefore: fromCents(available),
    availableAfter: signedMoney(availableAfter),
    dailyLimitBefore: money(dailyLimit),
    dailyLimitAfter: money(dailyLimitAfter),
    forecastBefore: signedMoney(forecast),
    forecastAfter: signedMoney(forecastAfter),
    status,
    impact,
    writesFinancialData: false,
  };
}

function buildCurrentSituation({ context, now = new Date(), changes = null }) {
  const referenceDate = context.period?.referenceDate || oggiLocale(undefined, now);
  const monthEnd = fineMese(referenceDate);
  const remainingDays = Number(monthEnd.slice(-2)) - Number(referenceDate.slice(-2)) + 1;
  const liquidity = cents(context.liquidity?.ordinary);
  const netLiquidity = cents(context.liquidity?.allocatable);
  const allocated = cents(context.liquidity?.allocated);
  const recurringCommitments = cents(context.liquidity?.commitments);
  const recurringItems = (context.recurring?.items || [])
    .filter((item) => item.dueDate >= referenceDate && item.dueDate <= monthEnd)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const upcomingTotal = recurringItems.reduce((sum, item) => sum + (cents(item.amount) || 0), 0);
  // La liquidità centrale protegge il periodo corrente. Le ulteriori
  // occorrenze settimanali entro fine mese non sono ancora in quel totale.
  const additionalCommitments = recurringItems.filter((item) => item.reserved === false)
    .reduce((sum, item) => sum + (cents(item.amount) || 0), 0);
  const commitmentsAlreadyRemoved = new Set(recurringItems
    .filter((item) => item.reserved === false)
    .map((item) => item.occurrenceKey));
  const monthlyIncome = cents(context.income?.monthlyAverage);
  const monthlyExpenses = cents(context.expenses?.monthlyAverage);
  const reliableRecurringIncome = context.income?.stability === 'stabile'
    && (cents(context.income?.recurringMonthlyAverage) || 0) > 0;
  const incomeMode = reliableRecurringIncome ? 'ricorrente' : 'irregolare';
  const reserveMonths = Math.min(6, Math.max(1, Number(context.preferences?.mesiRiservaPianoSmart) || 1));
  const essentialAverage = cents(context.expenses?.byNecessity?.essential?.monthlyAverage);
  const reserveExpenseBasis = essentialAverage !== null ? 'essenziale'
    : monthlyExpenses !== null ? 'totale' : null;
  const monthlyExpenseBasis = essentialAverage !== null ? essentialAverage : monthlyExpenses;
  const averageExpenseMonths = Number(context.expenses?.averageMonths) || 0;
  const reserveCanBeEstimated = incomeMode === 'ricorrente'
    || (monthlyExpenseBasis !== null && averageExpenseMonths > 0);
  const reserveTarget = incomeMode === 'irregolare' && reserveCanBeEstimated
    ? monthlyExpenseBasis * reserveMonths : incomeMode === 'ricorrente' ? 0 : null;
  const emergencyFundBalance = context.emergencyFund?.status === 'assente'
    ? 0 : cents(context.emergencyFund?.current);
  const reserveFromLiquidity = incomeMode === 'ricorrente' ? 0
    : reserveTarget === null || emergencyFundBalance === null ? null
      : Math.max(reserveTarget - emergencyFundBalance, 0);
  const baseNetAvailable = netLiquidity === null ? null : netLiquidity - additionalCommitments;
  const netAvailable = baseNetAvailable === null || reserveFromLiquidity === null
    ? null : baseNetAvailable - reserveFromLiquidity;
  const protectedAmount = allocated === null || recurringCommitments === null || reserveFromLiquidity === null
    ? null : allocated + recurringCommitments + additionalCommitments + reserveFromLiquidity;
  const available = netAvailable === null ? null : Math.max(netAvailable, 0);
  const shortfall = netAvailable === null ? null : Math.max(-netAvailable, 0);
  let progressiveMargin = available;
  const cashFlowTimeline = (context.recurring?.cashFlowItems || [])
    .filter((item) => item.dueDate >= referenceDate)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate)
      || a.occurrenceKey.localeCompare(b.occurrenceKey))
    .map((item) => {
      const amount = cents(item.amount);
      if (progressiveMargin !== null && amount !== null) {
        if (item.direction === 'entrata') progressiveMargin += amount;
        else if (item.direction === 'uscita' && item.reserved !== true
          && !commitmentsAlreadyRemoved.has(item.occurrenceKey)) progressiveMargin -= amount;
      } else {
        progressiveMargin = null;
      }
      return {
        ...item,
        amount: money(amount),
        marginAfter: signedMoney(progressiveMargin),
      };
    });
  const marginDailyLimit = available === null ? null : Math.floor(available / remainingDays);
  const averageDailyExpenses = incomeMode === 'irregolare' && monthlyExpenses !== null
    ? Math.floor(monthlyExpenses / 30.4375) : null;
  const dailyLimit = marginDailyLimit === null ? null
    : incomeMode === 'irregolare' && averageDailyExpenses !== null
      ? Math.min(marginDailyLimit, averageDailyExpenses) : marginDailyLimit;
  const currentExpenses = cents(context.expenses?.currentMonth);
  const variableExpenses = cents(context.expenses?.variableCurrentMonth);
  const monthlySavings = monthlyIncome !== null && monthlyExpenses !== null
    ? monthlyIncome - monthlyExpenses : null;
  const dataQuality = context.dataQuality || {};
  const goals = (context.goals || []).map((goal) => {
    const parsedRemaining = cents(goal.importo_restante);
    const remaining = parsedRemaining !== null && parsedRemaining >= 0 ? parsedRemaining : null;
    let estimateReason = null;
    let estimatedMonthsAtCurrentMargin = null;
    if (goal.stato === 'completato') estimateReason = 'Obiettivo già completato.';
    else if (goal.stato === 'scaduto') estimateReason = 'Obiettivo scaduto: la stima non è applicabile.';
    else if (remaining === null) estimateReason = 'Importo residuo non disponibile.';
    else if (remaining === 0) {
      estimatedMonthsAtCurrentMargin = 0;
      estimateReason = 'Obiettivo senza importo residuo.';
    } else if ((dataQuality.completeMonths || 0) < 3) {
      estimateReason = 'Servono almeno tre mesi civili completi per una stima.';
    } else if (monthlySavings === null || monthlySavings <= 0) {
      estimateReason = 'La media mensile non mostra un margine positivo.';
    } else {
      estimatedMonthsAtCurrentMargin = Math.ceil(remaining / monthlySavings);
      estimateReason = 'Stima teorica individuale basata sul margine medio mensile.';
    }
    return {
      ...goal,
      importo_restante: money(remaining),
      contributo_mensile_richiesto: money(cents(goal.contributo_mensile_richiesto)),
      estimatedMonthsAtCurrentMargin,
      estimateBasis: estimatedMonthsAtCurrentMargin === null ? null : 'margine_medio_mensile',
      estimateReason,
    };
  });
  const firstDate = dataQuality.firstMovementDate;
  const observationStart = firstDate && firstDate > inizioMese(referenceDate)
    ? firstDate : inizioMese(referenceDate);
  const observedDays = firstDate && firstDate <= referenceDate
    ? Number(referenceDate.slice(-2)) - Number(observationStart.slice(-2)) + 1 : 0;
  const canEstimate = observedDays > 0 && variableExpenses !== null && !dataQuality.missingExpenseData;
  const actualDailySpend = canEstimate ? Math.round(variableExpenses / observedDays) : null;
  const projectedRemainingSpend = canEstimate ? Math.round(variableExpenses * remainingDays / observedDays) : null;
  const forecast = netAvailable === null || projectedRemainingSpend === null
    ? null : netAvailable - projectedRemainingSpend;
  const paceDelta = dailyLimit === null || actualDailySpend === null ? null : actualDailySpend - dailyLimit;
  const paceStatus = paceDelta === null ? 'non_stimabile' : paceDelta <= 0 ? 'sotto_controllo' : 'sopra_il_ritmo';
  const warnings = [];

  if (dataQuality.completeMonths === 0) warnings.push('Non ci sono mesi completi sufficienti per una media storica.');
  if (dataQuality.registrationCompleteness === 'non_verificabile') {
    warnings.push('La completezza delle registrazioni manuali non è verificabile.');
  }
  if (dataQuality.missingClassificationData) {
    warnings.push('Alcuni movimenti non sono classificati: le variazioni per categoria possono essere incomplete.');
  }
  if (liquidity === null) warnings.push('La liquidità disponibile non è stimabile.');
  if (incomeMode === 'irregolare' && !reserveCanBeEstimated) {
    warnings.push('Per stimare lo spendibile con la riserva scelta servono medie di spesa e dati disponibili sul fondo di sicurezza.');
  }
  if (!canEstimate) {
    warnings.push('Registra ancora qualche spesa per costruire una previsione affidabile.');
  }

  const suggestions = [];
  if (available !== null && dailyLimit === 0) {
    suggestions.push(buildSuggestion({
      key: 'protect-commitments', priority: 1, title: 'Proteggi le spese già previste',
      reason: 'Il margine libero è esaurito dopo gli impegni rilevati.',
      effect: 'Evita nuove spese non necessarie fino alla prossima entrata.',
      action: { type: 'create-plan', mode: 'monthly' },
    }));
  }
  if (monthlySavings !== null && monthlySavings < 0) {
    suggestions.push(buildSuggestion({
      key: 'review-spending', priority: 1, title: 'Rivedi il ritmo delle spese',
      reason: 'La media delle spese supera la media delle entrate.',
      effect: `Ridurre le spese di ${money(Math.abs(monthlySavings))} al mese riporterebbe il flusso in equilibrio.`,
      action: { type: 'open-analysis' },
    }));
  }
  const fondoAssente = context.emergencyFund?.status === 'assente';
  const fondoDaCompletare = !fondoAssente
    && (cents(context.emergencyFund?.missingAmount) ?? 0) > 0;
  if (fondoAssente || (fondoDaCompletare && available > 0)) {
    suggestions.push(buildSuggestion({
      key: 'start-emergency-fund', priority: 2, title: 'Inizia una riserva di sicurezza',
      reason: fondoAssente
        ? 'Non hai ancora un fondo di sicurezza configurato.'
        : 'Hai già un fondo di sicurezza: puoi farlo crescere con un trasferimento da un altro conto.',
      effect: fondoAssente
        ? 'Una piccola quota protetta aumenta il margine per gli imprevisti.'
        : 'Crea un Piano Smart per decidere quale quota di una nuova entrata destinare alla riserva.',
      action: fondoAssente
        ? { type: 'open-emergency-fund' }
        : { type: 'create-plan', mode: 'emergency-fund' },
    }));
  }
  if (monthlySavings !== null && monthlySavings > 0 && available > 0) {
    suggestions.push(buildSuggestion({
      key: 'protect-savings', priority: 2, title: `Metti da parte €${euro(Math.min(monthlySavings, available))}`,
      reason: 'Il tuo flusso medio lascia un margine positivo.',
      effect: 'Una quota protetta può aiutarti a costruire una riserva senza superare il margine attuale.',
      action: { type: 'create-plan', mode: 'goal' },
    }));
  }
  if ((context.goals || []).some(obiettivoAttivo)) {
    suggestions.push(buildSuggestion({
      key: 'review-goals', priority: 3, title: 'Controlla i tuoi obiettivi',
      reason: 'Hai almeno un obiettivo di risparmio ancora attivo.',
      effect: 'Puoi verificare se il contributo attuale è compatibile con il margine del mese.',
      action: { type: 'create-plan', mode: 'goal' },
    }));
  }

  if (actualDailySpend !== null && dailyLimit !== null && actualDailySpend > dailyLimit) {
    suggestions.unshift(buildSuggestion({
      key: 'above-daily-pace', priority: 0, title: 'Il ritmo di spesa è sopra il limite',
      reason: `Stai spendendo circa ${money(actualDailySpend)} al giorno contro ${money(dailyLimit)} disponibili.`,
      effect: 'Ridurre le prossime spese protegge il margine di fine mese.',
      action: { type: 'open-analysis' },
    }));
  }

  const netWorth = context.netWorth || {};
  const insights = [];
  if (paceStatus === 'sopra_il_ritmo') insights.push({ key: 'pace-risk', text: `Stai spendendo €${euro(Math.abs(paceDelta))} al giorno oltre il limite disponibile.`, priority: 0 });
  else if (paceStatus === 'sotto_controllo') insights.push({ key: 'pace-ok', text: `Stai spendendo €${euro(Math.abs(paceDelta))} al giorno meno del limite disponibile.`, priority: 1 });
  if (forecast !== null) insights.push({ key: 'forecast', text: `Se continui così, potresti chiudere il mese con circa €${euro(forecast)}.`, priority: 1 });
  if (recurringItems.length) insights.push({ key: 'upcoming', text: `Hai ${recurringItems.length} uscite ricorrenti previste entro fine mese, già considerate nello spendibile.`, priority: 2 });
  if (!insights.length) insights.push({ key: 'learning', text: 'Continua a registrare le tue spese: WALLT costruirà una previsione più precisa.', priority: 3 });
  const progressBase = monthlyIncome !== null && monthlyIncome > 0 ? monthlyIncome : (currentExpenses + Math.max(available || 0, 0));
  const averageGroup = (group = {}) => ({
    from: group.from ?? null,
    to: group.to ?? null,
    periodCount: group.periodCount ?? 0,
    items: (group.items || []).map((item) => ({
      ...item,
      total: money(cents(item.total)),
      average: money(cents(item.average)),
    })),
  });
  const frequentAverages = context.expenses?.frequentAverages || {};
  const orderedSuggestions = suggestions.sort((a, b) => a.priority - b.priority);
  const visibleSuggestions = orderedSuggestions.slice(0, 3);
  const emergencyFundSuggestion = orderedSuggestions.find((suggestion) => suggestion.key === 'start-emergency-fund');
  if (fondoAssente && emergencyFundSuggestion && !visibleSuggestions.includes(emergencyFundSuggestion)) {
    visibleSuggestions[visibleSuggestions.length - 1] = emergencyFundSuggestion;
    visibleSuggestions.sort((a, b) => a.priority - b.priority);
  }
  return {
    current: {
      liquidity: signedMoney(liquidity),
      expensesThisMonth: money(currentExpenses),
      commitments: money(recurringCommitments),
      protectedAmount: money(protectedAmount),
      allocatedToGoals: money(allocated),
      additionalCommitments: money(additionalCommitments),
      shortfall: money(shortfall),
      availableToSpend: money(available),
      dailyLimit: money(dailyLimit),
      incomeMode,
      reserveMonths: incomeMode === 'irregolare' ? reserveMonths : null,
      reserveTarget: money(reserveTarget),
      reserveFromLiquidity: money(reserveFromLiquidity),
      reserveExpenseBasis: incomeMode === 'irregolare' ? reserveExpenseBasis : null,
      averageExpenseMonths: incomeMode === 'irregolare' ? averageExpenseMonths : null,
      averageDailyExpenses: money(averageDailyExpenses),
      dailyLimitBasis: incomeMode === 'irregolare' && averageDailyExpenses !== null
        && marginDailyLimit !== null && averageDailyExpenses < marginDailyLimit
        ? 'spesa_media' : 'margine_mese',
      actualDailySpend: money(actualDailySpend),
      dailyMargin: dailyLimit === null || actualDailySpend === null
        ? null : signedMoney(dailyLimit - actualDailySpend),
      paceDelta: signedMoney(paceDelta),
      paceStatus,
      remainingDays,
      period: referenceDate,
    },
    forecast: {
      endOfMonthAvailable: signedMoney(forecast),
      monthlyIncome: money(monthlyIncome),
      monthlyExpenses: money(monthlyExpenses),
      monthlySavings: signedMoney(monthlySavings),
      projectedRemainingSpend: money(projectedRemainingSpend),
      status: forecast === null ? 'non_stimabile' : forecast < 0 ? 'sotto_pressione' : 'stimato',
      observedDays,
      basis: 'spese_non_ricorrenti_mese_corrente',
      quality: !canEstimate ? 'dati_insufficienti' : (dataQuality.completeMonths || 0) < 3 ? 'storico_limitato' : 'storico_disponibile',
      scenarios: forecast === null ? null : {
        prudente: signedMoney(netAvailable - Math.round(projectedRemainingSpend * 1.2)),
        attuale: signedMoney(forecast),
        limite: signedMoney(Math.max(available - (dailyLimit * remainingDays), 0)),
      },
    },
    insights: insights.sort((a, b) => a.priority - b.priority).slice(0, 3),
    upcoming: {
      items: recurringItems.map((item) => ({ ...item, amount: money(cents(item.amount)) })),
      total: money(upcomingTotal), afterTotal: signedMoney(netAvailable), through: monthEnd,
    },
    cashFlowTimeline,
    changes,
    monthProgress: {
      income: money(cents(context.income?.currentMonth)),
      expenses: money(currentExpenses),
      remaining: money(available),
      incomeShare: progressBase > 0 ? Math.min(Math.round((cents(context.income?.currentMonth) || 0) / progressBase * 100), 100) : 0,
      expenseShare: progressBase > 0 ? Math.min(Math.round(currentExpenses / progressBase * 100), 100) : 0,
    },
    frequentExpenses: {
      weekly: averageGroup(frequentAverages.weekly),
      monthly: averageGroup(frequentAverages.monthly),
    },
    financialDirection: {
      netWorth: signedMoney(cents(netWorth.total)),
      assets: signedMoney(cents(netWorth.assets)),
      liabilities: money(cents(netWorth.liabilities)),
      debts: context.debts || null,
      emergencyFund: context.emergencyFund || null,
      goals,
      activeGoals: goals.filter(obiettivoAttivo).length,
    },
    suggestions: visibleSuggestions,
    dataQuality,
    warnings,
  };
}

module.exports = { buildCurrentSituation, simulatePurchase };
