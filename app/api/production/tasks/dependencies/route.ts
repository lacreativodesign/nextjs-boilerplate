import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { adminDb } from '@/lib/firebaseAdmin';
import { getCurrentUser } from '@/app/api/admin/_utils';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const schema = z.object({
  projectId: z.string().min(1),
  predecessorTaskId: z.string().min(1),
  successorTaskId: z.string().min(1),
  type: z.enum(['finish_to_start', 'start_to_start', 'finish_to_finish']),
  lagDays: z.number().int().min(-30).max(60).default(0),
});

export async function POST(request: NextRequest) {
  try {
    const me = await getCurrentUser();
    if (!me?.tenantId) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const payload = schema.safeParse(await request.json());
    if (!payload.success) {
      return NextResponse.json(
        { ok: false, error: 'Invalid dependency payload.', details: payload.error.flatten() },
        { status: 400 },
      );
    }

    const { projectId, predecessorTaskId, successorTaskId, type, lagDays } = payload.data;
    if (predecessorTaskId === successorTaskId) {
      return NextResponse.json(
        { ok: false, error: 'Task cannot depend on itself.' },
        { status: 400 },
      );
    }

    const [projectDoc, predecessorDoc, successorDoc] = await Promise.all([
      adminDb.collection('projects').doc(projectId).get(),
      adminDb.collection('tasks').doc(predecessorTaskId).get(),
      adminDb.collection('tasks').doc(successorTaskId).get(),
    ]);

    if (!projectDoc.exists)
      return NextResponse.json({ ok: false, error: 'Project not found.' }, { status: 404 });
    if (!predecessorDoc.exists || !successorDoc.exists) {
      return NextResponse.json({ ok: false, error: 'Task not found.' }, { status: 404 });
    }

    const project = projectDoc.data() as { tenantId?: string };
    const predecessor = predecessorDoc.data() as { tenantId?: string; projectId?: string };
    const successor = successorDoc.data() as { tenantId?: string; projectId?: string };

    if (
      project.tenantId !== me.tenantId ||
      predecessor.tenantId !== me.tenantId ||
      successor.tenantId !== me.tenantId ||
      predecessor.projectId !== projectId ||
      successor.projectId !== projectId
    ) {
      return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });
    }

    const now = new Date().toISOString();
    const existing = await adminDb
      .collection('taskDependencies')
      .where('tenantId', '==', me.tenantId)
      .where('projectId', '==', projectId)
      .where('predecessorTaskId', '==', predecessorTaskId)
      .where('successorTaskId', '==', successorTaskId)
      .limit(1)
      .get();

    if (!existing.empty) {
      const ref = existing.docs[0].ref;
      await ref.update({ type, lagDays, updatedAt: now, updatedBy: me.uid });
      return NextResponse.json({ ok: true, id: ref.id, updated: true });
    }

    const created = await adminDb.collection('taskDependencies').add({
      tenantId: me.tenantId,
      projectId,
      predecessorTaskId,
      successorTaskId,
      type,
      lagDays,
      createdAt: now,
      updatedAt: now,
      createdBy: me.uid,
      updatedBy: me.uid,
    });

    return NextResponse.json({ ok: true, id: created.id, updated: false });
  } catch (error) {
    console.error('POST /api/production/tasks/dependencies', error);
    return NextResponse.json({ ok: false, error: 'Unable to create dependency.' }, { status: 500 });
  }
}
