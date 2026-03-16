import { SUPPORTED_CURRENCIES } from '@/lib/finance/currencies';

describe('lib/finance/currencies', () => {
  describe('SUPPORTED_CURRENCIES', () => {
    it('includes USD with correct properties', () => {
      expect(SUPPORTED_CURRENCIES.USD.code).toBe('USD');
      expect(SUPPORTED_CURRENCIES.USD.symbol).toBe('$');
      expect(SUPPORTED_CURRENCIES.USD.decimals).toBe(2);
    });

    it('includes EUR', () => {
      expect(SUPPORTED_CURRENCIES.EUR.code).toBe('EUR');
      expect(SUPPORTED_CURRENCIES.EUR.symbol).toBe('€');
    });

    it('includes GBP', () => {
      expect(SUPPORTED_CURRENCIES.GBP.code).toBe('GBP');
      expect(SUPPORTED_CURRENCIES.GBP.symbol).toBe('£');
    });

    it('includes JPY with 0 decimals', () => {
      expect(SUPPORTED_CURRENCIES.JPY.decimals).toBe(0);
    });

    it('includes AED', () => {
      expect(SUPPORTED_CURRENCIES.AED.code).toBe('AED');
    });

    it('has at least 15 currencies', () => {
      expect(Object.keys(SUPPORTED_CURRENCIES).length).toBeGreaterThanOrEqual(15);
    });
  });
});
