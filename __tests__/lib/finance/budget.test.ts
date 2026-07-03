import {
  calculateUtilization,
  calculateVariance,
  getBudgetPeriodDates,
} from '@/lib/finance/budget';

describe('finance/budget', () => {
  it('calculates budget variance and status', () => {
    expect(calculateVariance(1000, 900)).toEqual({
      variance: 100,
      variancePercentage: 10,
      status: 'under',
    });
    expect(calculateVariance(1000, 960)).toEqual({
      variance: 40,
      variancePercentage: 4,
      status: 'on-track',
    });
    expect(calculateVariance(1000, 1200)).toEqual({
      variance: -200,
      variancePercentage: -20,
      status: 'over',
    });
  });

  it('calculates utilization safely for zero allocated budgets', () => {
    expect(calculateUtilization(1000, 250)).toBe(25);
    expect(calculateUtilization(0, 250)).toBe(0);
  });

  it('returns correct monthly period boundaries', () => {
    const { startDate, endDate } = getBudgetPeriodDates('monthly', 2025, undefined, 2);

    expect(startDate.toISOString()).toContain('2025-02-01');
    expect(endDate.toISOString()).toContain('2025-02-28');
  });

  it('returns correct quarterly period boundaries', () => {
    const { startDate, endDate } = getBudgetPeriodDates('quarterly', 2025, 2);

    expect(startDate.toISOString()).toContain('2025-04-01');
    expect(endDate.toISOString()).toContain('2025-06-30');
  });

  it('returns correct yearly period boundaries', () => {
    const { startDate, endDate } = getBudgetPeriodDates('yearly', 2025);

    expect(startDate.toISOString()).toContain('2025-01-01');
    expect(endDate.toISOString()).toContain('2025-12-31');
  });

  it('throws for invalid period inputs', () => {
    expect(() => getBudgetPeriodDates('quarterly', 2025, 0)).toThrow('Invalid quarter');
    expect(() => getBudgetPeriodDates('monthly', 2025, undefined, 13)).toThrow('Invalid month');
  });
});
