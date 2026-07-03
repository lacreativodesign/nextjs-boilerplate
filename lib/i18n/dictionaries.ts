import type { TranslationDictionary } from '@/lib/i18n/types';
import { DEFAULT_LOCALE, type SupportedLocale } from '@/lib/i18n/config';

import enUS from '@/lib/i18n/messages/en-US.json';
import esES from '@/lib/i18n/messages/es-ES.json';
import frFR from '@/lib/i18n/messages/fr-FR.json';
import deDE from '@/lib/i18n/messages/de-DE.json';
import arSA from '@/lib/i18n/messages/ar-SA.json';

export const dictionaries: Record<SupportedLocale, TranslationDictionary> = {
  'en-US': enUS,
  'es-ES': esES,
  'fr-FR': frFR,
  'de-DE': deDE,
  'ar-SA': arSA,
};

export function getDictionary(locale: SupportedLocale): TranslationDictionary {
  return dictionaries[locale] || dictionaries[DEFAULT_LOCALE];
}
