"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type Tenant = {
  id: string;
  name: string;
  slug: string;
  status: string;
  modulesEnabled: Record<string, boolean>;
  plan?: "starter" | "pro" | "enterprise";
  lastActiveAt?: string | null;
  trialEndsAt?: string | null;
  subscriptionState?: string;
};

function getHealthIndicator(tenant: Tenant): { dot: string; label: string; title: string } {
  const now = Date.now();

  // Trial ending in < 3 days = at risk
  if (tenant.trialEndsAt) {
    const trialMs = new Date(tenant.trialEndsAt).getTime() - now;
    const trialDays = Math.floor(trialMs / (1000 * 60 * 60 * 24));
    if (trialDays <= 3 && trialDays >= 0) {
      return { dot: "🔴", label: `Trial ends in ${trialDays}d`, title: "Trial ending soon" };
    }
  }

  // Locked or past due = at risk
  if (
    tenant.subscriptionState === "hard_locked" ||
    tenant.subscriptionState === "soft_locked"
  ) {
    return { dot: "🔴", label: "Locked", title: "Account locked — billing issue" };
  }

  if (!tenant.lastActiveAt) {
    return { dot: "⚪", label: "Never", title: "No login recorded yet" };
  }

  const lastMs = now - new Date(tenant.lastActiveAt).getTime();
  const days = Math.floor(lastMs / (1000 * 60 * 60 * 24));

  if (days <= 2) return { dot: "🟢", label: `${days === 0 ? "Today" : days + "d ago"}`, title: "Active recently" };
  if (days <= 7) return { dot: "🟡", label: `${days}d ago`, title: "Quiet — check in" };
  return { dot: "🔴", label: `${days}d ago`, title: "At risk — not logging in" };
}

const defaultModules = {
  admin: true,
  clients: true,
  users: true,
  sales: true,
  accountManager: true,
  production: true,
  finance: true,
  humanResource: true,
  dashboard: true,
  notifications: true,
  salesManager: true,
  headOfProjectManagement: true,
  headOfProduction: true,
};

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 64);
}

export default function SuperAdminTenantsPage() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [query, setQuery] = useState("");
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [createAdminEmail, setCreateAdminEmail] = useState("");
  const [saving, setSaving] = useState(false);

  const loadTenants = async () => {
    const res = await fetch("/api/super_admin/tenants", { cache: "no-store", credentials: "include" });
    const json = await res.json().catch(() => null);
    if (json?.ok) {
      setTenants(json.tenants || []);
    }
  };

  useEffect(() => {
    loadTenants();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return tenants;
    return tenants.filter((tenant) => {
      return (
        tenant.name.toLowerCase().includes(q) ||
        tenant.slug.toLowerCase().includes(q) ||
        tenant.id.toLowerCase().includes(q)
      );
    });
  }, [tenants, query]);

  const handleCreate = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await fetch("/api/super_admin/tenants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: name.trim(),
          slug: slugify(slug.trim() || name.trim()),
          createAdminEmail: createAdminEmail.trim() || undefined,
          modulesEnabled: defaultModules,
        }),
      });
      setName("");
      setSlug("");
      setCreateAdminEmail("");
      await loadTenants();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="mb-6">
        <h1 className="page-title">Tenants</h1>
        <p className="page-subtitle">Create and manage companies across the platform.</p>
      </div>

      <div className="card p-5">
        <div className="section-title">Create Tenant</div>
        <p className="section-subtitle">Add a new company, configure modules, and optionally seed an admin user.</p>
        <div className="filter-bar mt-4">
          <input
            className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] px-4 py-2 text-sm"
            placeholder="Company name"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (!slug) setSlug(slugify(e.target.value));
            }}
          />
          <input
            className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] px-4 py-2 text-sm"
            placeholder="Slug"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
          />
          <input
            className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] px-4 py-2 text-sm"
            placeholder="Admin email (optional)"
            value={createAdminEmail}
            onChange={(e) => setCreateAdminEmail(e.target.value)}
          />
          <button
            className="rounded-xl bg-[var(--erp-blue)] px-4 py-2 text-sm font-semibold text-white"
            disabled={saving}
            onClick={handleCreate}
          >
            {saving ? "Creating..." : "Create Tenant"}
          </button>
        </div>
      </div>

      <div className="card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="section-title">All Tenants</div>
            <p className="section-subtitle">Switch into each tenant to manage branding and modules.</p>
          </div>
          <input
            className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] px-4 py-2 text-sm"
            placeholder="Search tenants..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-left text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">
                <th className="px-4 py-3">Company</th>
                <th className="px-4 py-3">Health</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Plan</th>
                <th className="px-4 py-3">Modules</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((tenant) => (
                <tr key={tenant.id} className="border-t border-[var(--border-subtle)]">
                  <td className="px-4 py-3">
                    <div className="font-semibold">{tenant.name}</div>
                    <div className="text-xs text-[var(--text-muted)]">{tenant.slug}</div>
                  </td>
                  <td className="px-4 py-3">
                    {(() => {
                      const h = getHealthIndicator(tenant);
                      return (
                        <span title={h.title} className="inline-flex items-center gap-1.5 text-xs">
                          <span>{h.dot}</span>
                          <span className="text-[var(--text-muted)]">{h.label}</span>
                        </span>
                      );
                    })()}
                  </td>
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
                  <td className="px-4 py-3 text-sm">
                    <span className="inline-flex items-center rounded-full bg-[var(--surface-muted)] px-3 py-1 text-xs font-semibold uppercase tracking-wide">
                      {tenant.plan || "pro"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-[var(--text-muted)]">
                    {Object.entries(tenant.modulesEnabled || {})
                      .filter(([, enabled]) => enabled)
                      .slice(0, 5)
                      .map(([key]) => key)
                      .join(", ")}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      className="text-sm font-semibold text-[var(--erp-blue)]"
                      href={`/super_admin/tenants/${tenant.id}`}
                    >
                      Manage
                    </Link>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td className="px-4 py-6 text-sm text-[var(--text-muted)]" colSpan={6}>
                    No tenants found.
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
