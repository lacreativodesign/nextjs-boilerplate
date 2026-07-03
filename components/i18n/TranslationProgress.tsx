'use client';

import { useMemo } from 'react';
import { DEFAULT_LOCALE } from '@/lib/i18n/config';
import { dictionaries } from '@/lib/i18n/dictionaries';
import { flattenKeys } from '@/lib/i18n/translate';
import { useI18n } from '@/components/i18n/I18nProvider';

export default function TranslationProgress() {
  const { locale, t } = useI18n();

  const stats = useMemo(() => {
    const baseline = new Set(flattenKeys(dictionaries[DEFAULT_LOCALE]));
    const localized = new Set(flattenKeys(dictionaries[locale]));

    let translated = 0;
    let missing = 0;

    baseline.forEach((key) => {
      if (localized.has(key)) translated += 1;
      else missing += 1;
    });

    const coverage = baseline.size ? Math.round((translated / baseline.size) * 100) : 100;
    return { translated, missing, total: baseline.size, coverage };
  }, [locale]);

  return (
    <div className="hidden md:flex items-center gap-2 text-xs text-[var(--text-muted)]">
      <span>
        {t('i18n.progress')}: {stats.coverage}%
      </span>
      <span className="rounded-full bg-[var(--surface-muted)] px-2 py-0.5">
        {stats.missing === 0
          ? t('i18n.complete')
          : t('i18n.itemsRemaining', { count: stats.missing })}
      </span>
    </div>
  );
}
