import {
  isWorkflowFieldAllowed,
  sanitizeWorkflowCreatePayload,
  validateWorkflowDefinition,
} from '@/lib/automation/workflow-validation';
import type { WorkflowDefinition } from '@/lib/automation/workflow-types';

const workflow = (overrides: Partial<WorkflowDefinition> = {}): WorkflowDefinition => ({
  id: 'workflow-1',
  tenantId: 'tenant-a',
  name: 'Safe workflow',
  trigger: { type: 'manual' },
  conditions: [],
  actions: [
    { id: 'action-1', type: 'update_field', entity: 'tasks', field: 'status', value: 'done' },
  ],
  status: 'disabled',
  retryLimit: 1,
  ...overrides,
});

describe('automation workflow safety contract', () => {
  it('allows bounded tenant-domain mutations and blocks authorization/finance fields', () => {
    expect(isWorkflowFieldAllowed('tasks', 'status')).toBe(true);
    expect(isWorkflowFieldAllowed('tasks', 'tenantId')).toBe(false);
    expect(isWorkflowFieldAllowed('clients', 'role')).toBe(false);
    expect(isWorkflowFieldAllowed('invoices', 'approvalStatus')).toBe(true);
    expect(isWorkflowFieldAllowed('invoices', 'amountTotal')).toBe(false);
  });

  it('cannot use create payload spread to overwrite tenant or audit ownership', () => {
    expect(() => sanitizeWorkflowCreatePayload('tasks', { tenantId: 'tenant-b' })).toThrow(
      'tasks.tenantId',
    );
    expect(() => sanitizeWorkflowCreatePayload('clients', { createdAt: 'forged' })).toThrow(
      'clients.createdAt',
    );
  });

  it('blocks delete and outbound webhook actions pending their release gates', () => {
    expect(
      validateWorkflowDefinition(
        workflow({
          actions: [{ id: 'delete', type: 'delete_record', entity: 'tasks', recordIdField: 'id' }],
        }),
      ),
    ).toEqual(
      expect.objectContaining({ ok: false, error: expect.stringContaining('post-approval') }),
    );
    expect(
      validateWorkflowDefinition(
        workflow({
          actions: [
            {
              id: 'webhook',
              type: 'webhook',
              method: 'POST',
              url: 'http://169.254.169.254/latest/meta-data',
            },
          ],
        }),
      ),
    ).toEqual(
      expect.objectContaining({ ok: false, error: expect.stringContaining('allowlisting') }),
    );
  });

  it('rejects sub-daily schedules under the one-daily-orchestrator constraint', () => {
    expect(
      validateWorkflowDefinition(
        workflow({ trigger: { type: 'scheduled', cron: '0 * * * *', timezone: 'UTC' } }),
      ),
    ).toEqual(expect.objectContaining({ ok: false, error: expect.stringContaining('once-daily') }));
    expect(
      validateWorkflowDefinition(
        workflow({ trigger: { type: 'scheduled', cron: '15 8 * * *', timezone: 'UTC' } }),
      ),
    ).toEqual({ ok: true });
  });
});
