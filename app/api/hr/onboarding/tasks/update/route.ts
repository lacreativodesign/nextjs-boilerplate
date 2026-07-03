import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import {
  createHrEvent,
  createHrNotification,
  getRouteForRole,
  requireHrAccess,
  serverTimestamp,
} from '../../../_utils';
import { getUserIdsByRoles } from '@/lib/notifications';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const access = await requireHrAccess();
    if (!access.ok) {
      return NextResponse.json({ ok: false, error: access.error }, { status: access.status });
    }

    const body = await req.json().catch(() => ({}));
    const taskId = String(body?.taskId || '').trim();
    if (!taskId) {
      return NextResponse.json({ ok: false, error: 'Missing task id' }, { status: 400 });
    }

    const snap = await adminDb.collection('onboardingTasks').doc(taskId).get();
    if (!snap.exists) {
      return NextResponse.json({ ok: false, error: 'Task not found' }, { status: 404 });
    }

    const existing = snap.data() || {};
    if (access.user.role !== 'super_admin' && existing?.tenantId !== access.user.tenantId) {
      return NextResponse.json({ ok: false, error: 'Task not found' }, { status: 404 });
    }
    const incomingSteps = Array.isArray(body?.steps) ? body.steps : existing?.steps || [];
    const updatedSteps = incomingSteps.map((step: any) => ({
      title: String(step?.title || '').trim(),
      description: String(step?.description || '').trim(),
      required: Boolean(step?.required),
      isDone: Boolean(step?.isDone),
      doneAt: step?.isDone ? step?.doneAt || new Date().toISOString() : null,
    }));

    const allDone = updatedSteps.length > 0 && updatedSteps.every((step: any) => step.isDone);
    const requestedStatus = String(body?.status || existing?.status || 'Not Started');
    const status = allDone ? 'Completed' : requestedStatus;

    await adminDb.collection('onboardingTasks').doc(taskId).update({
      steps: updatedSteps,
      status,
      updatedAt: serverTimestamp(),
    });

    if (status === 'Completed' && existing?.status !== 'Completed') {
      await createHrEvent({
        type: 'hr.onboarding_completed',
        title: 'Onboarding completed',
        description: 'Onboarding checklist completed.',
        entityType: 'onboardingTask',
        entityId: taskId,
        createdByUid: access.user.uid,
        createdByName: access.user.name || access.user.email || 'Admin',
        metadata: { userId: existing?.userId || null },
      });

      const [employeeSnap, hrIds, adminIds] = await Promise.all([
        existing?.userId
          ? adminDb.collection('users').doc(existing.userId).get()
          : Promise.resolve(null),
        getUserIdsByRoles(['hr']),
        getUserIdsByRoles(['admin', 'super_admin']),
      ]);

      const employeeData = employeeSnap?.data() || {};
      const employeeRole = String(employeeData?.role || '');
      const employeeRoute = employeeRole ? getRouteForRole(employeeRole) : '/';

      const hrRecipients = new Set<string>([...hrIds, ...adminIds]);
      await Promise.all(
        Array.from(hrRecipients).map((uid) => {
          const deepLink = adminIds.includes(uid) ? '/admin/hr/onboarding' : '/hr/onboarding';
          return createHrNotification({
            userId: uid,
            title: 'Onboarding completed',
            message: 'An onboarding checklist has been completed.',
            type: 'hr.onboarding_completed',
            entityId: taskId,
            deepLink,
            createdBy: {
              uid: access.user.uid,
              name: access.user.name || access.user.email || 'Admin',
            },
          });
        }),
      );

      if (existing?.userId) {
        await createHrNotification({
          userId: existing.userId,
          title: 'Onboarding completed',
          message: 'Your onboarding checklist is now complete.',
          type: 'hr.onboarding_completed',
          entityId: taskId,
          deepLink: employeeRoute,
          createdBy: {
            uid: access.user.uid,
            name: access.user.name || access.user.email || 'Admin',
          },
        });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('HR onboarding tasks update error', err);
    return NextResponse.json({ ok: false, error: 'Server error' }, { status: 500 });
  }
}
