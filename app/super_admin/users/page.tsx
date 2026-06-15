"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api/client";

type UserRecord = {
  id: string;
  displayName: string;
  email: string;
  role: string;
  tenantId: string;
  status: string;
};

type TenantOption = {
  id: string;
  name: string;
};

export default function SuperAdminUsersPage() {
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [tenants, setTenants] = useState<TenantOption[]>([]);
  const [query, setQuery] = useState("");
  const [form, setForm] = useState({
    displayName: "",
    email: "",
    role: "admin",
    tenantId: "",
  });
  const [saving, setSaving] = useState(false);

  const loadData = async () => {
    const [usersRes, tenantsRes] = await Promise.all([
      apiFetch("/api/super_admin/users", { cache: "no-store" }),
      apiFetch("/api/super_admin/tenants", { cache: "no-store" }),
    ]);
    const usersJson = await usersRes.json().catch(() => null);
    const tenantsJson = await tenantsRes.json().catch(() => null);

    if (usersJson?.ok) setUsers(usersJson.users || []);
    if (tenantsJson?.ok) {
      setTenants(
        (tenantsJson.tenants || []).map((tenant: any) => ({
          id: tenant.id,
          name: tenant.name || tenant.slug || tenant.id,
        }))
      );
      if (!form.tenantId && tenantsJson.tenants?.length) {
        setForm((prev) => ({ ...prev, tenantId: tenantsJson.tenants[0].id }));
      }
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter((user) => {
      return (
        user.displayName.toLowerCase().includes(q) ||
        user.email.toLowerCase().includes(q) ||
        user.role.toLowerCase().includes(q) ||
        user.tenantId.toLowerCase().includes(q)
      );
    });
  }, [users, query]);

  const handleCreate = async () => {
    if (!form.displayName || !form.email || !form.tenantId) return;
    setSaving(true);
    try {
      await apiFetch("/api/super_admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      setForm({ displayName: "", email: "", role: "admin", tenantId: form.tenantId });
      await loadData();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="mb-6">
        <h1 className="page-title">Platform Users</h1>
        <p className="page-subtitle">Create and manage Super Admin + tenant users.</p>
      </div>

      <div className="card p-5">
        <div className="section-title">Create User</div>
        <p className="section-subtitle">Assign tenant and role. Email is locked after create.</p>
        <div className="filter-bar mt-4">
          <input
            className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] px-4 py-2 text-sm"
            placeholder="Full name"
            value={form.displayName}
            onChange={(e) => setForm((prev) => ({ ...prev, displayName: e.target.value }))}
          />
          <input
            className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] px-4 py-2 text-sm"
            placeholder="Email"
            value={form.email}
            onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
          />
          <select
            className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] px-3 py-2 text-sm"
            value={form.role}
            onChange={(e) => setForm((prev) => ({ ...prev, role: e.target.value }))}
          >
            <option value="super_admin">super_admin</option>
            <option value="admin">admin</option>
            <option value="sales">sales</option>
            <option value="sales_manager">sales_manager</option>
            <option value="production_manager">production_manager</option>
            <option value="am_manager">am_manager</option>
            <option value="am">am</option>
            <option value="production">production</option>
            <option value="finance">finance</option>
            <option value="hr">hr</option>
          </select>
          <select
            className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] px-3 py-2 text-sm"
            value={form.tenantId}
            onChange={(e) => setForm((prev) => ({ ...prev, tenantId: e.target.value }))}
          >
            {tenants.map((tenant) => (
              <option key={tenant.id} value={tenant.id}>
                {tenant.name}
              </option>
            ))}
          </select>
          <button
            className="rounded-xl bg-[var(--erp-blue)] px-4 py-2 text-sm font-semibold text-white"
            onClick={handleCreate}
            disabled={saving}
          >
            {saving ? "Saving..." : "Create User"}
          </button>
        </div>
      </div>

      <div className="card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="section-title">Users</div>
            <p className="section-subtitle">Manage roles + tenant assignments.</p>
          </div>
          <input
            className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] px-4 py-2 text-sm"
            placeholder="Search users..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-left text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">
                <th className="px-4 py-3">User</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Tenant</th>
                <th className="px-4 py-3 text-right">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((user) => (
                <tr key={user.id} className="border-t border-[var(--border-subtle)]">
                  <td className="px-4 py-3">
                    <div className="font-semibold">{user.displayName}</div>
                    <div className="text-xs text-[var(--text-muted)]">{user.email}</div>
                  </td>
                  <td className="px-4 py-3 text-sm">{user.role}</td>
                  <td className="px-4 py-3 text-xs text-[var(--text-muted)]">{user.tenantId}</td>
                  <td className="px-4 py-3 text-right">
                    <span
                      className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${
                        user.status === "active"
                          ? "bg-[var(--erp-blue-soft)] text-[var(--erp-blue)]"
                          : "bg-red-500/10 text-red-400"
                      }`}
                    >
                      {user.status}
                    </span>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td className="px-4 py-6 text-sm text-[var(--text-muted)]" colSpan={4}>
                    No users found.
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
