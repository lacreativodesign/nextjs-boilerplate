import { adminDb } from '@/lib/firebaseAdmin';
import type {
  ApprovalStep,
  WorkflowAction,
  WorkflowCondition,
  WorkflowDefinition,
  WorkflowExecutionContext,
  WorkflowRunLog,
  WorkflowRunStatus,
} from './workflow-types';
import { executeWorkflowMutation } from './workflow-mutation';
import { validateWorkflowDefinition } from './workflow-validation';

const DEFAULT_RETRY_DELAY_MS = 300;

function getValue(source: Record<string, unknown> | undefined, key: string): unknown {
  if (!source || !key) return undefined;
  return key.split('.').reduce<unknown>((acc, part) => {
    if (!acc || typeof acc !== 'object') return undefined;
    return (acc as Record<string, unknown>)[part];
  }, source);
}

function interpolate(input: unknown, context: WorkflowExecutionContext): unknown {
  if (typeof input !== 'string') return input;
  return input.replace(/\{\{\s*([^}]+)\s*\}\}/g, (_, rawPath) => {
    const path = String(rawPath || '').trim();
    const value = getValue(
      { record: context.record || {}, previousRecord: context.previousRecord || {} },
      path,
    );
    return value == null ? '' : String(value);
  });
}

function compareCondition(
  condition: WorkflowCondition,
  context: WorkflowExecutionContext,
): boolean {
  const current = getValue(context.record, condition.field);
  const expected = interpolate(condition.value, context);

  switch (condition.operator) {
    case 'eq':
      return current === expected;
    case 'neq':
      return current !== expected;
    case 'gt':
      return Number(current) > Number(expected);
    case 'gte':
      return Number(current) >= Number(expected);
    case 'lt':
      return Number(current) < Number(expected);
    case 'lte':
      return Number(current) <= Number(expected);
    case 'contains':
      return String(current ?? '')
        .toLowerCase()
        .includes(String(expected ?? '').toLowerCase());
    case 'in': {
      const values = Array.isArray(expected) ? expected : [expected];
      return values.includes(current);
    }
    case 'is_empty':
      return current == null || current === '';
    case 'not_empty':
      return !(current == null || current === '');
    default:
      return false;
  }
}

function evaluateConditions(conditions: WorkflowCondition[], context: WorkflowExecutionContext) {
  return conditions.every((condition) => compareCondition(condition, context));
}

function triggerMatches(workflow: WorkflowDefinition, context: WorkflowExecutionContext) {
  if (context.triggerSource === 'test') return true;
  if (workflow.trigger.type === 'manual') return context.triggerSource === 'manual';
  if (workflow.trigger.type === 'scheduled') return context.triggerSource === 'schedule';

  if (workflow.trigger.type === 'event') {
    if (context.triggerSource !== 'event') return false;
    const recordEntity = String(context.record?.entity || '');
    if (recordEntity && recordEntity !== workflow.trigger.entity) return false;
    if (workflow.trigger.event === 'field_changed') {
      const field = workflow.trigger.field;
      if (!field) return true;
      const prev = getValue(context.previousRecord, field);
      const next = getValue(context.record, field);
      return prev !== next;
    }
    return true;
  }

  return false;
}

async function insertRunLog(runId: string, tenantId: string, log: WorkflowRunLog) {
  await adminDb
    .collection('automation_workflow_runs')
    .doc(runId)
    .collection('logs')
    .add({ ...log, tenantId });
}

async function resolveApprovers(
  step: ApprovalStep,
  tenantId: string,
  actorUid?: string,
): Promise<string[]> {
  if (step.type === 'user') return step.userIds || [];
  if (step.type === 'role') {
    const roles = step.roles || [];
    if (!roles.length) return [];
    const usersSnap = await adminDb
      .collection('users')
      .where('tenantId', '==', tenantId)
      .where('role', 'in', roles)
      .get();
    return usersSnap.docs.map((doc) => doc.id);
  }
  if (step.type === 'group') {
    const ids = step.groupIds || [];
    if (!ids.length) return [];
    const groupSnaps = await Promise.all(
      ids.map((id) => adminDb.collection('approval_groups').doc(id).get()),
    );
    return groupSnaps.flatMap((snap) =>
      snap.exists ? (snap.data()?.memberUids as string[]) || [] : [],
    );
  }
  if (step.type === 'manager') {
    if (!actorUid) return [];
    const actor = await adminDb.collection('users').doc(actorUid).get();
    const managerUid = String(actor.data()?.managerUid || '');
    return managerUid ? [managerUid] : [];
  }
  return [];
}

