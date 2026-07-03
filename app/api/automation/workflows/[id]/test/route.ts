import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { WorkflowEngine } from '@/lib/automation/workflow-engine';
import type { WorkflowDefinition } from '@/lib/automation/workflow-types';
import { requireAutomationAdmin } from '../../../_utils';

export const runtime = 'nodejs';

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const auth = await requireAutomationAdmin();
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  try {
    const body = await request.json();
    const snap = await adminDb.collection('automation_workflows').doc(params.id).get();
    if (!snap.exists || snap.data()?.tenantId !== auth.user.tenantId) {
      return NextResponse.json({ ok: false, error: 'Workflow not found.' }, { status: 404 });
    }

    const workflow = {
      id: snap.id,
      ...(snap.data() as Record<string, unknown>),
    } as WorkflowDefinition;
    const engine = new WorkflowEngine();
    const result = await engine.execute(workflow, {
      tenantId: auth.user.tenantId,
      workflowId: workflow.id,
      actorUid: auth.user.uid,
      triggerSource: 'test',
      record: body?.record || {},
      previousRecord: body?.previousRecord || {},
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error('automation/workflows/[id]/test POST error', error);
    return NextResponse.json({ ok: false, error: 'Workflow test run failed.' }, { status: 500 });
  }
}
