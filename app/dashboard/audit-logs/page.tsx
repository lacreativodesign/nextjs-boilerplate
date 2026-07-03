'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import { format, parseISO } from 'date-fns';

type AuditLog = {
  id: string;
  tenantId: string;
  userId: string;
  userEmail: string;
  userName: string;
  action: string;
  resource: string;
  resourceId?: string;
  changes?: Array<{
    field: string;
    oldValue: unknown;
    newValue: unknown;
  }>;
  metadata: {
    ip?: string;
    userAgent?: string;
    location?: string;
    sessionId?: string;
  };
  status: 'success' | 'failure';
  errorMessage?: string;
  timestamp: string;
};

type AuditResponse = {
  logs: AuditLog[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
};

const RESOURCE_OPTIONS = [
  { label: 'All Resources', value: '' },
  { label: 'User', value: 'user' },
  { label: 'Tenant', value: 'tenant' },
  { label: 'Role', value: 'role' },
  { label: 'Permission', value: 'permission' },
  { label: 'Invoice', value: 'invoice' },
  { label: 'Customer', value: 'customer' },
  { label: 'Payment', value: 'payment' },
  { label: 'Expense', value: 'expense' },
  { label: 'Report', value: 'report' },
  { label: 'Project', value: 'project' },
  { label: 'Deal', value: 'deal' },
  { label: 'Lead', value: 'lead' },
  { label: 'Payroll', value: 'payroll' },
  { label: 'Change Request', value: 'change_request' },
  { label: 'Approval', value: 'approval' },
  { label: 'Settings', value: 'settings' },
];

const ACTION_OPTIONS = [
  { label: 'All Actions', value: '' },
  { label: 'Create', value: 'create' },
  { label: 'Read', value: 'read' },
  { label: 'Update', value: 'update' },
  { label: 'Delete', value: 'delete' },
  { label: 'Login', value: 'login' },
  { label: 'Logout', value: 'logout' },
  { label: 'Login Failed', value: 'login_failed' },
  { label: 'MFA Enabled', value: 'mfa_enabled' },
  { label: 'MFA Disabled', value: 'mfa_disabled' },
  { label: 'Password Changed', value: 'password_changed' },
  { label: 'Export', value: 'export' },
  { label: 'Import', value: 'import' },
  { label: 'Bulk Update', value: 'bulk_update' },
  { label: 'Bulk Delete', value: 'bulk_delete' },
  { label: 'Role Changed', value: 'role_changed' },
  { label: 'Permission Changed', value: 'permission_changed' },
  { label: 'Settings Changed', value: 'settings_changed' },
];

const STATUS_OPTIONS = [
  { label: 'All Statuses', value: '' },
  { label: 'Success', value: 'success' },
  { label: 'Failure', value: 'failure' },
];

function formatValue(value: unknown) {
  if (value === null || value === undefined) return '-';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<AuditResponse['pagination']>({
    total: 0,
    page: 1,
    limit: 50,
    totalPages: 1,
  });
  const [filters, setFilters] = useState({
    userId: '',
    resource: '',
    action: '',
    status: '',
    startDate: '',
    endDate: '',
  });
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});

  const searchParams = useMemo(() => {
    const params = new URLSearchParams({
      page: page.toString(),
      limit: pagination.limit.toString(),
    });
    Object.entries(filters).forEach(([key, value]) => {
      if (!value) return;
      if (key === 'startDate') {
        params.set('startDate', new Date(`${value}T00:00:00Z`).toISOString());
        return;
      }
      if (key === 'endDate') {
        params.set('endDate', new Date(`${value}T23:59:59.999Z`).toISOString());
        return;
      }
      params.set(key, value);
    });
    return params;
  }, [filters, page, pagination.limit]);

  useEffect(() => {
    let active = true;
    async function fetchLogs() {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/audit-logs?${searchParams.toString()}`, {
          cache: 'no-store',
        });
        if (!response.ok) {
          throw new Error('Failed to fetch audit logs.');
        }
        const data = (await response.json()) as AuditResponse;
        if (!active) return;
        setLogs(data.logs || []);
        setPagination(data.pagination);
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'Failed to fetch audit logs.');
      } finally {
        if (active) setLoading(false);
      }
    }
    fetchLogs();
    return () => {
      active = false;
    };
  }, [searchParams]);

  const handleFilterChange = (field: string, value: string) => {
    setPage(1);
    setFilters((prev) => ({ ...prev, [field]: value }));
  };

  const clearFilters = () => {
    setPage(1);
    setFilters({
      userId: '',
      resource: '',
      action: '',
      status: '',
      startDate: '',
      endDate: '',
    });
  };

  const toggleRow = (id: string) => {
    setExpandedRows((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const exportCsv = () => {
    const params = new URLSearchParams(searchParams);
    params.set('format', 'csv');
    window.location.href = `/api/audit-logs?${params.toString()}`;
  };

  return (
    <div className="space-y-6 p-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">Audit Logs</h1>
          <p className="page-subtitle">
            Track security-sensitive actions, data changes, and system events.
          </p>
        </div>
        <button
          onClick={exportCsv}
          className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] px-4 py-2 text-sm font-semibold"
        >
          Export CSV
        </button>
      </div>

      <div className="card p-5">
        <div className="grid gap-4 md:grid-cols-6">
          <input
            value={filters.userId}
            onChange={(e) => handleFilterChange('userId', e.target.value)}
            placeholder="Filter by user ID"
            className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] px-4 py-2 text-sm"
          />
          <select
            value={filters.resource}
            onChange={(e) => handleFilterChange('resource', e.target.value)}
            className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] px-4 py-2 text-sm"
          >
            {RESOURCE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <select
            value={filters.action}
            onChange={(e) => handleFilterChange('action', e.target.value)}
            className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] px-4 py-2 text-sm"
          >
            {ACTION_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <select
            value={filters.status}
            onChange={(e) => handleFilterChange('status', e.target.value)}
            className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] px-4 py-2 text-sm"
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <input
            type="date"
            value={filters.startDate}
            onChange={(e) => handleFilterChange('startDate', e.target.value)}
            className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] px-4 py-2 text-sm"
          />
          <input
            type="date"
            value={filters.endDate}
            onChange={(e) => handleFilterChange('endDate', e.target.value)}
            className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] px-4 py-2 text-sm"
          />
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-[var(--text-muted)]">
            {pagination.total} events · Page {pagination.page} of {pagination.totalPages}
          </div>
          <button
            onClick={clearFilters}
            className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] px-4 py-2 text-xs font-semibold"
          >
            Clear Filters
          </button>
        </div>
      </div>

      <div className="card overflow-hidden">
        {loading && <div className="p-4 text-sm text-[var(--text-muted)]">Loading audit logs…</div>}
        {error && <div className="p-4 text-sm text-red-600">{error}</div>}
        {!loading && !error && (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">
                  <th className="px-4 py-3">Timestamp</th>
                  <th className="px-4 py-3">User</th>
                  <th className="px-4 py-3">Action</th>
                  <th className="px-4 py-3">Resource</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Details</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => {
                  const timestamp = log.timestamp
                    ? format(parseISO(log.timestamp), 'MMM dd, yyyy HH:mm:ss')
                    : '-';
                  return (
                    <Fragment key={log.id}>
                      <tr key={log.id} className="border-t border-[var(--border-subtle)]">
                        <td className="px-4 py-3 text-sm">{timestamp}</td>
                        <td className="px-4 py-3 text-sm">
                          <div className="font-semibold">{log.userName || 'Unknown'}</div>
                          <div className="text-xs text-[var(--text-muted)]">
                            {log.userEmail || log.userId}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-800">
                            {log.action}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <div className="font-semibold capitalize">{log.resource}</div>
                          {log.resourceId && (
                            <div className="text-xs text-[var(--text-muted)]">{log.resourceId}</div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <span
                            className={`rounded-full px-3 py-1 text-xs font-semibold ${
                              log.status === 'success'
                                ? 'bg-green-100 text-green-800'
                                : 'bg-red-100 text-red-800'
                            }`}
                          >
                            {log.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm">
                          {log.changes?.length ? (
                            <button
                              onClick={() => toggleRow(log.id)}
                              className="text-sm font-semibold text-blue-600 hover:underline"
                            >
                              {expandedRows[log.id] ? 'Hide Changes' : 'View Changes'}
                            </button>
                          ) : (
                            <span className="text-xs text-[var(--text-muted)]">No changes</span>
                          )}
                        </td>
                      </tr>
                      {expandedRows[log.id] && (
                        <tr className="border-t border-[var(--border-subtle)] bg-[var(--surface-card)]">
                          <td className="px-4 py-4 text-sm text-[var(--text-muted)]" colSpan={6}>
                            <div className="grid gap-3 md:grid-cols-3">
                              {log.changes?.map((change) => (
                                <div
                                  key={`${log.id}-${change.field}`}
                                  className="rounded-xl border p-3"
                                >
                                  <div className="text-xs uppercase text-[var(--text-muted)]">
                                    {change.field}
                                  </div>
                                  <div className="mt-2 text-xs text-[var(--text-muted)]">
                                    Before
                                  </div>
                                  <div className="text-sm font-semibold">
                                    {formatValue(change.oldValue)}
                                  </div>
                                  <div className="mt-2 text-xs text-[var(--text-muted)]">After</div>
                                  <div className="text-sm font-semibold">
                                    {formatValue(change.newValue)}
                                  </div>
                                </div>
                              ))}
                            </div>
                            {log.errorMessage && (
                              <div className="mt-3 text-sm text-red-600">
                                Error: {log.errorMessage}
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
                {logs.length === 0 && (
                  <tr>
                    <td className="px-4 py-6 text-sm text-[var(--text-muted)]" colSpan={6}>
                      No audit logs found for the selected filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between">
        <button
          onClick={() => setPage((prev) => Math.max(1, prev - 1))}
          disabled={page <= 1}
          className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] px-4 py-2 text-sm font-semibold disabled:opacity-50"
        >
          Previous
        </button>
        <div className="text-xs text-[var(--text-muted)]">
          Page {pagination.page} of {pagination.totalPages}
        </div>
        <button
          onClick={() => setPage((prev) => Math.min(pagination.totalPages, prev + 1))}
          disabled={page >= pagination.totalPages}
          className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] px-4 py-2 text-sm font-semibold disabled:opacity-50"
        >
          Next
        </button>
      </div>
    </div>
  );
}
