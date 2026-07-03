import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/app/api/admin/_utils';
import { getRecentSearches } from '@/lib/search/global-search';

export const runtime = 'nodejs';

const querySchema = z.object({
  limit: z.coerce.number().min(1).max(20).optional(),
});

export async function GET(request: Request) {
  try {
    const session = await getCurrentUser();
    if (!session?.tenantId || !session.uid) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const url = new URL(request.url);
    const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams.entries()));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const recents = await getRecentSearches({
      tenantId: session.tenantId,
      uid: session.uid,
      limit: parsed.data.limit,
    });

    return NextResponse.json({ results: recents });
  } catch (error) {
    console.error('Recent searches error', error);
    return NextResponse.json({ error: 'Failed to load recent searches' }, { status: 500 });
  }
}
