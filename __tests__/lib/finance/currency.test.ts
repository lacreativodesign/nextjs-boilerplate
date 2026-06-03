import { AppError } from '@/lib/errors';
import { CurrencyConverter } from '@/lib/currency/currencyConverter';

describe('CurrencyConverter', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it('fetches and stores rates from API', async () => {
    const converter = new CurrencyConverter();
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ rates: { USD: 1, EUR: 0.9, GBP: 0.8 } }),
    } as Response);

    await converter.fetchRates();

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(converter.getRate('USD', 'EUR')).toBe(0.9);
    expect(converter.needsUpdate()).toBe(false);
  });

  it('throws when fetchRates API request fails', async () => {
    const converter = new CurrencyConverter();
    jest.spyOn(global, 'fetch').mockResolvedValue({ ok: false } as Response);

    await expect(converter.fetchRates()).rejects.toThrow('Failed to fetch exchange rates');
  });

  it('converts amounts with precision and returns same-currency unchanged', async () => {
    const converter = new CurrencyConverter();
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ rates: { USD: 1, EUR: 0.8, JPY: 150 } }),
    } as Response);

    await converter.fetchRates();

    expect(converter.convert(100, 'USD', 'EUR')).toBe(80);
    expect(converter.convert(100, 'USD', 'USD')).toBe(100);
    expect(converter.convert(100, 'EUR', 'JPY')).toBe(18750);
  });

  it('throws for missing rates in convert/getRate', async () => {
    const converter = new CurrencyConverter();
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ rates: { USD: 1 } }),
    } as Response);

    await converter.fetchRates();

    expect(() => converter.convert(100, 'USD', 'EUR')).toThrow('Exchange rate not available');
    expect(() => converter.getRate('USD', 'EUR')).toThrow('Exchange rate not available');
  });

  it('formats amount with known and unknown currency symbols', () => {
    const converter = new CurrencyConverter();

    expect(converter.formatAmount(200.5, 'EUR')).toBe('€200.50');
    expect(converter.formatAmount(200.5, 'XYZ')).toBe('XYZ200.50');
  });

  it('identifies stale cache via needsUpdate', () => {
    const converter = new CurrencyConverter();

    expect(converter.needsUpdate()).toBe(true);
  });
});

describe('finance/exchangeRates', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.restoreAllMocks();
    process.env.EXCHANGE_RATE_API_KEY = 'test-key';
  });

  it('returns cached exchange rates when cache is fresh', async () => {
    const getMock = jest.fn().mockResolvedValue({
      exists: true,
      data: () => ({ rates: { EUR: 0.91 }, timestamp: Date.now() }),
    });
    const setMock = jest.fn();

    jest.doMock('@/lib/firebaseAdmin', () => ({
      adminDb: {
        collection: () => ({ doc: () => ({ get: getMock, set: setMock }) }),
      },
    }));

    const fetchSpy = jest.spyOn(global, 'fetch');
    const { getExchangeRates } = await import('@/lib/finance/exchangeRates');

    const rates = await getExchangeRates('USD');

    expect(rates).toEqual({ EUR: 0.91 });
    expect(setMock).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('fetches and persists exchange rates when cache is stale', async () => {
    const getMock = jest
      .fn()
      .mockResolvedValueOnce({
        exists: true,
        data: () => ({ rates: { EUR: 0.8 }, timestamp: Date.now() - 2 * 60 * 60 * 1000 }),
      })
      .mockResolvedValueOnce({ exists: true, data: () => ({ rates: { EUR: 0.93 } }) });
    const setMock = jest.fn().mockResolvedValue(undefined);

    jest.doMock('@/lib/firebaseAdmin', () => ({
      adminDb: {
        collection: () => ({ doc: () => ({ get: getMock, set: setMock }) }),
      },
    }));

    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ result: 'success', conversion_rates: { EUR: 0.93 } }),
    } as Response);

    const { getExchangeRates } = await import('@/lib/finance/exchangeRates');

    const rates = await getExchangeRates('USD');

    expect(rates).toEqual({ EUR: 0.93 });
    expect(setMock).toHaveBeenCalledTimes(1);
  });

  it('throws AppError when requested exchange rate is unavailable', async () => {
    const getMock = jest.fn().mockResolvedValue({
      exists: true,
      data: () => ({ rates: { EUR: 0.9 }, timestamp: Date.now() }),
    });

    jest.doMock('@/lib/firebaseAdmin', () => ({
      adminDb: {
        collection: () => ({ doc: () => ({ get: getMock, set: jest.fn() }) }),
      },
    }));

    const { getExchangeRate } = await import('@/lib/finance/exchangeRates');

    await expect(getExchangeRate('USD', 'JPY')).rejects.toMatchObject({
      code: 'NOT_FOUND',
      status: 404,
    });
  });
});
