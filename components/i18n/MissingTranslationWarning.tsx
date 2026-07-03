'use client';

import { useMemo } from 'react';
import { DEFAULT_LOCALE } from '@/lib/i18n/config';
import { dictionaries } from '@/lib/i18n/dictionaries';
import { flattenKeys } from '@/lib/i18n/translate';
import { useI18n } from '@/components/i18n/I18nProvider';

export default function MissingTranslationWarning() {
  const { locale, t } = useI18n();

  const missingCount = useMemo(() => {
    const baseline = new Set(flattenKeys(dictionaries[DEFAULT_LOCALE]));
    const localized = new Set(flattenKeys(dictionaries[locale]));

    let missing = 0;
    baseline.forEach((key) => {
      if (!localized.has(key)) missing += 1;
    });

    return missing;
  }, [locale]);

  if (process.env.NODE_ENV === 'production' || missingCount === 0) {
    return null;
  }

  return (
    <div className="rounded-md border border-amber-400/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700">
      {t('i18n.missing')}: {t('i18n.itemsRemaining', { count: missingCount })}
    </div>
  );
}
