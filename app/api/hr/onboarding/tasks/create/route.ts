import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { createHrEvent, requireHrAccess, serverTimestamp } from '../../../_utils';
import { createNotification } from '@/lib/notifications';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const access = await requireHrAccess();
    if (!access.ok) {
      return NextResponse.json({ ok: false, error: access.error }, { status: access.status });
    }

    const body = await req.json().catch(() => ({}));
    const userId = String(body?.userId || '').trim();
    const templateId = String(body?.templateId || '').trim();
    const steps = Array.isArray(body?.steps) ? body.steps : [];
    const dueDate = body?.dueDate ? new Date(String(body.dueDate)) : null;

    if (!userId) {
      return NextResponse.json({ ok: false, error: 'Missing userId' }, { status: 400 });
    }

    const payload = {
      userId,
      templateId: templateId || null,
      steps: steps.map((step: any) => ({
        title: String(step?.title || '').trim(),
        description: String(step?.description || '').trim(),
        required: Boolean(step?.required),
        isDone: false,
        doneAt: null,
      })),
      status: 'Not Started',
      dueDate: dueDate || null,
      tenantId: access.user.tenantId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      createdBy: access.user.uid,
    };

    const ref = await adminDb.collection('onboardingTasks').add(payload);

    await createHrEvent({
      type: 'hr.onboarding_task_created',
      title: 'Onboarding task created',
      description: `Onboarding task created for user ${userId}.`,
      entityType: 'onboardingTask',
      entityId: ref.id,
      createdByUid: access.user.uid,
      createdByName: access.user.name || access.user.email || 'Admin',
      metadata: { userId },
    });

    if (userId && userId !== access.user.uid) {
      await createNotification({
        toUserId: userId,
        tenantId: access.user.tenantId,
        type: 'info',
        title: 'Onboarding tasks assigned',
        message: 'Onboarding tasks were assigned to you.',
        entityType: 'hr',
        entityId: ref.id,
        deepLink: '/hr/onboarding',
      });
    }

    return NextResponse.json({ ok: true, id: ref.id });
  } catch (err) {
    console.error('HR onboarding tasks create error', err);
    return NextResponse.json({ ok: false, error: 'Server error' }, { status: 500 });
  }
}
