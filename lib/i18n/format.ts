import { localeMeta, type SupportedLocale } from '@/lib/i18n/config';

export function formatDate(
  value: string | number | Date,
  locale: SupportedLocale,
  options?: Intl.DateTimeFormatOptions,
) {
  const date = value instanceof Date ? value : new Date(value);
  const timeZone = options?.timeZone || localeMeta(locale).timeZone;
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', ...options, timeZone }).format(
    date,
  );
}

export function formatNumber(
  value: number,
  locale: SupportedLocale,
  options?: Intl.NumberFormatOptions,
) {
  return new Intl.NumberFormat(locale, options).format(value);
}

export function formatCurrency(
  value: number,
  locale: SupportedLocale,
  currency?: string,
  options?: Intl.NumberFormatOptions,
) {
  const resolvedCurrency = currency || localeMeta(locale).currency;
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: resolvedCurrency,
    ...options,
  }).format(value);
}
