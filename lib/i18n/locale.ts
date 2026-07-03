import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE_KEY,
  LOCALE_STORAGE_KEY,
  RTL_LOCALES,
  normalizeLocale,
  type SupportedLocale,
} from '@/lib/i18n/config';

export function detectBrowserLocale(): SupportedLocale {
  if (typeof window === 'undefined') return DEFAULT_LOCALE;
  const candidates = [
    window.localStorage.getItem(LOCALE_STORAGE_KEY),
    ...window.navigator.languages,
    window.navigator.language,
  ].filter(Boolean) as string[];

  return normalizeLocale(candidates[0]);
}

export function getStoredLocale(): SupportedLocale | null {
  if (typeof window === 'undefined') return null;
  const local = window.localStorage.getItem(LOCALE_STORAGE_KEY);
  if (local) return normalizeLocale(local);

  const cookieEntry = document.cookie
    .split(';')
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith(`${LOCALE_COOKIE_KEY}=`));

  if (!cookieEntry) return null;
  const [, value] = cookieEntry.split('=');
  return normalizeLocale(decodeURIComponent(value || ''));
}

export function persistLocale(locale: SupportedLocale) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  document.cookie = `${LOCALE_COOKIE_KEY}=${encodeURIComponent(locale)}; path=/; max-age=31536000; SameSite=Lax`;
}

export function isRtlLocale(locale: SupportedLocale): boolean {
  return RTL_LOCALES.has(locale);
}
