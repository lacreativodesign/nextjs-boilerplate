import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { WORKFLOW_TEMPLATES } from '@/lib/automation/workflow-templates';
import type { WorkflowDefinition } from '@/lib/automation/workflow-types';
import { requireAutomationAdmin } from '../_utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function normalizeWorkflow(
  input: any,
  tenantId: string,
  actorUid: string,
): Omit<WorkflowDefinition, 'id'> {
  return {
    tenantId,
    name: String(input?.name || '').trim(),
    description: String(input?.description || '').trim(),
    trigger: input?.trigger,
    conditions: Array.isArray(input?.conditions) ? input.conditions : [],
    actions: Array.isArray(input?.actions) ? input.actions : [],
    status: input?.status === 'active' ? 'active' : 'disabled',
    retryLimit: Number.isFinite(Number(input?.retryLimit))
      ? Math.max(0, Math.min(5, Number(input.retryLimit)))
      : 1,
    createdBy: actorUid,
    updatedBy: actorUid,
    templateKey: input?.templateKey ? String(input.templateKey) : undefined,
  };
}

export async function GET() {
  const auth = await requireAutomationAdmin();
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const snap = await adminDb
    .collection('automation_workflows')
    .where('tenantId', '==', auth.user.tenantId)
    .orderBy('updatedAt', 'desc')
    .get();

  const workflows = snap.docs.map((doc) => ({
    id: doc.id,
    ...(doc.data() as Record<string, unknown>),
  }));
  return NextResponse.json({ ok: true, workflows, templates: Object.keys(WORKFLOW_TEMPLATES) });
}

export async function POST(request: Request) {
  const auth = await requireAutomationAdmin();
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  try {
    const body = await request.json();
    const workflow = normalizeWorkflow(body, auth.user.tenantId, auth.user.uid);

    if (!workflow.name || !workflow.trigger || workflow.actions.length === 0) {
      return NextResponse.json(
        { ok: false, error: 'Missing required workflow fields.' },
        { status: 400 },
      );
    }

    const now = new Date().toISOString();
    const ref = adminDb.collection('automation_workflows').doc();
    await ref.set({ ...workflow, createdAt: now, updatedAt: now });

    return NextResponse.json({ ok: true, id: ref.id });
  } catch (error) {
    console.error('automation/workflows POST error', error);
    return NextResponse.json({ ok: false, error: 'Unable to create workflow.' }, { status: 500 });
  }
}
