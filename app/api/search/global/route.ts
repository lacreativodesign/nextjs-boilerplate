import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/app/api/admin/_utils';
import { globalSearch, saveRecentSearch, trackSearchAnalytics } from '@/lib/search/global-search';

export const runtime = 'nodejs';

const querySchema = z.object({
  q: z.string().trim().min(1),
  module: z.string().optional(),
  status: z.string().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  limit: z.coerce.number().min(1).max(100).optional(),
  saveRecent: z.coerce.boolean().optional(),
});

export async function GET(request: NextRequest) {
  try {
    const session = await getCurrentUser();
    if (!session?.tenantId || !session.uid) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const parsed = querySchema.safeParse(
      Object.fromEntries(request.nextUrl.searchParams.entries()),
    );
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const { q, module, status, dateFrom, dateTo, limit, saveRecent } = parsed.data;
    const results = await globalSearch({
      tenantId: session.tenantId,
      role: session.role,
      query: q,
      filters: {
        module: module as never,
        status,
        dateFrom,
        dateTo,
      },
      limit,
    });

    await trackSearchAnalytics({
      tenantId: session.tenantId,
      uid: session.uid,
      query: q,
      totalResults: results.length,
    });

    if (saveRecent !== false) {
      await saveRecentSearch({
        tenantId: session.tenantId,
        uid: session.uid,
        query: q,
        filters: { module: module as never, status, dateFrom, dateTo },
      });
    }

    return NextResponse.json({ results, total: results.length });
  } catch (error) {
    console.error('Global search error', error);
    return NextResponse.json({ error: 'Search failed' }, { status: 500 });
  }
}
