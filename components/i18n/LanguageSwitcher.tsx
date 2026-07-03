'use client';

import { SUPPORTED_LOCALES, type SupportedLocale } from '@/lib/i18n/config';
import { useI18n } from '@/components/i18n/I18nProvider';

export default function LanguageSwitcher() {
  const { locale, setLocale } = useI18n();

  return (
    <select
      value={locale}
      onChange={(event) => setLocale(event.target.value as SupportedLocale)}
      className="rounded-md border border-[var(--border-subtle)] bg-[var(--surface-card)] px-2 py-1 text-sm text-[var(--text-primary)] cursor-pointer"
      aria-label="Language"
      title="Select language"
    >
      {SUPPORTED_LOCALES.map((item) => (
        <option key={item.code} value={item.code}>
          {item.flag}
        </option>
      ))}
    </select>
  );
}
