const caricaServizio = () => {
  try {
    return require('../services/pianoSmartV2/expenseFundingPlan.service');
  } catch {
    return {};
  }
};

describe('piano di accantonamento per una spesa programmata', () => {
  test('divide 180 euro in otto quote settimanali arrotondando al centesimo superiore', () => {
    const { calculateWeeklyQuota } = caricaServizio();
    expect(typeof calculateWeeklyQuota).toBe('function');
    if (typeof calculateWeeklyQuota !== 'function') return;

    expect(calculateWeeklyQuota({ amountCents: 18000, contributedCents: 0, daysUntilDue: 56 }))
      .toEqual({ remainingCents: 18000, periodsRemaining: 8, weeklyQuotaCents: 2250 });
  });

  test('aumenta la quota se passa una settimana senza accantonamenti', () => {
    const { calculateWeeklyQuota } = caricaServizio();
    expect(typeof calculateWeeklyQuota).toBe('function');
    if (typeof calculateWeeklyQuota !== 'function') return;

    expect(calculateWeeklyQuota({ amountCents: 18000, contributedCents: 0, daysUntilDue: 49 }))
      .toEqual({ remainingCents: 18000, periodsRemaining: 7, weeklyQuotaCents: 2572 });
  });

  test('richiede tutto il residuo quando resta una sola settimana', () => {
    const { calculateWeeklyQuota } = caricaServizio();
    expect(typeof calculateWeeklyQuota).toBe('function');
    if (typeof calculateWeeklyQuota !== 'function') return;

    expect(calculateWeeklyQuota({ amountCents: 18000, contributedCents: 2500, daysUntilDue: 7 }))
      .toEqual({ remainingCents: 15500, periodsRemaining: 1, weeklyQuotaCents: 15500 });
  });

  test('mostra quota zero quando gli accantonamenti coprono la spesa', () => {
    const { calculateWeeklyQuota } = caricaServizio();
    expect(typeof calculateWeeklyQuota).toBe('function');
    if (typeof calculateWeeklyQuota !== 'function') return;

    expect(calculateWeeklyQuota({ amountCents: 18000, contributedCents: 18000, daysUntilDue: 28 }))
      .toEqual({ remainingCents: 0, periodsRemaining: 4, weeklyQuotaCents: 0 });
  });

  test('non produce residui o quote negative se il totale accantonato eccede la spesa', () => {
    const { calculateWeeklyQuota } = caricaServizio();
    expect(typeof calculateWeeklyQuota).toBe('function');
    if (typeof calculateWeeklyQuota !== 'function') return;

    expect(calculateWeeklyQuota({ amountCents: 18000, contributedCents: 19000, daysUntilDue: 0 }))
      .toEqual({ remainingCents: 0, periodsRemaining: 1, weeklyQuotaCents: 0 });
  });

  test('serializza importo e quota per la scadenza del 28 novembre e ricalcola i periodi', () => {
    const { buildExpenseFundingPlan } = caricaServizio();
    expect(typeof buildExpenseFundingPlan).toBe('function');
    if (typeof buildExpenseFundingPlan !== 'function') return;

    const plan = buildExpenseFundingPlan({
      payment: {
        id: 17,
        importo: '180.00',
        descrizione: 'Spesa futura',
        categoria: 'casa',
        data_scadenza: '2026-11-28',
      },
      contributedCents: 0,
      referenceDate: '2026-10-01',
    });

    expect(plan).toMatchObject({
      paymentId: 17,
      amount: '180.00',
      contributed: '0.00',
      remaining: '180.00',
      dueDate: '2026-11-28',
      daysRemaining: 58,
      periodsRemaining: 9,
      weeklyQuota: '20.00',
    });
  });
});
