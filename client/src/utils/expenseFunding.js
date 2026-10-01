export function createContributionPayload(paymentId, rawAmount, date, remainingAmount) {
  const normalized = String(rawAmount ?? '').trim().replace(',', '.');
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return null;
  const amountCents = Math.round(Number(normalized) * 100);
  const remainingCents = Math.round(Number(remainingAmount) * 100);
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0
    || !Number.isSafeInteger(remainingCents) || remainingCents < 0
    || amountCents > remainingCents
    || !/^\d{4}-\d{2}-\d{2}$/.test(String(date))) return null;
  return { paymentId, amount: (amountCents / 100).toFixed(2), date };
}
