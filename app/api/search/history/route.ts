import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/app/api/admin/_utils';
import { getSearchHistory } from '@/lib/search/advanced-search';

export const runtime = 'nodejs';

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
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

    const history = await getSearchHistory({
      tenantId: session.tenantId,
      uid: session.uid,
      limit: parsed.data.limit,
    });

    return NextResponse.json({ history });
  } catch (error) {
    console.error('Search history error', error);
    return NextResponse.json({ error: 'Failed to load search history' }, { status: 500 });
  }
}
