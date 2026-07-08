import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '../../admin/_utils';
import { getActivityFeed } from '@/lib/activity/activity-service';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const me = await getCurrentUser();
  if (!me) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const limit = Math.min(100, Math.max(1, Number(searchParams.get('limit') || '30')));

  try {
    const payload = await getActivityFeed({
      tenantId: me.tenantId,
      limit,
      cursor: searchParams.get('cursor') || undefined,
      module: searchParams.get('module') || undefined,
      userId: searchParams.get('userId') || undefined,
      from: searchParams.get('from') || undefined,
      to: searchParams.get('to') || undefined,
    });

    return NextResponse.json({ ok: true, ...payload });
  } catch (error) {
    // Firestore FAILED_PRECONDITION here means a composite index is missing;
    // the server log carries the exact index-creation link. Surfacing a real
    // error (instead of the previous silent client no-op) makes that visible.
    console.error('[ACTIVITY] feed query failed', error);
    return NextResponse.json(
      { ok: false, error: 'Unable to load activity feed.' },
      { status: 500 },
    );
  }
}
