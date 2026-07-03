'use client';

import { useEffect, useState } from 'react';

type AuditLog = {
  id: string;
  tenantId: string | null;
  actorUserId: string;
  actionType: string;
  entityType: string;
  entityId: string;
  createdAt: string | null;
};

export default function SuperAdminAuditPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [tenantFilter, setTenantFilter] = useState('');

  useEffect(() => {
    let active = true;

    async function load() {
      const params = tenantFilter ? `?tenantId=${encodeURIComponent(tenantFilter)}` : '';
      const res = await fetch(`/api/super_admin/audit${params}`, {
        cache: 'no-store',
        credentials: 'include',
      });
      const json = await res.json().catch(() => null);
      if (active && json?.ok) {
        setLogs(json.logs || []);
      }
    }

    load();
    return () => {
      active = false;
    };
  }, [tenantFilter]);

  return (
    <div className="space-y-6">
      <div className="mb-6">
        <h1 className="page-title">Audit Log</h1>
        <p className="page-subtitle">Platform-level actions for tenants and users.</p>
      </div>

      <div className="card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="section-title">Recent Activity</div>
            <p className="section-subtitle">
              Shows changes to tenants, branding, users, and tenant switching.
            </p>
          </div>
          <input
            className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] px-4 py-2 text-sm"
            placeholder="Filter by tenantId"
            value={tenantFilter}
            onChange={(e) => setTenantFilter(e.target.value)}
          />
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-left text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">
                <th className="px-4 py-3">Action</th>
                <th className="px-4 py-3">Entity</th>
                <th className="px-4 py-3">Tenant</th>
                <th className="px-4 py-3">Actor</th>
                <th className="px-4 py-3">Created</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id} className="border-t border-[var(--border-subtle)]">
                  <td className="px-4 py-3 text-sm font-semibold">{log.actionType}</td>
                  <td className="px-4 py-3 text-sm">
                    {log.entityType} · {log.entityId}
                  </td>
                  <td className="px-4 py-3 text-xs text-[var(--text-muted)]">
                    {log.tenantId || 'Platform'}
                  </td>
                  <td className="px-4 py-3 text-xs text-[var(--text-muted)]">{log.actorUserId}</td>
                  <td className="px-4 py-3 text-xs text-[var(--text-muted)]">
                    {log.createdAt || '-'}
                  </td>
                </tr>
              ))}
              {logs.length === 0 && (
                <tr>
                  <td className="px-4 py-6 text-sm text-[var(--text-muted)]" colSpan={5}>
                    No audit events recorded yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
