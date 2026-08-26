import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { requireAutomationAdmin } from '../../_utils';
import type { WorkflowDefinition } from '@/lib/automation/workflow-types';
import { validateWorkflowDefinition } from '@/lib/automation/workflow-validation';

export const runtime = 'nodejs';

export async function PUT(request: Request, { params }: { params: { id: string } }) {
  const auth = await requireAutomationAdmin();
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  try {
    const body = await request.json();
    const workflowRef = adminDb.collection('automation_workflows').doc(params.id);
    const snap = await workflowRef.get();
    if (!snap.exists || snap.data()?.tenantId !== auth.user.tenantId) {
      return NextResponse.json({ ok: false, error: 'Workflow not found.' }, { status: 404 });
    }

    const current = snap.data() as WorkflowDefinition;
    const next: WorkflowDefinition = {
      ...current,
      id: params.id,
      tenantId: auth.user.tenantId,
      name: body?.name === undefined ? current.name : String(body.name || '').trim(),
      description:
        body?.description === undefined ? current.description : String(body.description || ''),
      trigger: body?.trigger === undefined ? current.trigger : body.trigger,
      conditions: body?.conditions === undefined ? current.conditions : body.conditions,
      actions: body?.actions === undefined ? current.actions : body.actions,
      status:
        body?.status === undefined
          ? current.status
          : body.status === 'active'
            ? 'active'
            : 'disabled',
      retryLimit:
        body?.retryLimit === undefined
          ? current.retryLimit
          : Math.max(0, Math.min(5, Number(body.retryLimit) || 0)),
      updatedAt: new Date().toISOString(),
      updatedBy: auth.user.uid,
    };
    if (!next.name || !Array.isArray(next.conditions) || !Array.isArray(next.actions)) {
      return NextResponse.json(
        { ok: false, error: 'Invalid workflow definition.' },
        { status: 400 },
      );
    }
    const validation = validateWorkflowDefinition(next);
    if (!validation.ok) {
      return NextResponse.json({ ok: false, error: validation.error }, { status: 400 });
    }

    await workflowRef.set(next, { merge: true });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('automation/workflows/[id] PUT error', error);
    return NextResponse.json({ ok: false, error: 'Unable to update workflow.' }, { status: 500 });
  }
}
