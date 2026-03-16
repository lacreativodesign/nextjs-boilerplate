import { calculateNextGenerationDate } from '@/lib/finance/recurring';

describe('lib/finance/recurring', () => {
  describe('calculateNextGenerationDate', () => {
    const base = new Date('2025-01-15T00:00:00.000Z');

    it('adds 1 month for monthly frequency', () => {
      const result = calculateNextGenerationDate(base, 'monthly', 1);
      expect(result.getMonth()).toBe(1);
      expect(result.getFullYear()).toBe(2025);
    });

    it('adds 2 months for monthly frequency with interval 2', () => {
      const result = calculateNextGenerationDate(base, 'monthly', 2);
      expect(result.getMonth()).toBe(2);
    });

    it('adds 1 year for yearly frequency', () => {
      const result = calculateNextGenerationDate(base, 'yearly', 1);
      expect(result.getFullYear()).toBe(2026);
    });

    it('adds 7 days for weekly frequency', () => {
      const result = calculateNextGenerationDate(base, 'weekly', 1);
      const diff = result.getTime() - base.getTime();
      const days = diff / (1000 * 60 * 60 * 24);
      expect(days).toBe(7);
    });

    it('adds 1 day for daily frequency', () => {
      const result = calculateNextGenerationDate(base, 'daily', 1);
      const diff = result.getTime() - base.getTime();
      const days = diff / (1000 * 60 * 60 * 24);
      expect(days).toBe(1);
    });

    it('adds 3 months for quarterly frequency', () => {
      const result = calculateNextGenerationDate(base, 'quarterly', 1);
      expect(result.getMonth()).toBe(3);
    });

    it('returns a Date object', () => {
      const result = calculateNextGenerationDate(base, 'monthly', 1);
      expect(result).toBeInstanceOf(Date);
    });

    it('does not mutate the input date', () => {
      const input = new Date('2025-06-01T00:00:00.000Z');
      const original = input.getTime();
      calculateNextGenerationDate(input, 'monthly', 1);
      expect(input.getTime()).toBe(original);
    });
  });
});
