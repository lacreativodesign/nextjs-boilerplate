"use client";

import { SUPPORTED_LOCALES, type SupportedLocale } from "@/lib/i18n/config";
import { useI18n } from "@/components/i18n/I18nProvider";

export default function LanguageSwitcher() {
  const { locale, setLocale, t } = useI18n();

  return (
    <label className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
      <span>{t("common.language")}</span>
      <select
        value={locale}
        onChange={(event) => setLocale(event.target.value as SupportedLocale)}
        className="rounded-md border border-[var(--border-subtle)] bg-[var(--surface-card)] px-2 py-1 text-xs text-[var(--text-primary)]"
        aria-label={t("common.language")}
      >
        {SUPPORTED_LOCALES.map((item) => (
          <option key={item.code} value={item.code}>
            {item.flag} {item.nativeName}
          </option>
        ))}
      </select>
    </label>
  );
}
