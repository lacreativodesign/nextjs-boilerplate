import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/tenant/server';
import { checkAiPlan, aiPlanLockedBody } from '@/lib/ai/plan-gate';
import { cookies } from 'next/headers';
import { adminDb } from '@/lib/firebaseAdmin';
import { writeAuditLog } from '@/lib/tenant/audit';
import type { SalesProposedAction } from '@/lib/ai/sales-agent';

export const dynamic = 'force-dynamic';

const ALLOWED_ROLES = new Set(['admin', 'super_admin', 'sales_manager', 'sales']);
const VALID_STAGES = ['New', 'Contacted', 'Qualified', 'Proposal', 'Negotiation', 'Won', 'Lost'];

type TaskData = {
  tenantId?: string;
  proposedActions?: unknown;
};

function normalizeActions(value: unknown): SalesProposedAction[] {
  return Array.isArray(value)
    ? (value as SalesProposedAction[]).filter(
        (action) => action && typeof action === 'object' && 'id' in action && 'status' in action,
      )
    : [];
}

/**
 * S10: the agent task MUST be loaded scoped to the caller's tenant.
 *
 * This route previously read `agent_tasks/{taskId}` with no tenant check at all and
 * then wrote back to it, so a caller in tenant A could pass tenant B's taskId and
 * mutate B's proposed actions (and mark B's task completed).
 */
async function loadTenantTask(taskId: string, tenantId: string) {
  const taskSnap = await adminDb.collection('agent_tasks').doc(taskId).get();
  if (!taskSnap.exists) {
    return { error: NextResponse.json({ ok: false, error: 'Task not found' }, { status: 404 }) };
  }

  const taskData = taskSnap.data() as TaskData;
  if (taskData.tenantId !== tenantId) {
    return { error: NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 }) };
  }

  return { taskData };
}

async function resolveAction(
  taskId: string,
  actions: SalesProposedAction[],
  actionId: string,
  patch: Partial<SalesProposedAction>,
) {
  const next = actions.map((a) => (a.id === actionId ? { ...a, ...patch } : a));
  const allResolved = next.every((a) => a.status !== 'pending');
  await adminDb
    .collection('agent_tasks')
    .doc(taskId)
    .set(
      { proposedActions: next, ...(allResolved ? { status: 'completed' } : {}) },
      { merge: true },
    );
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser({ cookies: cookies() });
    if (!user || !ALLOWED_ROLES.has(user.role)) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const aiPlan = await checkAiPlan(user.tenantId!);
    if (!aiPlan.ok) {
      return NextResponse.json(aiPlanLockedBody(aiPlan), { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const { action, taskId, actionId, input } = body;

    if (!action || !taskId || !actionId) {
      return NextResponse.json(
        { ok: false, error: 'action, taskId, actionId required' },
        { status: 400 },
      );
    }

    // S10: an AI write may only execute against a proposal that the agent actually made
    // and that a human has not already resolved. This route previously took `input`
    // straight from the request body and executed the write immediately — the taskId and
    // actionId were only used AFTERWARDS, to stamp an audit trail. That meant the human
    // approval gate could be skipped entirely by calling this endpoint directly, and the
    // AI audit trail could be fabricated. Mirrors the finance-write contract.
    const taskResult = await loadTenantTask(taskId, user.tenantId!);
    if (taskResult.error) return taskResult.error;

    const currentActions = normalizeActions(taskResult.taskData?.proposedActions);
    const proposedAction = currentActions.find((a) => a.id === actionId);
    if (!proposedAction) {
      return NextResponse.json({ ok: false, error: 'Proposed action not found' }, { status: 404 });
    }
    if (proposedAction.status !== 'pending') {
      return NextResponse.json(
        { ok: false, error: `Action already ${proposedAction.status}` },
        { status: 409 },
      );
    }

    if (action === 'reject_proposed_action') {
      await resolveAction(taskId, currentActions, actionId, { status: 'rejected' });
      return NextResponse.json({ ok: true, rejected: true });
    }

    if (action === 'update_lead_status') {
      if (proposedAction.toolName !== 'update_lead_status') {
        return NextResponse.json({ ok: false, error: 'Action type mismatch' }, { status: 400 });
      }

      // The approved proposal is authoritative. The body may not substitute a different
      // lead or a different stage than the one a human reviewed.
      const proposedInput = (proposedAction.input || {}) as Record<string, unknown>;
      const leadId = String(proposedInput.leadId || '').trim();
      const stage = String(proposedInput.stage || '').trim();
      const notes = proposedInput.notes ? String(proposedInput.notes) : null;

      if (!leadId)
        return NextResponse.json({ ok: false, error: 'leadId required' }, { status: 400 });
      if (!VALID_STAGES.includes(stage)) {
        return NextResponse.json({ ok: false, error: `Invalid stage: ${stage}` }, { status: 400 });
      }

      const leadSnap = await adminDb.collection('leads').doc(leadId).get();
      if (!leadSnap.exists)
        return NextResponse.json({ ok: false, error: 'Lead not found' }, { status: 404 });

      const lead = leadSnap.data() || {};
      if (lead.tenantId !== user.tenantId) {
        return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });
      }

      const previousStage = lead.stage || 'New';

      await adminDb
        .collection('leads')
        .doc(leadId)
        .set(
          {
            stage,
            updatedAt: new Date().toISOString(),
            ...(notes ? { aiNotes: notes } : {}),
          },
          { merge: true },
        );

      await writeAuditLog({
        tenantId: user.tenantId,
        actorUserId: user.uid,
        actorName: user.fullName || user.email,
        actorRole: user.role,
        actionType: 'ai.sales.update_lead_status',
        entityType: 'lead',
        entityId: leadId,
        metadata: {
          taskId,
          actionId,
          previousStage,
          newStage: stage,
          notes,
          leadName: lead.name || '',
        },
      });

      await resolveAction(taskId, currentActions, actionId, {
        status: 'executed',
        executedAt: new Date().toISOString(),
      });

      return NextResponse.json({ ok: true, updated: true, leadId, stage });
    }

    return NextResponse.json({ ok: false, error: `Unknown action: ${action}` }, { status: 400 });
  } catch (err: any) {
    console.error('[SALES_WRITE]', err);
    return NextResponse.json({ ok: false, error: err?.message || 'Server error' }, { status: 500 });
  }
}
