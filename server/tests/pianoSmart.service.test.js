const {
  createSmartPlan,
  SmartPlanValidationError,
} = require('../services/pianoSmart.service');

describe('Piano Smart allocation engine', () => {
  test('allocates a valid recurring income and preserves the exact total', () => {
    const plan = createSmartPlan({
      amount: 1000,
      recurring: true,
      context: { monthlyExpenses: 620, emergencyFund: 0 },
    });

    expect(plan.total).toBe(1000);
    expect(plan.allocations).toHaveLength(5);
    expect(plan.allocations.reduce((sum, item) => sum + item.amount, 0)).toBe(1000);
    expect(plan.reliability).toBe('media');
  });

  test('supports a no-history fallback without fake financial records', () => {
    const plan = createSmartPlan({ amount: 250, context: {} });

    expect(plan.isFallback).toBe(true);
    expect(plan.reliability).toBe('bassa');
    expect(plan.missingData.length).toBeGreaterThan(0);
    expect(plan.allocations.reduce((sum, item) => sum + item.amount, 0)).toBe(250);
  });

  test('protects imminent obligations before optional categories', () => {
    const plan = createSmartPlan({
      amount: 100,
      context: { imminentObligations: 180 },
    });

    expect(plan.warning).toMatch(/non è sufficiente/i);
    expect(plan.allocations.find((item) => item.key === 'necessita').amount).toBe(100);
    expect(plan.allocations.filter((item) => item.key !== 'necessita')
      .every((item) => item.amount === 0)).toBe(true);
  });

  test('rejects missing and negative amounts with typed validation errors', () => {
    expect(() => createSmartPlan({ context: {} })).toThrow(SmartPlanValidationError);
    expect(() => createSmartPlan({ amount: -1, context: {} })).toThrow(SmartPlanValidationError);
  });
});
