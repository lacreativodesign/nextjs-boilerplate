import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/app/api/admin/_utils';
import { createNotification } from '@/app/lib/notifications';
import { normalizeTenantId } from '@/lib/tenant';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    const me = await getCurrentUser();
    if (!me) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await createNotification({
      recipientUid: me.uid,
      tenantId: normalizeTenantId(me.tenantId),
      type: 'info',
      title: 'Test notification',
      body: 'This is a test notification based on your current channel and digest preferences.',
      metadata: {
        source: 'notification-preferences-test',
      },
      deepLink: '/dashboard/notifications',
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to send test notification', error);
    return NextResponse.json({ error: 'Failed to send test notification' }, { status: 500 });
  }
}
