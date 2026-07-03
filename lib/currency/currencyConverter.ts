export interface Currency {
  code: string;
  name: string;
  symbol: string;
}

export const SUPPORTED_CURRENCIES: Currency[] = [
  { code: 'USD', name: 'US Dollar', symbol: '$' },
  { code: 'EUR', name: 'Euro', symbol: '€' },
  { code: 'GBP', name: 'British Pound', symbol: '£' },
  { code: 'JPY', name: 'Japanese Yen', symbol: '¥' },
  { code: 'CAD', name: 'Canadian Dollar', symbol: 'CA$' },
  { code: 'AUD', name: 'Australian Dollar', symbol: 'A$' },
  { code: 'CHF', name: 'Swiss Franc', symbol: 'CHF' },
  { code: 'CNY', name: 'Chinese Yuan', symbol: '¥' },
  { code: 'INR', name: 'Indian Rupee', symbol: '₹' },
  { code: 'MXN', name: 'Mexican Peso', symbol: 'MX$' },
  { code: 'BRL', name: 'Brazilian Real', symbol: 'R$' },
  { code: 'ZAR', name: 'South African Rand', symbol: 'R' },
  { code: 'SGD', name: 'Singapore Dollar', symbol: 'S$' },
  { code: 'HKD', name: 'Hong Kong Dollar', symbol: 'HK$' },
  { code: 'SEK', name: 'Swedish Krona', symbol: 'kr' },
  { code: 'NOK', name: 'Norwegian Krone', symbol: 'kr' },
  { code: 'DKK', name: 'Danish Krone', symbol: 'kr' },
  { code: 'NZD', name: 'New Zealand Dollar', symbol: 'NZ$' },
  { code: 'KRW', name: 'South Korean Won', symbol: '₩' },
  { code: 'TRY', name: 'Turkish Lira', symbol: '₺' },
];

export class CurrencyConverter {
  private rates: Map<string, number> = new Map([['USD', 1]]);
  private baseCurrency = 'USD';
  private lastUpdated: Date | null = null;

  async fetchRates(): Promise<void> {
    const response = await fetch(
      `https://api.exchangerate-api.com/v4/latest/${this.baseCurrency}`,
      {
        cache: 'no-store',
      },
    );

    if (!response.ok) {
      throw new Error('Failed to fetch exchange rates');
    }

    const data = (await response.json()) as { rates?: Record<string, number> };
    const rates = data?.rates || {};

    Object.entries(rates).forEach(([currency, rate]) => {
      this.rates.set(currency, Number(rate));
    });

    this.lastUpdated = new Date();
  }

  convert(amount: number, fromCurrency: string, toCurrency: string): number {
    if (fromCurrency === toCurrency) return Number(amount.toFixed(2));

    const fromRate = this.rates.get(fromCurrency);
    const toRate = this.rates.get(toCurrency);

    if (!fromRate || !toRate) {
      throw new Error(`Exchange rate not available for ${fromCurrency} or ${toCurrency}`);
    }

    const inBaseCurrency = amount / fromRate;
    const converted = inBaseCurrency * toRate;
    return Number(converted.toFixed(2));
  }

  getRate(fromCurrency: string, toCurrency: string): number {
    if (fromCurrency === toCurrency) return 1;

    const fromRate = this.rates.get(fromCurrency);
    const toRate = this.rates.get(toCurrency);

    if (!fromRate || !toRate) {
      throw new Error('Exchange rate not available');
    }

    return Number((toRate / fromRate).toFixed(6));
  }

  formatAmount(amount: number, currencyCode: string): string {
    const currency = SUPPORTED_CURRENCIES.find((item) => item.code === currencyCode);
    return `${currency?.symbol || currencyCode}${amount.toFixed(2)}`;
  }

  needsUpdate(): boolean {
    if (!this.lastUpdated) return true;
    const hoursSinceUpdate = (Date.now() - this.lastUpdated.getTime()) / (1000 * 60 * 60);
    return hoursSinceUpdate > 24;
  }
}

export const currencyConverter = new CurrencyConverter();
