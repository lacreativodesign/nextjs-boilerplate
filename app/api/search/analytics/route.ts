import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser, isAdminOrSuper } from '@/app/api/admin/_utils';
import { getSearchAnalytics } from '@/lib/search/advanced-search';

export const runtime = 'nodejs';

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

export async function GET(request: NextRequest) {
  try {
    const session = await getCurrentUser();
    if (!session?.tenantId || !session.uid) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!isAdminOrSuper(session.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const parsed = querySchema.safeParse(
      Object.fromEntries(request.nextUrl.searchParams.entries()),
    );
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const analytics = await getSearchAnalytics({
      tenantId: session.tenantId,
      limit: parsed.data.limit,
    });

    return NextResponse.json({ analytics });
  } catch (error) {
    console.error('Search analytics error', error);
    return NextResponse.json({ error: 'Failed to load search analytics' }, { status: 500 });
  }
}
