import { getBudgetPeriodDates } from '@/lib/finance/budget';

/**
 * QUAL-02 regression guard: budget period boundaries must resolve to the same
 * UTC instant regardless of the runner's timezone. Before the Date.UTC fix,
 * running under a non-UTC zone (e.g. TZ=Asia/Karachi, UTC+5) shifted the ISO
 * boundary a day earlier (2025-02-01 -> 2025-01-31T19:00:00Z).
 */
describe('finance/budget timezone-independent boundaries', () => {
  it('resolves monthly boundaries to exact UTC instants', () => {
    const { startDate, endDate } = getBudgetPeriodDates('monthly', 2025, undefined, 2);

    expect(startDate.toISOString()).toBe('2025-02-01T00:00:00.000Z');
    expect(endDate.toISOString()).toBe('2025-02-28T23:59:59.000Z');
  });

  it('resolves quarterly boundaries to exact UTC instants', () => {
    const { startDate, endDate } = getBudgetPeriodDates('quarterly', 2025, 2);

    expect(startDate.toISOString()).toBe('2025-04-01T00:00:00.000Z');
    expect(endDate.toISOString()).toBe('2025-06-30T23:59:59.000Z');
  });

  it('resolves yearly boundaries to exact UTC instants', () => {
    const { startDate, endDate } = getBudgetPeriodDates('yearly', 2025);

    expect(startDate.toISOString()).toBe('2025-01-01T00:00:00.000Z');
    expect(endDate.toISOString()).toBe('2025-12-31T23:59:59.000Z');
  });
});
