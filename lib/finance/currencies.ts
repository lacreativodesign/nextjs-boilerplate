export const SUPPORTED_CURRENCIES = {
  USD: { code: 'USD', symbol: '$', name: 'US Dollar', decimals: 2 },
  EUR: { code: 'EUR', symbol: '€', name: 'Euro', decimals: 2 },
  GBP: { code: 'GBP', symbol: '£', name: 'British Pound', decimals: 2 },
  CAD: { code: 'CAD', symbol: 'C$', name: 'Canadian Dollar', decimals: 2 },
  AUD: { code: 'AUD', symbol: 'A$', name: 'Australian Dollar', decimals: 2 },
  JPY: { code: 'JPY', symbol: '¥', name: 'Japanese Yen', decimals: 0 },
  CNY: { code: 'CNY', symbol: '¥', name: 'Chinese Yuan', decimals: 2 },
  INR: { code: 'INR', symbol: '₹', name: 'Indian Rupee', decimals: 2 },
  SGD: { code: 'SGD', symbol: 'S$', name: 'Singapore Dollar', decimals: 2 },
  HKD: { code: 'HKD', symbol: 'HK$', name: 'Hong Kong Dollar', decimals: 2 },
  NZD: { code: 'NZD', symbol: 'NZ$', name: 'New Zealand Dollar', decimals: 2 },
  SEK: { code: 'SEK', symbol: 'kr', name: 'Swedish Krona', decimals: 2 },
  NOK: { code: 'NOK', symbol: 'kr', name: 'Norwegian Krone', decimals: 2 },
  DKK: { code: 'DKK', symbol: 'kr', name: 'Danish Krone', decimals: 2 },
  CHF: { code: 'CHF', symbol: 'CHF', name: 'Swiss Franc', decimals: 2 },
  MXN: { code: 'MXN', symbol: '$', name: 'Mexican Peso', decimals: 2 },
  BRL: { code: 'BRL', symbol: 'R$', name: 'Brazilian Real', decimals: 2 },
  ZAR: { code: 'ZAR', symbol: 'R', name: 'South African Rand', decimals: 2 },
  AED: { code: 'AED', symbol: 'د.إ', name: 'UAE Dirham', decimals: 2 },
  SAR: { code: 'SAR', symbol: 'ر.س', name: 'Saudi Riyal', decimals: 2 },
} as const;

export type CurrencyCode = keyof typeof SUPPORTED_CURRENCIES;

export interface Currency {
  code: CurrencyCode;
  symbol: string;
  name: string;
  decimals: number;
}

export interface ExchangeRate {
  base: CurrencyCode;
  target: CurrencyCode;
  rate: number;
  timestamp: Date;
  source: string;
}

export function getCurrency(code: CurrencyCode): Currency {
  return SUPPORTED_CURRENCIES[code];
}

export function getAllCurrencies(): Currency[] {
  return Object.values(SUPPORTED_CURRENCIES);
}

export function formatCurrency(amount: number, currency: CurrencyCode): string {
  const curr = getCurrency(currency);
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: curr.code,
    minimumFractionDigits: curr.decimals,
    maximumFractionDigits: curr.decimals,
  }).format(amount);
}
