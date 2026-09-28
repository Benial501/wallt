/** Calcola un piano a rate usando centesimi interi, con arrotondamento
 * commerciale e ultima rata corretta per chiudere il debito. */
export function calculateInstallmentPlan({ purchaseAmount, initialPayment = 0, paymentCount, annualRate = 0 }) {
  const toCents = (value) => {
    const match = /^(\d{1,10})(?:\.(\d{1,2}))?$/.exec(String(value));
    if (!match) return null;
    return Number(match[1]) * 100 + Number((match[2] || '').padEnd(2, '0') || 0);
  };
  const purchaseCents = toCents(purchaseAmount);
  const initialCents = toCents(initialPayment);
  const count = Number(paymentCount);
  const annual = Number(annualRate);
  const money = (cents) => (cents / 100).toFixed(2);
  if (!Number.isSafeInteger(purchaseCents) || purchaseCents <= 0
    || !Number.isSafeInteger(initialCents) || initialCents < 0 || initialCents > purchaseCents
    || !Number.isInteger(count) || count < 1 || !Number.isFinite(annual) || annual < 0) {
    return null;
  }
  const countFuture = initialCents > 0 ? count - 1 : count;
  if (countFuture < 0 || (countFuture === 0 && purchaseCents !== initialCents)) return null;
  const capitalCents = purchaseCents - initialCents;
  if (!countFuture) return {
    payments: [], initialPayment: money(initialCents), totalRepayment: money(initialCents), interestTotal: '0.00',
  };
  const monthlyRate = annual / 1200;
  const constantPayment = Math.round(monthlyRate === 0
    ? capitalCents / countFuture
    : capitalCents * monthlyRate / (1 - ((1 + monthlyRate) ** -countFuture)));
  let balance = capitalCents;
  let totalFuture = 0;
  const payments = [];
  for (let index = 0; index < countFuture; index += 1) {
    const interest = monthlyRate === 0 ? 0 : Math.round(balance * monthlyRate);
    const payment = index === countFuture - 1 ? balance + interest : Math.min(constantPayment, balance + interest);
    if (payment <= 0) return null;
    balance = Math.max(0, balance + interest - payment);
    totalFuture += payment;
    payments.push(money(payment));
  }
  const total = initialCents + totalFuture;
  return { payments, initialPayment: money(initialCents), totalRepayment: money(total), interestTotal: money(Math.max(0, total - purchaseCents)) };
}
