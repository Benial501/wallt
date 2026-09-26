import { importoInCentesimi } from './pianoSmart.js';

export const purchaseAmountCents = (value) => {
  const input = String(value ?? '').trim();
  if (!/^\d{1,10}(?:[.,]\d{1,2})?$/.test(input)) return null;
  const amount = importoInCentesimi(input);
  return amount > 0 ? amount : null;
};

// Simulazione locale di una spesa AGGIUNTIVA: sottrae soltanto l'importo
// dai risultati del server; non ricostruisce il contesto finanziario.
export const simulatePurchase = (situation, value) => {
  const amount = purchaseAmountCents(value);
  if (amount === null || !situation) return null;
  const available = importoInCentesimi(situation.current.availableToSpend);
  const daily = importoInCentesimi(situation.current.dailyLimit);
  const forecast = importoInCentesimi(situation.forecast.endOfMonthAvailable);
  const shortfall = importoInCentesimi(situation.current.shortfall) ?? 0;
  if (available === null) return null;
  const availableAfter = available - shortfall - amount;
  const dailyAfter = daily === null ? null : Math.floor(Math.max(availableAfter, 0) / Math.max(situation.current.remainingDays, 1));
  const forecastAfter = forecast === null ? null : forecast - amount;
  const status = availableAfter < 0 || (forecastAfter !== null && forecastAfter < 0) ? 'rischio'
    : forecastAfter === null || daily === null ? 'non_stimabile'
      : amount <= daily ? 'compatibile' : 'attenzione';
  const share = available > 0 ? amount / available : Infinity;
  return { amount, availableAfter, dailyAfter, forecastAfter, status,
    impact: share <= 0.2 ? 'Basso' : share <= 0.45 ? 'Moderato' : 'Alto' };
};
