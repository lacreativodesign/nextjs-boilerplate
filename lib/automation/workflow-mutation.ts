import { adminDb } from '@/lib/firebaseAdmin';
import { normalizeTenantId } from '@/lib/tenant';
import { writeAuditLog } from '@/lib/tenant/audit';
import type { WorkflowAction, WorkflowDefinition } from './workflow-types';
import { isWorkflowFieldAllowed, sanitizeWorkflowCreatePayload } from './workflow-validation';

type MutationInput =
  | {
      action: Extract<WorkflowAction, { type: 'create_record' }>;
      tenantId: string;
      workflowId: string;
      runId: string;
      payload: Record<string, unknown>;
    }
  | {
      action: Extract<WorkflowAction, { type: 'update_field' }>;
      tenantId: string;
      workflowId: string;
      runId: string;
      recordId: string;
      value: unknown;
    };

async function requireStoredAction(input: MutationInput) {
  const [runSnap, workflowSnap] = await Promise.all([
    adminDb.collection('automation_workflow_runs').doc(input.runId).get(),
    adminDb.collection('automation_workflows').doc(input.workflowId).get(),
  ]);
  if (!runSnap.exists || !workflowSnap.exists) throw new Error('Workflow binding not found.');

  const run = runSnap.data() || {};
  const workflow = workflowSnap.data() as WorkflowDefinition;
  const tenantId = normalizeTenantId(input.tenantId);
  if (
    normalizeTenantId(run.tenantId) !== tenantId ||
    normalizeTenantId(workflow.tenantId) !== tenantId ||
    String(run.workflowId || '') !== input.workflowId ||
    String(run.status || '') !== 'running'
  ) {
    throw new Error('Workflow run binding mismatch.');
  }

  const storedAction = (workflow.actions || []).find(
    (candidate) => candidate.id === input.action.id,
  );
  if (!storedAction || storedAction.type !== input.action.type) {
    throw new Error('Workflow action binding mismatch.');
  }
  if ('entity' in storedAction && storedAction.entity !== input.action.entity) {
    throw new Error('Workflow entity binding mismatch.');
  }
  if (
    storedAction.type === 'update_field' &&
    input.action.type === 'update_field' &&
    storedAction.field !== input.action.field
  ) {
    throw new Error('Workflow field binding mismatch.');
  }

  return { run, storedAction };
}

export async function executeWorkflowMutation(input: MutationInput) {
  const { run } = await requireStoredAction(input);
  const tenantId = normalizeTenantId(input.tenantId);

  if ('payload' in input) {
    const payload = sanitizeWorkflowCreatePayload(input.action.entity, input.payload);
    const ref = adminDb.collection(input.action.entity).doc();
    await ref.set({
      ...payload,
      tenantId,
      createdByWorkflow: input.workflowId,
      createdByWorkflowRun: input.runId,
      createdAt: new Date().toISOString(),
    });
    await writeAuditLog({
      tenantId,
      actorUserId: null,
      actorName: `workflow:${input.workflowId}`,
      actorRole: 'automation',
      actionType: 'workflow.create_record',
      entityType: input.action.entity,
      entityId: ref.id,
      metadata: { workflowId: input.workflowId, runId: input.runId, actionId: input.action.id },
    });
    return { id: ref.id };
  }

  if (!isWorkflowFieldAllowed(input.action.entity, input.action.field)) {
    throw new Error('Workflow field is not permitted.');
  }
  if (!input.recordId || String(run.recordId || '') !== input.recordId) {
    throw new Error('Workflow target record binding mismatch.');
  }

  const ref = adminDb.collection(input.action.entity).doc(input.recordId);
  const snap = await ref.get();
  if (!snap.exists) throw new Error('Workflow target not found.');
  if (normalizeTenantId(snap.data()?.tenantId) !== tenantId) {
    throw new Error('Workflow tenant isolation violation.');
  }
  await ref.set(
    { [input.action.field]: input.value, updatedAt: new Date().toISOString() },
    { merge: true },
  );
  await writeAuditLog({
    tenantId,
    actorUserId: null,
    actorName: `workflow:${input.workflowId}`,
    actorRole: 'automation',
    actionType: 'workflow.update_field',
    entityType: input.action.entity,
    entityId: input.recordId,
    metadata: {
      workflowId: input.workflowId,
      runId: input.runId,
      actionId: input.action.id,
      field: input.action.field,
    },
  });
  return {};
}
