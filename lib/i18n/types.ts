import type { SupportedLocale } from '@/lib/i18n/config';

export type TranslationLeaf = string | Record<string, string>;
export type TranslationTree = {
  [key: string]: TranslationLeaf | TranslationTree;
};

export type TranslationDictionary = TranslationTree;

export type TranslateOptions = {
  locale?: SupportedLocale;
  values?: Record<string, string | number>;
  count?: number;
  defaultValue?: string;
};
