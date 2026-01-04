"use client";

import { useEffect, useState } from "react";

type Tenant = { id: string; name: string; status: string };

type SystemHealth = {
  notifications: { total: number; unread: number };
  emails: { total: number; statusCounts: Record<string, number> };
};

export default function SuperAdminOverviewPage() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [health, setHealth] = useState<SystemHealth | null>(null);

  useEffect(() => {
    let active = true;

    async function load() {
      const [tenantRes, healthRes] = await Promise.all([
        fetch("/api/super-admin/tenants", { cache: "no-store", credentials: "include" }),
        fetch("/api/super-admin/system-health", { cache: "no-store", credentials: "include" }),
      ]);

      const tenantJson = await tenantRes.json().catch(() => null);
      const healthJson = await healthRes.json().catch(() => null);

      if (active && tenantJson?.ok) {
        setTenants(
          (tenantJson.tenants || []).map((tenant: any) => ({
            id: tenant.id,
            name: tenant.name || tenant.slug || tenant.id,
            status: tenant.status || "active",
          }))
        );
      }

      if (active && healthJson?.ok) {
        setHealth(healthJson);
      }
    }

    load();
    return () => {
      active = false;
    };
  }, []);

  const activeCount = tenants.filter((tenant) => tenant.status === "active").length;
  const suspendedCount = tenants.filter((tenant) => tenant.status === "suspended").length;

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">Platform Overview</h1>
          <p className="page-subtitle">Multi-tenant command center for Bizosto ERP.</p>
        </div>
      </div>

      <div className="kpis">
        <div className="card kpi-card p-5">
          <div className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">Tenants</div>
          <div className="text-3xl font-semibold mt-2">{tenants.length}</div>
          <div className="text-sm text-[var(--text-muted)] mt-1">Total companies onboarded</div>
        </div>
        <div className="card kpi-card p-5">
          <div className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">Active</div>
          <div className="text-3xl font-semibold mt-2">{activeCount}</div>
          <div className="text-sm text-[var(--text-muted)] mt-1">Healthy tenant accounts</div>
        </div>
        <div className="card kpi-card p-5">
          <div className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">Suspended</div>
          <div className="text-3xl font-semibold mt-2">{suspendedCount}</div>
          <div className="text-sm text-[var(--text-muted)] mt-1">Accounts on hold</div>
        </div>
        <div className="card kpi-card p-5">
          <div className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">Unread Alerts</div>
          <div className="text-3xl font-semibold mt-2">{health?.notifications?.unread ?? 0}</div>
          <div className="text-sm text-[var(--text-muted)] mt-1">Platform notifications</div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <div className="card p-6">
          <h3 className="section-title">Tenant Status</h3>
          <p className="section-subtitle">Quick look at every company in the platform.</p>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">
                  <th className="px-4 py-3">Company</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Tenant ID</th>
                </tr>
              </thead>
              <tbody>
                {tenants.map((tenant) => (
                  <tr key={tenant.id} className="border-t border-[var(--border-subtle)]">
                    <td className="px-4 py-3">{tenant.name}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${
                          tenant.status === "active"
                            ? "bg-[var(--erp-blue-soft)] text-[var(--erp-blue)]"
                            : "bg-red-500/10 text-red-400"
                        }`}
                      >
                        {tenant.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-[var(--text-muted)]">{tenant.id}</td>
                  </tr>
                ))}
                {tenants.length === 0 && (
                  <tr>
                    <td className="px-4 py-6 text-sm text-[var(--text-muted)]" colSpan={3}>
                      No tenants yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card p-6">
          <h3 className="section-title">System Health</h3>
          <p className="section-subtitle">Notification + email queue status.</p>
          <div className="mt-4 space-y-4">
            <div className="rounded-xl border border-[var(--border-subtle)] p-4">
              <div className="text-sm text-[var(--text-muted)]">Notifications</div>
              <div className="text-2xl font-semibold mt-2">{health?.notifications?.total ?? 0}</div>
              <div className="text-xs text-[var(--text-muted)] mt-1">Unread: {health?.notifications?.unread ?? 0}</div>
            </div>
            <div className="rounded-xl border border-[var(--border-subtle)] p-4">
              <div className="text-sm text-[var(--text-muted)]">Emails</div>
              <div className="text-2xl font-semibold mt-2">{health?.emails?.total ?? 0}</div>
              <div className="text-xs text-[var(--text-muted)] mt-1">
                {Object.entries(health?.emails?.statusCounts || {}).map(([status, count]) => (
                  <span key={status} className="mr-3">
                    {status}: {count}
                  </span>
                ))}
              </div>
            </div>
            <div className="rounded-xl border border-dashed border-[var(--border-subtle)] p-4 text-xs text-[var(--text-muted)]">
              Health metrics refresh automatically from platform queues.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
