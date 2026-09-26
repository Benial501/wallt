import { importoInCentesimi } from './pianoSmart.js';

export const purchaseAmountCents = (value) => {
  const input = String(value ?? '').trim();
  if (!/^\d{1,10}(?:[.,]\d{1,2})?$/.test(input)) return null;
  const amount = importoInCentesimi(input);
  return amount > 0 ? amount : null;
};
