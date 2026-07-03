import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { docTenantId } from '@/lib/tenant';
import {
  createSalesEvent,
  getWatcherUserIds,
  notifyUsers,
  parseString,
  requireSalesWrite,
  serverTimestamp,
  toISO,
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
    const id = parseString(payload.id, '');
    if (!id) {
      return NextResponse.json({ ok: false, error: 'Follow-up id is required.' }, { status: 400 });
    }

    const docRef = adminDb.collection('followUps').doc(id);
    const snapshot = await docRef.get();
    if (!snapshot.exists) {
      return NextResponse.json({ ok: false, error: 'Follow-up not found.' }, { status: 404 });
    }

    const existing = snapshot.data() || {};
    if (docTenantId(existing) !== auth.user.tenantId && auth.user.role !== 'super_admin') {
      return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });
    }
    const isOwner = existing.assignedTo === auth.user.uid || existing.createdBy === auth.user.uid;
    if (auth.user.role === 'sales' && !isOwner) {
      return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });
    }

    const status = parseString(payload.status, existing.status || 'Open');
    const dueDateRaw = parseString(payload.dueDate, '').trim();
    let dueDateIso = toISO(existing.dueDate) || '';
    if (dueDateRaw) {
      if (!dueDateRaw.includes('T')) {
        return NextResponse.json(
          { ok: false, error: 'Follow-up date and time are required.' },
          { status: 400 },
        );
      }
      const dueDateObj = new Date(dueDateRaw);
      if (Number.isNaN(dueDateObj.getTime())) {
        return NextResponse.json({ ok: false, error: 'Invalid follow-up date.' }, { status: 400 });
      }
      dueDateIso = dueDateObj.toISOString();
    }
    if (!dueDateIso) {
      return NextResponse.json(
        { ok: false, error: 'Follow-up date and time are required.' },
        { status: 400 },
      );
    }

    await docRef.set(
      {
        status,
        dueDate: dueDateIso,
        updatedAt: serverTimestamp(),
        updatedBy: auth.user.uid,
      },
      { merge: true },
    );

    await createSalesEvent({
      type: status === 'Done' ? 'follow_up_completed' : 'follow_up_updated',
      title: status === 'Done' ? 'Follow-up completed' : 'Follow-up updated',
      description: `${existing.relatedName || 'Follow-up'} marked ${status}.`,
      entityType: 'follow_up',
      entityId: id,
      createdByUid: auth.user.uid,
      createdByName: userLabel(auth.user),
    });

    const watchers = await getWatcherUserIds();
    await notifyUsers({
      userIds: [existing.assignedTo, ...watchers].filter(Boolean),
      title: status === 'Done' ? 'Follow-up completed' : 'Follow-up updated',
      body: `${existing.relatedName || 'Follow-up'} marked ${status}.`,
      deepLink: '/sales/follow-ups',
      entityType: 'follow_up',
      entityId: id,
      createdBy: { uid: auth.user.uid, name: userLabel(auth.user) },
    });

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('sales follow-ups update error:', err);
    return NextResponse.json({ ok: false, error: 'Unable to update follow-up.' }, { status: 500 });
  }
}
