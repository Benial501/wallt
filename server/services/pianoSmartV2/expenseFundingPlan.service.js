'use strict';

const { toCents, fromCents } = require('../pianoSmart/money');

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

const calculateWeeklyQuota = ({ amountCents, contributedCents, daysUntilDue }) => {
  const remainingCents = Math.max(amountCents - contributedCents, 0);
  const periodsRemaining = Math.max(1, Math.ceil(Math.max(daysUntilDue, 0) / 7));
  const weeklyQuotaCents = Math.ceil(remainingCents / periodsRemaining);
  return { remainingCents, periodsRemaining, weeklyQuotaCents };
};

const toUtcDay = (value) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value));
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (date.toISOString().slice(0, 10) !== value) return null;
  return date;
};

const buildExpenseFundingPlan = ({ payment, contributedCents, referenceDate }) => {
  const amountCents = toCents(payment?.importo);
  const dueDate = toUtcDay(payment?.data_scadenza);
  const today = toUtcDay(referenceDate);
  if (amountCents === null || !dueDate || !today) {
    throw new TypeError('Dati non validi per il piano di accantonamento');
  }

  const daysRemaining = Math.ceil((dueDate.getTime() - today.getTime()) / MILLISECONDS_PER_DAY);
  const { remainingCents, periodsRemaining, weeklyQuotaCents } = calculateWeeklyQuota({
    amountCents,
    contributedCents,
    daysUntilDue: daysRemaining,
  });

  return {
    paymentId: payment.id,
    description: payment.descrizione,
    category: payment.categoria,
    amount: fromCents(amountCents),
    contributed: fromCents(Math.max(contributedCents, 0)),
    remaining: fromCents(remainingCents),
    dueDate: payment.data_scadenza,
    daysRemaining: Math.max(daysRemaining, 0),
    periodsRemaining,
    weeklyQuota: fromCents(weeklyQuotaCents),
  };
};

module.exports = { calculateWeeklyQuota, buildExpenseFundingPlan };
