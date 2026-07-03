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
}
