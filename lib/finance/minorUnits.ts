const ZERO_DECIMAL_CURRENCIES = new Set(['JPY']);

export function normalizeCurrencyCode(currency: unknown): string {
  return String(currency || 'USD')
    .trim()
    .toUpperCase();
}

export function currencyFractionDigits(currency: unknown): number {
  return ZERO_DECIMAL_CURRENCIES.has(normalizeCurrencyCode(currency)) ? 0 : 2;
}

export function roundCurrencyAmount(value: number, currency: unknown): number {
  const safe = Number.isFinite(value) ? value : 0;
  const digits = currencyFractionDigits(currency);
  return Number(safe.toFixed(digits));
}

export function amountToMinorUnits(amount: number, currency: unknown): number {
  const digits = currencyFractionDigits(currency);
  const factor = 10 ** digits;
  return Math.round((Number.isFinite(amount) ? amount : 0) * factor);
}

export function minorUnitsToAmount(amountMinor: number, currency: unknown): number {
  const digits = currencyFractionDigits(currency);
  const factor = 10 ** digits;
  return roundCurrencyAmount((Number.isFinite(amountMinor) ? amountMinor : 0) / factor, currency);
}
