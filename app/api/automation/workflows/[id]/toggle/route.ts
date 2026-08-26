import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { requireAutomationAdmin } from '../../../_utils';
import type { WorkflowDefinition } from '@/lib/automation/workflow-types';
import { validateWorkflowDefinition } from '@/lib/automation/workflow-validation';

export const runtime = 'nodejs';

export async function PUT(_request: Request, { params }: { params: { id: string } }) {
  const auth = await requireAutomationAdmin();
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const workflowRef = adminDb.collection('automation_workflows').doc(params.id);
  const snap = await workflowRef.get();
  if (!snap.exists || snap.data()?.tenantId !== auth.user.tenantId) {
    return NextResponse.json({ ok: false, error: 'Workflow not found.' }, { status: 404 });
  }

  const current = snap.data()?.status === 'active' ? 'active' : 'disabled';
  const next = current === 'active' ? 'disabled' : 'active';

  if (next === 'active') {
    const workflow = snap.data() as Omit<WorkflowDefinition, 'id'>;
    const validation = validateWorkflowDefinition({
      tenantId: workflow.tenantId,
      trigger: workflow.trigger,
      actions: workflow.actions,
    });
    if (!validation.ok) {
      return NextResponse.json({ ok: false, error: validation.error }, { status: 400 });
    }
  }

  await workflowRef.set(
    { status: next, updatedBy: auth.user.uid, updatedAt: new Date().toISOString() },
    { merge: true },
  );
  return NextResponse.json({ ok: true, status: next });
}
