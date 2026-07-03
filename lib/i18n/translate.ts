import { DEFAULT_LOCALE, type SupportedLocale } from '@/lib/i18n/config';
import { getDictionary } from '@/lib/i18n/dictionaries';
import type { TranslateOptions, TranslationDictionary } from '@/lib/i18n/types';

function getValueFromPath(source: TranslationDictionary, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, segment) => {
    if (!acc || typeof acc !== 'object') return undefined;
    return (acc as Record<string, unknown>)[segment];
  }, source);
}

function interpolate(template: string, values: Record<string, string | number>) {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key: string) => String(values[key] ?? ''));
}

function choosePluralForm(value: unknown, locale: SupportedLocale, count?: number): string | null {
  if (!value || typeof value !== 'object') return null;

  const pluralMap = value as Record<string, string>;
  if (typeof count !== 'number') {
    return pluralMap.other || null;
  }

  const category = new Intl.PluralRules(locale).select(count);
  return pluralMap[category] || pluralMap.other || null;
}

export function translate(key: string, options: TranslateOptions = {}) {
  const locale = options.locale || DEFAULT_LOCALE;
  const dictionary = getDictionary(locale);
  const fallback = getDictionary(DEFAULT_LOCALE);

  const value = getValueFromPath(dictionary, key);
  let resolved: string | null = choosePluralForm(value, locale, options.count);

  if (!resolved && typeof value === 'string') {
    resolved = value;
  }

  if (!resolved) {
    const fallbackValue = getValueFromPath(fallback, key);
    resolved = choosePluralForm(fallbackValue, DEFAULT_LOCALE, options.count);
    if (!resolved && typeof fallbackValue === 'string') resolved = fallbackValue;
  }

  if (!resolved) {
    return options.defaultValue || key;
  }

  const values = {
    ...(options.values || {}),
    ...(typeof options.count === 'number' ? { count: options.count } : {}),
  };

  return interpolate(resolved, values);
}

export function flattenKeys(dictionary: TranslationDictionary, parent = ''): string[] {
  return Object.entries(dictionary).flatMap(([key, value]) => {
    const fullKey = parent ? `${parent}.${key}` : key;
    if (typeof value === 'string') return [fullKey];
    if (value && typeof value === 'object') {
      const entries = Object.values(value as Record<string, unknown>);
      const isPluralLeaf = entries.every((entry) => typeof entry === 'string');
      if (isPluralLeaf) return [fullKey];
      return flattenKeys(value as TranslationDictionary, fullKey);
    }
    return [];
  });
}