async function executeAction(
  action: WorkflowAction,
  context: WorkflowExecutionContext,
  runId: string,
): Promise<{ awaitingApproval?: boolean }> {
  // The UI's test action is a simulation. It must never write Firestore data,
  // send email, call third-party URLs, or create approval records.
  if (context.triggerSource === 'test') return {};

  switch (action.type) {
    case 'create_record': {
      const payload = Object.entries(action.payload || {}).reduce<Record<string, unknown>>(
        (acc, [key, value]) => {
          acc[key] = interpolate(value, context);
          return acc;
        },
        {},
      );
      await executeWorkflowMutation({
        action,
        tenantId: context.tenantId,
        payload,
        workflowId: context.workflowId,
        runId,
      });
      return {};
    }
    case 'update_field': {
      const recordId = String(getValue(context.record, 'id') || '');
      if (!recordId) throw new Error('Missing record id for update_field action.');
      await executeWorkflowMutation({
        action,
        tenantId: context.tenantId,
        recordId,
        value: interpolate(action.value, context),
        workflowId: context.workflowId,
        runId,
      });
      return {};
    }
    case 'delete_record': {
      throw new Error(
        'Delete actions require durable post-approval continuation and are currently disabled.',
      );
    }
    case 'send_email': {
      await adminDb.collection('email_queue').add({
        tenantId: context.tenantId,
        to: action.to.map((value) => String(interpolate(value, context))),
        subject: String(interpolate(action.subject, context)),
        body: String(interpolate(action.body, context)),
        source: 'automation_workflow',
        workflowId: context.workflowId,
        runId,
        createdAt: new Date().toISOString(),
      });
      return {};
    }
    case 'webhook': {
      throw new Error(
        'Outbound webhook actions require destination allowlisting and are disabled.',
      );
    }
    case 'approval': {
      const approvalRef = adminDb.collection('automation_approvals').doc();
      const stepPayload = await Promise.all(
        action.steps.map(async (step) => ({
          ...step,
          approvers: await resolveApprovers(step, context.tenantId, context.actorUid),
          status: 'pending',
        })),
      );
      await approvalRef.set({
        tenantId: context.tenantId,
        workflowId: context.workflowId,
        runId,
        mode: action.mode,
        steps: stepPayload,
        status: 'pending',
        currentStepIndex: 0,
        requestedBy: context.actorUid || null,
        expiresAt: action.expiresInHours
          ? new Date(Date.now() + action.expiresInHours * 60 * 60 * 1000).toISOString()
          : null,
        createdAt: new Date().toISOString(),
      });
      return { awaitingApproval: true };
    }
    default:
      return {};
  }
}

export class WorkflowEngine {
  async execute(workflow: WorkflowDefinition, context: WorkflowExecutionContext) {
    if (
      workflow.id !== context.workflowId ||
      workflow.tenantId !== context.tenantId ||
      !workflow.id ||
      !workflow.tenantId
    ) {
      throw new Error('Workflow execution context does not match the stored workflow.');
    }
    const validation = validateWorkflowDefinition(workflow);
    if (!validation.ok) throw new Error(validation.error);

    const runRef = adminDb.collection('automation_workflow_runs').doc();
    const baseRun = {
      tenantId: context.tenantId,
      workflowId: workflow.id,
      recordId: String(context.record?.id || ''),
      triggerSource: context.triggerSource,
      status: 'running' as WorkflowRunStatus,
      retries: 0,
      startedAt: new Date().toISOString(),
      completedAt: null,
      error: null as string | null,
    };

    await runRef.set(baseRun);
    await insertRunLog(runRef.id, context.tenantId, {
      ts: new Date().toISOString(),
      level: 'info',
      message: 'Workflow run started.',
    });

    if (!triggerMatches(workflow, context)) {
      await insertRunLog(runRef.id, context.tenantId, {
        ts: new Date().toISOString(),
        level: 'warn',
        message: 'Trigger did not match incoming context.',
      });
      await runRef.set(
        { status: 'failed', completedAt: new Date().toISOString(), error: 'Trigger mismatch' },
        { merge: true },
      );
      return { runId: runRef.id, status: 'failed' as WorkflowRunStatus };
    }

    if (!evaluateConditions(workflow.conditions || [], context)) {
      await insertRunLog(runRef.id, context.tenantId, {
        ts: new Date().toISOString(),
        level: 'info',
        message: 'Workflow conditions evaluated false; skipping actions.',
      });
      await runRef.set(
        { status: 'success', completedAt: new Date().toISOString() },
        { merge: true },
      );
      return { runId: runRef.id, status: 'success' as WorkflowRunStatus };
    }

    let retries = 0;
    while (retries <= workflow.retryLimit) {
      try {
        for (const action of workflow.actions || []) {
          const result = await executeAction(action, context, runRef.id);
          await insertRunLog(runRef.id, context.tenantId, {
            ts: new Date().toISOString(),
            level: 'info',
            message: `Action executed: ${action.type}`,
            data: { actionId: action.id },
          });
          if (result.awaitingApproval) {
            await runRef.set(
              { status: 'awaiting_approval', completedAt: new Date().toISOString(), retries },
              { merge: true },
            );
            return { runId: runRef.id, status: 'awaiting_approval' as WorkflowRunStatus };
          }
        }

        await runRef.set(
          { status: 'success', completedAt: new Date().toISOString(), retries },
          { merge: true },
        );
        return { runId: runRef.id, status: 'success' as WorkflowRunStatus };
      } catch (error: any) {
        retries += 1;
        await insertRunLog(runRef.id, context.tenantId, {
          ts: new Date().toISOString(),
          level: 'error',
          message: 'Action execution failed.',
          data: { error: String(error?.message || error), attempt: retries },
        });
        if (retries > workflow.retryLimit) {
          await runRef.set(
            {
              status: 'failed',
              completedAt: new Date().toISOString(),
              retries,
              error: String(error?.message || error),
            },
            { merge: true },
          );
          return { runId: runRef.id, status: 'failed' as WorkflowRunStatus };
        }
        await new Promise((resolve) => setTimeout(resolve, DEFAULT_RETRY_DELAY_MS * retries));
        await runRef.set({ retries }, { merge: true });
      }
    }

    await runRef.set(
      { status: 'failed', completedAt: new Date().toISOString(), error: 'Retry limit reached' },
      { merge: true },
    );
    return { runId: runRef.id, status: 'failed' as WorkflowRunStatus };
  }
}
