import type { WorkflowAction, WorkflowDefinition } from './workflow-types';

const MUTABLE_ENTITY_POLICIES: Record<
  string,
  { create: boolean; updateFields: '*' | ReadonlySet<string> }
> = {
  tasks: { create: true, updateFields: '*' },
  leads: { create: true, updateFields: '*' },
  deals: { create: true, updateFields: '*' },
  clients: { create: true, updateFields: '*' },
  projects: { create: true, updateFields: '*' },
  invoices: { create: false, updateFields: new Set(['approvalStatus']) },
};

const PROTECTED_FIELDS = new Set([
  'id',
  'tenantId',
  'createdAt',
  'createdBy',
  'createdByUid',
  'updatedBy',
  'deletedAt',
  'role',
  'roles',
  'permissions',
  'plan',
  'modules',
  'subscriptionState',
  'stripeCustomerId',
  'stripeSubscriptionId',
  'amount',
  'amountTotal',
  'amountTotalUsd',
  'balanceDue',
  'totalPaid',
  'paidAmount',
  'currency',
]);

const SAFE_FIELD = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;

export function isWorkflowEntityAllowed(entity: string) {
  return Boolean(MUTABLE_ENTITY_POLICIES[entity]);
}

export function isWorkflowFieldAllowed(entity: string, field: string) {
  if (!SAFE_FIELD.test(field) || PROTECTED_FIELDS.has(field)) return false;
  const policy = MUTABLE_ENTITY_POLICIES[entity];
  if (!policy) return false;
  return policy.updateFields === '*' || policy.updateFields.has(field);
}

export function sanitizeWorkflowCreatePayload(
  entity: string,
  payload: Record<string, unknown>,
): Record<string, unknown> {
  const policy = MUTABLE_ENTITY_POLICIES[entity];
  if (!policy?.create) throw new Error(`Workflow creation is not permitted for ${entity}.`);

  const sanitized: Record<string, unknown> = {};
  for (const [field, value] of Object.entries(payload)) {
    if (!isWorkflowFieldAllowed(entity, field)) {
      throw new Error(`Workflow is not permitted to set ${entity}.${field}.`);
    }
    sanitized[field] = value;
  }
  return sanitized;
}

function validateAction(action: WorkflowAction): string | null {
  if (!action?.id || typeof action.id !== 'string') return 'Every workflow action needs an id.';
  if (
    ![
      'create_record',
      'update_field',
      'delete_record',
      'send_email',
      'webhook',
      'approval',
    ].includes(String(action.type))
  ) {
    return 'Unsupported workflow action type.';
  }

  if (action.type === 'delete_record') {
    return 'Delete actions are disabled until durable post-approval continuation is implemented.';
  }
  if (action.type === 'webhook') {
    return 'Outbound webhook actions are disabled until destination allowlisting is implemented.';
  }
  if (action.type === 'create_record') {
    if (!isWorkflowEntityAllowed(action.entity)) return 'Workflow entity is not allowed.';
    try {
      sanitizeWorkflowCreatePayload(action.entity, action.payload || {});
    } catch (error) {
      return error instanceof Error ? error.message : 'Invalid workflow create payload.';
    }
  }
  if (action.type === 'update_field') {
    if (!isWorkflowFieldAllowed(action.entity, action.field)) {
      return `Workflow is not permitted to update ${action.entity}.${action.field}.`;
    }
  }
  if (action.type === 'send_email' && (!Array.isArray(action.to) || action.to.length === 0)) {
    return 'Email actions require at least one recipient.';
  }
  if (action.type === 'approval' && (!Array.isArray(action.steps) || action.steps.length === 0)) {
    return 'Approval actions require at least one step.';
  }
  return null;
}

export function validateWorkflowDefinition(
  workflow: Pick<WorkflowDefinition, 'tenantId' | 'trigger' | 'actions'>,
): { ok: true } | { ok: false; error: string } {
  if (!workflow.tenantId) return { ok: false, error: 'Workflow tenant is required.' };
  if (!workflow.trigger) return { ok: false, error: 'Workflow trigger is required.' };
  if (!['manual', 'scheduled', 'event'].includes(String(workflow.trigger.type))) {
    return { ok: false, error: 'Unsupported workflow trigger type.' };
  }
  if (!Array.isArray(workflow.actions) || workflow.actions.length === 0) {
    return { ok: false, error: 'At least one workflow action is required.' };
  }

  if (workflow.trigger.type === 'scheduled') {
    // Scheduled workflows are coordinated by the single daily orchestrator.
    // Sub-daily schedules would be a false reliability promise on the current plan.
    const match = /^(\d{1,2})\s+(\d{1,2})\s+\*\s+\*\s+\*$/.exec(workflow.trigger.cron);
    const minute = Number(match?.[1]);
    const hour = Number(match?.[2]);
    const onceDaily = Boolean(match) && minute >= 0 && minute <= 59 && hour >= 0 && hour <= 23;
    if (!onceDaily) {
      return { ok: false, error: 'Scheduled workflows must use a once-daily schedule.' };
    }
  }

  const ids = new Set<string>();
  for (const action of workflow.actions) {
    const error = validateAction(action);
    if (error) return { ok: false, error };
    if (ids.has(action.id)) return { ok: false, error: 'Workflow action ids must be unique.' };
    ids.add(action.id);
  }
  return { ok: true };
}
