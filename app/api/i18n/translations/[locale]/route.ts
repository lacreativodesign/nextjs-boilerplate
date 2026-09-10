import { NextResponse } from 'next/server';
import { normalizeLocale } from '@/lib/i18n/config';
import { getDictionary } from '@/lib/i18n/dictionaries';

export const dynamic = 'force-dynamic';

export async function GET(_: Request, props: { params: Promise<{ locale: string }> }) {
  const params = await props.params;
  const locale = normalizeLocale(params.locale);
  return NextResponse.json({
    ok: true,
    locale,
    translations: getDictionary(locale),
  });
}
