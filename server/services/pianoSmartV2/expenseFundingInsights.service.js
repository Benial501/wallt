'use strict';

const { toCents, fromCents } = require('../pianoSmart/money');
const { calculateWeeklyQuota } = require('./expenseFundingPlan.service');

const DAY_MS = 24 * 60 * 60 * 1000;
const ESSENTIALITY_ORDER = { discrezionale: 0, semi_essenziale: 1, essenziale: 2 };
const day = (value) => new Date(`${String(value).slice(0, 10)}T00:00:00.000Z`);
const cents = (value) => {
  if (Number.isInteger(value) && value >= 0) return value;
  const parsed = toCents(value);
  return parsed === null ? 0 : parsed;
};

function buildSuggestions(monthlyCategoryHistory, monthlyNeedCents) {
  const completeMonths = [...new Set(monthlyCategoryHistory
    .filter((month) => month.complete === true).map((month) => month.month))];
  if (completeMonths.length < 3) return { coverage: 'storico_insufficiente', suggestions: [] };

  const totals = new Map();
  monthlyCategoryHistory.filter((month) => month.complete === true).forEach((month) => {
    (month.categories || []).forEach((entry) => {
      if (!Object.prototype.hasOwnProperty.call(ESSENTIALITY_ORDER, entry.essentiality)) return;
      const key = entry.category;
      if (!totals.has(key)) totals.set(key, {
        category: key, name: entry.name || key, essentiality: entry.essentiality, byMonth: new Map(),
      });
      const item = totals.get(key);
      item.byMonth.set(month.month, cents(entry.amountCents ?? entry.amount));
    });
  });

  const candidates = [];
  totals.forEach((item) => {
    // Il confronto minimo usa solo importi osservati positivi: l'assenza di
    // righe non viene interpretata come una riduzione intenzionale.
    const observed = [...item.byMonth.values()].filter((amount) => amount > 0);
    if (observed.length < 2) return;
    const averageMonthlyCents = Math.round(
      [...item.byMonth.values()].reduce((sum, amount) => sum + amount, 0) / completeMonths.length,
    );
    const lowerObservedMonthlyCents = Math.min(...observed);
    const observedDifference = Math.max(averageMonthlyCents - lowerObservedMonthlyCents, 0);
    if (observedDifference <= 0) return;
    candidates.push({
      category: item.category, name: item.name, essentiality: item.essentiality,
      averageMonthlyCents, lowerObservedMonthlyCents, observedDifference,
    });
  });
  candidates.sort((a, b) => ESSENTIALITY_ORDER[a.essentiality] - ESSENTIALITY_ORDER[b.essentiality]
    || b.observedDifference - a.observedDifference || a.category.localeCompare(b.category));

  let remainingNeed = Math.max(monthlyNeedCents, 0);
  const suggestions = [];
  for (const candidate of candidates) {
    if (remainingNeed <= 0) break;
    const reduction = Math.min(candidate.observedDifference, remainingNeed);
    suggestions.push({
      category: candidate.category,
      name: candidate.name,
      essentiality: candidate.essentiality,
      averageMonthly: fromCents(candidate.averageMonthlyCents),
      lowerObservedMonthly: fromCents(candidate.lowerObservedMonthlyCents),
      suggestedMonthlyReduction: fromCents(reduction),
      conditional: candidate.essentiality === 'essenziale',
      reason: candidate.essentiality === 'essenziale'
        ? 'In un mese completo hai già speso meno; valuta se quel livello è sostenibile senza rinunciare a necessità.'
        : 'Importo basato su una riduzione già osservata nei mesi completi.',
    });
    remainingNeed -= reduction;
  }
  return { coverage: 'storico_sufficiente', suggestions };
}

function buildExpenseFundingInsights({
  payments = [], contributionsByPayment = {}, monthlyCategoryHistory = [],
  referenceDate, weeklyMarginCents = null,
}) {
  return payments
    .filter((payment) => payment.tipo === 'uscita' && payment.piano_id == null
      && ['in_attesa', 'in_ritardo'].includes(payment.stato))
    .map((payment) => {
      const amountCents = cents(payment.importo);
      const contributedCents = Math.min(cents(contributionsByPayment[payment.id]), amountCents);
      const dueDate = String(payment.data_scadenza).slice(0, 10);
      const daysRemaining = Math.max(0, Math.ceil((day(dueDate) - day(referenceDate)) / DAY_MS));
      const quota = calculateWeeklyQuota({ amountCents, contributedCents, daysUntilDue: daysRemaining });
      // Un obiettivo a 58 giorni ha circa 1,9 mesi disponibili: il suo
      // fabbisogno mensile deve riflettere quel tempo reale, non moltiplicare
      // la quota settimanale per 52/12 (che lo sottostimerebbe). Entro 30
      // giorni non suggeriamo mai di liberare più del residuo totale.
      const monthlyNeedCents = Math.min(quota.remainingCents, daysRemaining > 0
        ? Math.ceil((quota.remainingCents * 2435) / (80 * daysRemaining))
        : quota.remainingCents);
      const { coverage, suggestions } = buildSuggestions(monthlyCategoryHistory, monthlyNeedCents);
      const margin = Number.isInteger(weeklyMarginCents) && weeklyMarginCents >= 0
        ? weeklyMarginCents : null;
      const sustainability = margin === null ? 'non_stimabile'
        : quota.weeklyQuotaCents <= margin ? 'compatibile_con_margine' : 'supera_margine_stimato';
      return {
        paymentId: payment.id,
        description: payment.descrizione || null,
        accountName: payment.conto?.nome || null,
        amount: fromCents(amountCents),
        contributed: fromCents(contributedCents),
        remaining: fromCents(quota.remainingCents),
        weeklyQuota: fromCents(quota.weeklyQuotaCents),
        monthlyNeed: fromCents(monthlyNeedCents),
        suggestedMonthlyTotal: fromCents(suggestions.reduce(
          (sum, suggestion) => sum + (toCents(suggestion.suggestedMonthlyReduction) || 0), 0,
        )),
        periodsRemaining: quota.periodsRemaining,
        daysRemaining,
        dueDate,
        category: payment.categoria || null,
        status: payment.stato,
        contributions: (payment.contributions || payment.contributi || []).map((item) => ({
          id: item.id,
          amount: String(item.importo),
          date: item.data_contributo,
        })),
        coverage,
        sustainability,
        weeklyMargin: margin === null ? null : fromCents(margin),
        suggestions,
      };
    })
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.paymentId - b.paymentId);
}

module.exports = { buildExpenseFundingInsights };
