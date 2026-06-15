"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { DEFAULT_LOCALE, SUPPORTED_LOCALES, type SupportedLocale } from "@/lib/i18n/config";
import { detectBrowserLocale, getStoredLocale, isRtlLocale, persistLocale } from "@/lib/i18n/locale";
import { formatCurrency, formatDate, formatNumber } from "@/lib/i18n/format";
import { translate } from "@/lib/i18n/translate";
import { apiFetch } from "@/lib/api/client";

type I18nContextValue = {
  locale: SupportedLocale;
  direction: "ltr" | "rtl";
  setLocale: (locale: SupportedLocale) => Promise<void>;
  t: (key: string, options?: { values?: Record<string, string | number>; count?: number; defaultValue?: string }) => string;
  formatDate: (value: string | number | Date, options?: Intl.DateTimeFormatOptions) => string;
  formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string;
  formatCurrency: (value: number, currency?: string, options?: Intl.NumberFormatOptions) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children, userId, userLocale }: { children: ReactNode; userId?: string; userLocale?: string | null }) {
  const [locale, setLocaleState] = useState<SupportedLocale>(DEFAULT_LOCALE);

  useEffect(() => {
    const resolved = userLocale
      ? (userLocale as SupportedLocale)
      : getStoredLocale() || detectBrowserLocale() || DEFAULT_LOCALE;

    const normalized = SUPPORTED_LOCALES.some((item) => item.code === resolved) ? resolved : DEFAULT_LOCALE;
    setLocaleState(normalized);
    persistLocale(normalized);
  }, [userLocale]);

  useEffect(() => {
    const rtl = isRtlLocale(locale);
    document.documentElement.lang = locale;
    document.documentElement.dir = rtl ? "rtl" : "ltr";
  }, [locale]);

  const setLocale = useCallback(
    async (nextLocale: SupportedLocale) => {
      setLocaleState(nextLocale);
      persistLocale(nextLocale);

      if (!userId) return;

      await apiFetch(`/api/users/${encodeURIComponent(userId)}/locale`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale: nextLocale }),
      });
    },
    [userId],
  );

  const value = useMemo<I18nContextValue>(
    () => ({
      locale,
      direction: isRtlLocale(locale) ? "rtl" : "ltr",
      setLocale,
      t: (key, options) => translate(key, { locale, ...options }),
      formatDate: (value, options) => formatDate(value, locale, options),
      formatNumber: (value, options) => formatNumber(value, locale, options),
      formatCurrency: (value, currency, options) => formatCurrency(value, locale, currency, options),
    }),
    [locale, setLocale],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error("useI18n must be used within I18nProvider");
  }
  return context;
}
