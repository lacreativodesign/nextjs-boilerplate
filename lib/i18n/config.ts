export type SupportedLocale = "en-US" | "es-ES" | "fr-FR" | "de-DE" | "ar-SA";

export const DEFAULT_LOCALE: SupportedLocale = "en-US";

export const SUPPORTED_LOCALES: Array<{
  code: SupportedLocale;
  language: string;
  nativeName: string;
  flag: string;
  rtl: boolean;
  currency: string;
  timeZone: string;
}> = [
  { code: "en-US", language: "English", nativeName: "English", flag: "🇺🇸", rtl: false, currency: "USD", timeZone: "America/New_York" },
  { code: "es-ES", language: "Spanish", nativeName: "Español", flag: "🇪🇸", rtl: false, currency: "EUR", timeZone: "Europe/Madrid" },
  { code: "fr-FR", language: "French", nativeName: "Français", flag: "🇫🇷", rtl: false, currency: "EUR", timeZone: "Europe/Paris" },
  { code: "de-DE", language: "German", nativeName: "Deutsch", flag: "🇩🇪", rtl: false, currency: "EUR", timeZone: "Europe/Berlin" },
  { code: "ar-SA", language: "Arabic", nativeName: "العربية", flag: "🇸🇦", rtl: true, currency: "SAR", timeZone: "Asia/Riyadh" },
];

export const RTL_LOCALES = new Set<SupportedLocale>(["ar-SA"]);

export const LOCALE_COOKIE_KEY = "bizosto_locale";
export const LOCALE_STORAGE_KEY = "bizosto.locale";

export function isSupportedLocale(input: string | null | undefined): input is SupportedLocale {
  if (!input) return false;
  return SUPPORTED_LOCALES.some((locale) => locale.code.toLowerCase() === input.toLowerCase());
}

export function normalizeLocale(input: string | null | undefined): SupportedLocale {
  if (!input) return DEFAULT_LOCALE;

  const exact = SUPPORTED_LOCALES.find((locale) => locale.code.toLowerCase() === input.toLowerCase());
  if (exact) return exact.code;

  const prefix = input.split("-")[0]?.toLowerCase();
  if (!prefix) return DEFAULT_LOCALE;

  const byPrefix = SUPPORTED_LOCALES.find((locale) => locale.code.toLowerCase().startsWith(`${prefix}-`));
  return byPrefix?.code || DEFAULT_LOCALE;
}

export function localeMeta(locale: SupportedLocale) {
  return SUPPORTED_LOCALES.find((item) => item.code === locale) || SUPPORTED_LOCALES[0];
}
