const { buildExpenseFundingInsights } = require('../services/pianoSmartV2/expenseFundingInsights.service');

const history = (category, essentiality, amounts) => amounts.map((amountCents, index) => ({
  month: `2026-0${index + 5}`,
  complete: true,
  categories: [{ category, name: category, essentiality, amountCents }],
}));

describe('suggerimenti per le spese future del Piano Smart', () => {
  const payments = [{
    id: 17, importo: '180.00', categoria: 'casa', descrizione: 'Spesa futura', tipo: 'uscita',
    data_scadenza: '2026-11-28', stato: 'in_attesa', piano_id: null,
  }];

  it('ordina i suggerimenti per essenzialità e propone importi osservati in euro, senza percentuali', () => {
    const plans = buildExpenseFundingInsights({
      payments,
      contributionsByPayment: {},
      monthlyCategoryHistory: [
        ...history('ristoranti', 'discrezionale', [18000, 12000, 15000]),
        ...history('vestiti', 'semi_essenziale', [9000, 8000, 9000]),
        ...history('affitto', 'essenziale', [70000, 68000, 70000]),
      ],
      referenceDate: '2026-10-01',
      weeklyMarginCents: 50000,
    });
    expect(plans[0].suggestions.map((suggestion) => suggestion.category)).toEqual([
      'ristoranti', 'vestiti', 'affitto',
    ]);
    expect(plans[0].suggestions[0]).toMatchObject({
      averageMonthly: '150.00', lowerObservedMonthly: '120.00', suggestedMonthlyReduction: '30.00',
    });
    expect(plans[0].monthlyNeed).toBe('94.47');
    expect(plans[0].suggestions[2].conditional).toBe(true);
    expect(JSON.stringify(plans)).not.toMatch(/percent/i);
  });

  it('non inventa importi con meno di tre mesi completi o categorie non classificate', () => {
    const plans = buildExpenseFundingInsights({
      payments,
      contributionsByPayment: {},
      monthlyCategoryHistory: [
        ...history('mystery', 'non_classificata', [10000, 9000]),
        ...history('ristoranti', 'discrezionale', [15000, 12000]),
      ],
      referenceDate: '2026-10-01',
      weeklyMarginCents: null,
    });
    expect(plans[0].suggestions).toEqual([]);
    expect(plans[0].coverage).toBe('storico_insufficiente');
    expect(plans[0].sustainability).toBe('non_stimabile');
  });

  it('usa i contributi per ridurre residuo e quota senza cambiare gli input storici', () => {
    const plans = buildExpenseFundingInsights({
      payments,
      contributionsByPayment: { 17: 3000 },
      monthlyCategoryHistory: history('ristoranti', 'discrezionale', [18000, 12000, 15000]),
      referenceDate: '2026-10-01',
      weeklyMarginCents: 50000,
    });
    expect(plans[0]).toMatchObject({ contributed: '30.00', remaining: '150.00', weeklyQuota: '16.67' });
    expect(plans[0].monthlyNeed).toBe('78.72');
  });
});
