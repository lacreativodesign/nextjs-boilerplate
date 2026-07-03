import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '../../admin/_utils';
import { listOnlineUsers, upsertPresence } from '@/lib/activity/activity-service';

export const runtime = 'nodejs';

export async function GET() {
  const me = await getCurrentUser();
  if (!me) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const users = await listOnlineUsers(me.tenantId);
  return NextResponse.json({ ok: true, users });
}

export async function POST(request: NextRequest) {
  const me = await getCurrentUser();
  if (!me) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as { online?: boolean } | null;
  await upsertPresence({
    tenantId: me.tenantId,
    uid: me.uid,
    name: me.displayName || me.email || 'Unknown',
    email: me.email || null,
    role: me.role || null,
    online: body?.online !== false,
  });

  return NextResponse.json({ ok: true });
}
