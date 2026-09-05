import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { createHrEvent, normalizeRole, requireHrAccess, serverTimestamp } from '../../_utils';
import { syncFirebaseUserAccessState } from '@/lib/auth/user-access-state';

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

    if (uid === access.user.uid) {
      return NextResponse.json(
        { ok: false, error: 'You cannot terminate your own account.' },
        { status: 409 },
      );
    }

    const snap = await adminDb.collection('users').doc(uid).get();
    if (!snap.exists) {
      return NextResponse.json({ ok: false, error: 'User not found' }, { status: 404 });
    }

    const existing = snap.data() || {};
    const requesterRole = normalizeRole(access.user.role);
    const targetRole = normalizeRole(existing?.role || '');
    if (requesterRole !== 'super_admin' && existing?.tenantId !== access.user.tenantId) {
      return NextResponse.json({ ok: false, error: 'User not found' }, { status: 404 });
    }

    if (requesterRole !== 'super_admin' && targetRole === 'super_admin') {
      return NextResponse.json(
        { ok: false, error: 'Only a Super Admin can terminate a Super Admin account.' },
        { status: 403 },
      );
    }

    if (requesterRole === 'hr' && targetRole === 'admin') {
      return NextResponse.json(
        { ok: false, error: 'HR cannot terminate an Admin account.' },
        { status: 403 },
      );
    }

    // Disable Firebase first. If the Firestore write fails afterwards, access remains
    // fail-closed rather than leaving a terminated application record with a live Auth
    // identity and valid refresh tokens.
    await syncFirebaseUserAccessState({
      uid,
      status: 'terminated',
      isActive: false,
      isDeleted: true,
    });

    await adminDb.collection('users').doc(uid).set(
      {
        status: 'terminated',
        isActive: false,
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
      tenantId: String(existing.tenantId || access.user.tenantId || ''),
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('HR employees delete error', err);
    return NextResponse.json({ ok: false, error: 'Server error' }, { status: 500 });
  }
}
