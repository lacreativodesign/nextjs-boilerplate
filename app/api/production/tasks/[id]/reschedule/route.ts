import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { adminDb } from '@/lib/firebaseAdmin';
import { getCurrentUser } from '@/app/api/admin/_utils';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const schema = z.object({
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
});

const DAY_MS = 24 * 60 * 60 * 1000;

function asIso(value: any): string | null {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value?.toDate === 'function') return value.toDate().toISOString();
  return null;
}

function addDays(iso: string, days: number) {
  const d = new Date(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString();
}

function dayDelta(fromIso: string, toIso: string) {
  return Math.round((new Date(toIso).getTime() - new Date(fromIso).getTime()) / DAY_MS);
}

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const me = await getCurrentUser();
    if (!me?.tenantId)
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

    const validated = schema.safeParse(await request.json());
    if (!validated.success) {
      return NextResponse.json(
        { ok: false, error: 'Invalid reschedule payload.', details: validated.error.flatten() },
        { status: 400 },
      );
    }

    const taskDoc = await adminDb.collection('tasks').doc(params.id).get();
    if (!taskDoc.exists)
      return NextResponse.json({ ok: false, error: 'Task not found.' }, { status: 404 });

    const task = taskDoc.data() as any;
    if (task.tenantId !== me.tenantId)
      return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });

    const originalStart =
      asIso(task.startDate) || asIso(task.createdAt) || new Date().toISOString();
    const deltaDays = dayDelta(originalStart, validated.data.startDate);

    const depsSnap = await adminDb
      .collection('taskDependencies')
      .where('tenantId', '==', me.tenantId)
      .where('projectId', '==', task.projectId)
      .get();

    const deps = depsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as any[];
    const downstream = new Map<string, any[]>();
    for (const dep of deps) {
      if (!downstream.has(dep.predecessorTaskId)) downstream.set(dep.predecessorTaskId, []);
      downstream.get(dep.predecessorTaskId)!.push(dep);
    }

    const queue = [params.id];
    const visited = new Set<string>();
    const updates = new Map<string, { startDate: string; dueDate: string }>();
    updates.set(params.id, {
      startDate: validated.data.startDate,
      dueDate: validated.data.endDate,
    });

    while (queue.length) {
      const currentTaskId = queue.shift()!;
      if (visited.has(currentTaskId)) continue;
      visited.add(currentTaskId);

      const outgoing = downstream.get(currentTaskId) || [];
      for (const dep of outgoing) {
        const successorRef = adminDb.collection('tasks').doc(dep.successorTaskId);
        const successorDoc = await successorRef.get();
        if (!successorDoc.exists) continue;
        const successor = successorDoc.data() as any;
        if (successor.tenantId !== me.tenantId) continue;

        const predecessorUpdate = updates.get(currentTaskId);
        if (!predecessorUpdate) continue;

        const succStart =
          asIso(successor.startDate) || asIso(successor.createdAt) || predecessorUpdate.startDate;
        const succEnd = asIso(successor.dueDate) || succStart;
        const durationDays = Math.max(
          1,
          Math.round((new Date(succEnd).getTime() - new Date(succStart).getTime()) / DAY_MS),
        );
        const lag = Number(dep.lagDays || 0);

        let nextStart = succStart;
        let nextEnd = succEnd;
        if (dep.type === 'finish_to_start') {
          nextStart = addDays(predecessorUpdate.dueDate, lag);
          nextEnd = addDays(nextStart, durationDays);
        } else if (dep.type === 'start_to_start') {
          nextStart = addDays(predecessorUpdate.startDate, lag);
          nextEnd = addDays(nextStart, durationDays);
        } else if (dep.type === 'finish_to_finish') {
          nextEnd = addDays(predecessorUpdate.dueDate, lag);
          nextStart = addDays(nextEnd, -durationDays);
        } else {
          nextStart = addDays(succStart, deltaDays);
          nextEnd = addDays(succEnd, deltaDays);
        }

        const existing = updates.get(dep.successorTaskId);
        if (!existing || new Date(nextStart).getTime() > new Date(existing.startDate).getTime()) {
          updates.set(dep.successorTaskId, { startDate: nextStart, dueDate: nextEnd });
        }

        queue.push(dep.successorTaskId);
      }
    }

    const batch = adminDb.batch();
    const updatedAt = new Date().toISOString();
    for (const [taskId, schedule] of updates.entries()) {
      const ref = adminDb.collection('tasks').doc(taskId);
      batch.update(ref, {
        startDate: schedule.startDate,
        dueDate: schedule.dueDate,
        updatedAt,
        updatedBy: me.uid,
      });
    }

    await batch.commit();

    return NextResponse.json({ ok: true, updatedTaskIds: Array.from(updates.keys()) });
  } catch (error) {
    console.error('PUT /api/production/tasks/[id]/reschedule', error);
    return NextResponse.json({ ok: false, error: 'Unable to reschedule task.' }, { status: 500 });
  }
}
