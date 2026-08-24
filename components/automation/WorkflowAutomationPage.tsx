'use client';

import { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '@/lib/api/client';
import type {
  WorkflowAction,
  WorkflowCondition,
  WorkflowDefinition,
  WorkflowTrigger,
} from '@/lib/automation/workflow-types';

type WorkflowRun = {
  id: string;
  status: string;
  startedAt?: string;
  completedAt?: string;
  error?: string | null;
  logs?: Array<{ ts: string; level: string; message: string }>;
};

const EMPTY_TRIGGER: WorkflowTrigger = { type: 'manual' };

const EMPTY_WORKFLOW: Partial<WorkflowDefinition> = {
  name: '',
  description: '',
  trigger: EMPTY_TRIGGER,
  conditions: [],
  actions: [],
  retryLimit: 1,
};

export default function WorkflowAutomationPage() {
  const [workflows, setWorkflows] = useState<WorkflowDefinition[]>([]);
  const [templates, setTemplates] = useState<string[]>([]);
  const [selected, setSelected] = useState<Partial<WorkflowDefinition>>(EMPTY_WORKFLOW);
  const [runs, setRuns] = useState<WorkflowRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [approvals, setApprovals] = useState<
    Array<{ id: string; status: string; workflowId: string; mode: string }>
  >([]);

  const selectedId = selected.id;

  const loadWorkflows = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch('/api/automation/workflows', { cache: 'no-store' });
      const payload = await res.json();
      if (!res.ok || !payload?.ok) throw new Error(payload?.error || 'Unable to load workflows');
      setWorkflows(payload.workflows || []);
      setTemplates(payload.templates || []);
      if (payload.workflows?.length && !selectedId) {
        setSelected(payload.workflows[0]);
      }
    } catch (err: any) {
      setError(err.message || 'Unable to load workflows');
    } finally {
      setLoading(false);
    }
  };

  const loadApprovals = async () => {
    const snap = await apiFetch('/api/automation/workflows', { cache: 'no-store' });
    if (!snap.ok) return;
    const approvalSnap = await apiFetch('/api/approvals/pending', { cache: 'no-store' });
    if (!approvalSnap.ok) return;
    const payload = await approvalSnap.json();
    const items = Array.isArray(payload?.approvals)
      ? payload.approvals.map((item: any) => ({
          id: item.id,
          status: item.status || 'pending',
          workflowId: item.entityId || '',
          mode: 'sequential',
        }))
      : [];
    setApprovals(items);
  };

  const loadRuns = async (workflowId: string) => {
    const res = await apiFetch(`/api/automation/workflows/${workflowId}/runs`, {
      cache: 'no-store',
    });
    const payload = await res.json();
    if (res.ok && payload?.ok) setRuns(payload.runs || []);
  };

  useEffect(() => {
    loadWorkflows();
    loadApprovals();
  }, []);

  useEffect(() => {
    if (selectedId) loadRuns(selectedId);
    else setRuns([]);
  }, [selectedId]);

  const statusTone = (status?: string) => {
    if (status === 'active' || status === 'success')
      return { bg: 'rgba(34,197,94,0.12)', fg: 'var(--success, rgb(22, 163, 74))' };
    if (status === 'awaiting_approval')
      return { bg: 'rgba(59,130,246,0.12)', fg: 'var(--erp-blue)' };
    if (status === 'failed') return { bg: 'rgba(239,68,68,0.12)', fg: 'var(--danger)' };
    return { bg: 'var(--surface-muted)', fg: 'var(--text-muted)' };
  };

  const saveWorkflow = async () => {
    if (!selected.name || !selected.trigger || !selected.actions?.length) {
      setError('Name, trigger, and at least one action are required.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const method = selected.id ? 'PUT' : 'POST';
      const url = selected.id
        ? `/api/automation/workflows/${selected.id}`
        : '/api/automation/workflows';
      const res = await apiFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(selected),
      });
      const payload = await res.json();
      if (!res.ok || !payload?.ok) throw new Error(payload?.error || 'Unable to save workflow');
      await loadWorkflows();
    } catch (err: any) {
      setError(err.message || 'Unable to save workflow');
    } finally {
      setSaving(false);
    }
  };

  const toggleWorkflow = async (id: string) => {
    await apiFetch(`/api/automation/workflows/${id}/toggle`, { method: 'PUT' });
    await loadWorkflows();
  };

  const testRun = async () => {
    if (!selected.id) return;
    await apiFetch(`/api/automation/workflows/${selected.id}/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        record: { id: 'test-record', entity: 'tasks', priority: 'high', amount: 120 },
      }),
    });
    await loadRuns(selected.id);
  };

  const addCondition = () => {
    const next: WorkflowCondition = {
      id: crypto.randomUUID(),
      field: '',
      operator: 'eq',
      value: '',
    };
    setSelected((prev) => ({ ...prev, conditions: [...(prev.conditions || []), next] }));
  };

  const addAction = (type: WorkflowAction['type']) => {
    const base: WorkflowAction =
      type === 'create_record'
        ? { id: crypto.randomUUID(), type, entity: 'tasks', payload: {} }
        : type === 'update_field'
          ? { id: crypto.randomUUID(), type, entity: 'tasks', field: 'status', value: 'updated' }
          : type === 'delete_record'
            ? { id: crypto.randomUUID(), type, entity: 'tasks', recordIdField: 'id' }
            : type === 'send_email'
              ? {
                  id: crypto.randomUUID(),
                  type,
                  to: ['ops@bizosto.com'],
                  subject: 'Workflow Notice',
                  body: 'Action completed',
                }
              : type === 'webhook'
                ? {
                    id: crypto.randomUUID(),
                    type,
                    url: 'https://example.internal/webhook',
                    method: 'POST',
                  }
                : {
                    id: crypto.randomUUID(),
                    type,
                    mode: 'sequential',
                    steps: [{ id: crypto.randomUUID(), type: 'manager' }],
                  };
    setSelected((prev) => ({ ...prev, actions: [...(prev.actions || []), base] }));
  };

  const activeCount = useMemo(
    () => workflows.filter((item) => item.status === 'active').length,
    [workflows],
  );

  const respondApproval = async (id: string, decision: 'approve' | 'reject') => {
    await apiFetch(`/api/automation/approvals/${id}/respond`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision }),
    });
    await loadApprovals();
  };

  return (
    <div className="space-y-6">
      <div className="card" style={{ padding: 20, borderRadius: 16 }}>
        <div className="flex items-center justify-between">
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 700 }}>Workflow Automation</h1>
            <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
              Build and run event, schedule, and manual workflows with approvals.
            </p>
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            Active workflows: <strong>{activeCount}</strong>
          </div>
        </div>
        {error && <div style={{ marginTop: 12, color: 'var(--danger)' }}>{error}</div>}
      </div>

      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <section className="card" style={{ padding: 16, borderRadius: 16 }}>
          <div className="mb-3 flex items-center justify-between">
            <h2 style={{ fontSize: 16, fontWeight: 700 }}>Workflow List</h2>
            <button className="btn" onClick={() => setSelected({ ...EMPTY_WORKFLOW })}>
              New
            </button>
          </div>
          {loading ? (
            <div>Loading workflows...</div>
          ) : (
            <div className="space-y-2">
              {workflows.map((item) => (
                <button
                  key={item.id}
                  className="w-full rounded-xl border p-3 text-left"
                  style={{
                    borderColor: 'var(--border-subtle)',
                    background: selectedId === item.id ? 'var(--surface-muted)' : 'transparent',
                  }}
                  onClick={() => setSelected(item)}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div style={{ fontWeight: 600 }}>{item.name}</div>
                    <span
                      style={{
                        background: statusTone(item.status).bg,
                        color: statusTone(item.status).fg,
                        borderRadius: 999,
                        padding: '2px 8px',
                        fontSize: 11,
                      }}
                    >
                      {item.status}
                    </span>
                  </div>
                  <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                    {item.trigger?.type}
                  </div>
                </button>
              ))}
            </div>
          )}

          <div className="mt-4">
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>
              Templates
            </div>
            <div className="flex flex-wrap gap-2">
              {templates.map((template) => (
                <button
                  key={template}
                  className="btn ghost"
                  onClick={() => setSelected((prev) => ({ ...prev, templateKey: template }))}
                >
                  {template}
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="space-y-6">
          <div className="card" style={{ padding: 16, borderRadius: 16 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700 }}>Visual Workflow Builder</h2>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <label>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Name</div>
                <input
                  className="input"
                  value={selected.name || ''}
                  onChange={(e) => setSelected((prev) => ({ ...prev, name: e.target.value }))}
                />
              </label>
              <label>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Status</div>
                <select
                  className="input"
                  value={selected.status || 'disabled'}
                  onChange={(e) =>
                    setSelected((prev) => ({
                      ...prev,
                      status: e.target.value as WorkflowDefinition['status'],
                    }))
                  }
                >
                  <option value="disabled">disabled</option>
                  <option value="active">active</option>
                </select>
              </label>
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-3">
              <div className="rounded-xl border p-3">
                <div style={{ fontWeight: 600 }}>Trigger</div>
                <select
                  className="input mt-2"
                  value={selected.trigger?.type || 'manual'}
                  onChange={(e) =>
                    setSelected((prev) => ({
                      ...prev,
                      trigger: {
                        type: e.target.value as WorkflowTrigger['type'],
                      } as WorkflowTrigger,
                    }))
                  }
                >
                  <option value="manual">manual</option>
                  <option value="scheduled">scheduled</option>
                  <option value="event">event</option>
                </select>
              </div>

              <div className="rounded-xl border p-3 md:col-span-2">
                <div className="mb-2 flex items-center justify-between">
                  <div style={{ fontWeight: 600 }}>Condition Builder</div>
                  <button className="btn ghost" onClick={addCondition}>
                    Add condition
                  </button>
                </div>
                <div className="space-y-2">
                  {(selected.conditions || []).map((condition, index) => (
                    <div key={condition.id} className="grid grid-cols-3 gap-2">
                      <input
                        className="input"
                        placeholder="field"
                        value={condition.field}
                        onChange={(e) =>
                          setSelected((prev) => {
                            const conditions = [...(prev.conditions || [])];
                            conditions[index] = { ...conditions[index], field: e.target.value };
                            return { ...prev, conditions };
                          })
                        }
                      />
                      <select
                        className="input"
                        value={condition.operator}
                        onChange={(e) =>
                          setSelected((prev) => {
                            const conditions = [...(prev.conditions || [])];
                            conditions[index] = {
                              ...conditions[index],
                              operator: e.target.value as WorkflowCondition['operator'],
                            };
                            return { ...prev, conditions };
                          })
                        }
                      >
                        {[
                          'eq',
                          'neq',
                          'gt',
                          'gte',
                          'lt',
                          'lte',
                          'contains',
                          'in',
                          'is_empty',
                          'not_empty',
                        ].map((operator) => (
                          <option key={operator}>{operator}</option>
                        ))}
                      </select>
                      <input
                        className="input"
                        placeholder="value"
                        value={String(condition.value ?? '')}
                        onChange={(e) =>
                          setSelected((prev) => {
                            const conditions = [...(prev.conditions || [])];
                            conditions[index] = { ...conditions[index], value: e.target.value };
                            return { ...prev, conditions };
                          })
                        }
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-4 rounded-xl border p-3">
              <div className="mb-2 flex items-center justify-between">
                <div style={{ fontWeight: 600 }}>Action Selector</div>
                <div className="flex flex-wrap gap-2">
                  {(
                    [
                      'create_record',
                      'update_field',
                      'delete_record',
                      'send_email',
                      'webhook',
                      'approval',
                    ] as const
                  ).map((type) => (
                    <button
                      key={type}
                      className="btn ghost"
                      onClick={() => addAction(type)}
                      disabled={type === 'delete_record' || type === 'webhook'}
                      title={
                        type === 'delete_record'
                          ? 'Requires durable post-approval continuation.'
                          : type === 'webhook'
                            ? 'Requires destination allowlisting and SSRF controls.'
                            : undefined
                      }
                    >
                      {type}
                      {(type === 'delete_record' || type === 'webhook') && ' (pending)'}
                    </button>
                  ))}
                </div>
              </div>
              <p className="mb-3 text-xs text-[var(--text-muted)]">
                Delete and outbound webhook actions remain visible but disabled until their
                approval-continuation and destination-security release gates are complete.
              </p>
              <div className="space-y-2">
                {(selected.actions || []).map((action, index) => (
                  <div key={action.id} className="rounded-lg border p-2">
                    <div className="flex items-center justify-between">
                      <strong>
                        {index + 1}. {action.type}
                      </strong>
                      <button
                        className="btn ghost"
                        onClick={() =>
                          setSelected((prev) => ({
                            ...prev,
                            actions: (prev.actions || []).filter((item) => item.id !== action.id),
                          }))
                        }
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <button className="btn" onClick={saveWorkflow} disabled={saving}>
                {saving ? 'Saving...' : 'Save workflow'}
              </button>
              {selected.id && (
                <button className="btn ghost" onClick={() => toggleWorkflow(selected.id!)}>
                  Enable/Disable
                </button>
              )}
              {selected.id && (
                <button className="btn ghost" onClick={testRun}>
                  Dry run (no writes)
                </button>
              )}
            </div>
          </div>

          <div className="card" style={{ padding: 16, borderRadius: 16 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700 }}>Approval Dashboard</h3>
            <div className="mt-3 space-y-2">
              {approvals.map((approval) => (
                <div key={approval.id} className="rounded-xl border p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div style={{ fontWeight: 600 }}>Approval {approval.id}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                        Workflow {approval.workflowId}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        className="btn ghost"
                        onClick={() => respondApproval(approval.id, 'approve')}
                      >
                        Approve
                      </button>
                      <button
                        className="btn ghost"
                        onClick={() => respondApproval(approval.id, 'reject')}
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                </div>
              ))}
              {!approvals.length && (
                <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                  No pending automation approvals.
                </div>
              )}
            </div>
          </div>

          <div className="card" style={{ padding: 16, borderRadius: 16 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700 }}>Workflow Run History</h3>
            <div className="mt-3 space-y-2">
              {runs.map((run) => (
                <div key={run.id} className="rounded-xl border p-3">
                  <div className="flex items-center justify-between">
                    <span style={{ fontWeight: 600 }}>{run.id}</span>
                    <span
                      style={{
                        background: statusTone(run.status).bg,
                        color: statusTone(run.status).fg,
                        borderRadius: 999,
                        padding: '2px 8px',
                        fontSize: 11,
                      }}
                    >
                      {run.status}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    {run.startedAt} → {run.completedAt || 'running'}
                  </div>
                  {run.error && (
                    <div style={{ color: 'var(--danger)', fontSize: 12 }}>{run.error}</div>
                  )}
                  <div className="mt-2 rounded-lg bg-[var(--surface-muted)] p-2 text-xs">
                    {(run.logs || []).slice(-4).map((log, index) => (
                      <div key={`${run.id}-${index}`}>
                        {log.ts} [{log.level}] {log.message}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              {!runs.length && (
                <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                  No execution history.
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
