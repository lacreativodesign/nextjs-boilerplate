import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { createHrEvent, requireHrAccess, serverTimestamp } from '../../../_utils';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const access = await requireHrAccess();
    if (!access.ok) {
      return NextResponse.json({ ok: false, error: access.error }, { status: access.status });
    }

    const body = await req.json().catch(() => ({}));
    const id = String(body?.id || '').trim();
    if (!id) {
      return NextResponse.json({ ok: false, error: 'Missing task id' }, { status: 400 });
    }

    const snap = await adminDb.collection('onboardingTasks').doc(id).get();
    if (!snap.exists) {
      return NextResponse.json({ ok: false, error: 'Task not found' }, { status: 404 });
    }

    const existing = snap.data() || {};
    if (access.user.role !== 'super_admin' && existing?.tenantId !== access.user.tenantId) {
      return NextResponse.json({ ok: false, error: 'Task not found' }, { status: 404 });
    }

    await adminDb.collection('onboardingTasks').doc(id).set(
      {
        isDeleted: true,
        updatedAt: serverTimestamp(),
        deletedAt: serverTimestamp(),
      },
      { merge: true },
    );

    await createHrEvent({
      type: 'hr.onboarding_task_deleted',
      title: 'Onboarding task deleted',
      description: `Onboarding task deleted for user ${String(existing.userId || 'unknown')}.`,
      entityType: 'onboardingTask',
      entityId: id,
      createdByUid: access.user.uid,
      createdByName: access.user.name || access.user.email || 'Admin',
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('HR onboarding tasks delete error', err);
    return NextResponse.json({ ok: false, error: 'Server error' }, { status: 500 });
  }
}
