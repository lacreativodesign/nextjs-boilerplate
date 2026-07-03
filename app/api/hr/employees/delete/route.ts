import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { createHrEvent, requireHrAccess, serverTimestamp } from '../../_utils';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const access = await requireHrAccess();
    if (!access.ok) {
      return NextResponse.json({ ok: false, error: access.error }, { status: access.status });
    }

    const body = await req.json().catch(() => ({}));
    const uid = String(body?.uid || '').trim();
    if (!uid) {
      return NextResponse.json({ ok: false, error: 'Missing user id' }, { status: 400 });
    }

    const snap = await adminDb.collection('users').doc(uid).get();
    if (!snap.exists) {
      return NextResponse.json({ ok: false, error: 'User not found' }, { status: 404 });
    }

    const existing = snap.data() || {};
    if (access.user.role !== 'super_admin' && existing?.tenantId !== access.user.tenantId) {
      return NextResponse.json({ ok: false, error: 'User not found' }, { status: 404 });
    }

    await adminDb.collection('users').doc(uid).set(
      {
        status: 'terminated',
        isDeleted: true,
        updatedAt: serverTimestamp(),
        deletedAt: serverTimestamp(),
      },
      { merge: true },
    );

    await createHrEvent({
      type: 'hr.employee_terminated',
      title: 'Employee terminated',
      description: `${String(existing.name || existing.email || uid)} marked as terminated.`,
      entityType: 'user',
      entityId: uid,
      createdByUid: access.user.uid,
      createdByName: access.user.name || access.user.email || 'Admin',
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('HR employees delete error', err);
    return NextResponse.json({ ok: false, error: 'Server error' }, { status: 500 });
  }
}
