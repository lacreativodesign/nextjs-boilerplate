import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import {
  createSalesEvent,
  getWatcherUserIds,
  notifyUsers,
  parseString,
  requireSalesWrite,
  serverTimestamp,
  userLabel,
} from '../../_utils';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const auth = await requireSalesWrite();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const payload = await req.json();
    const name = parseString(payload.name, '');
    const channel = parseString(payload.channel, '');
    const status = parseString(payload.status, 'Active');

    const docRef = await adminDb.collection('campaigns').add({
      tenantId: auth.user.tenantId || null,
      name,
      channel,
      status,
      metrics: payload.metrics || null,
      isDeleted: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      createdBy: auth.user.uid,
      updatedBy: auth.user.uid,
    });

    await createSalesEvent({
      type: 'campaign_created',
      title: 'Campaign created',
      description: `${name || 'Campaign'} created`,
      entityType: 'campaign',
      entityId: docRef.id,
      createdByUid: auth.user.uid,
      createdByName: userLabel(auth.user),
    });

    const watchers = await getWatcherUserIds(auth.user.tenantId ?? null);
    await notifyUsers({
      userIds: watchers,
      title: 'Campaign created',
      body: `${name || 'Campaign'} started in Sales.`,
      deepLink: '/sales/campaigns',
      entityType: 'campaign',
      entityId: docRef.id,
      createdBy: { uid: auth.user.uid, name: userLabel(auth.user) },
    });

    return NextResponse.json({ ok: true, id: docRef.id });
  } catch (err: any) {
    console.error('sales campaigns create error:', err);
    return NextResponse.json({ ok: false, error: 'Unable to create campaign.' }, { status: 500 });
  }
}
