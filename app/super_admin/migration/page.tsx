"use client";

import { useState } from "react";

export default function SuperAdminMigrationPage() {
  const [tenantId, setTenantId] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const triggerMigration = async () => {
    setLoading(true);
    setStatus(null);
    try {
      const res = await fetch("/api/super_admin/migration", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ tenantId: tenantId || undefined }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        setStatus(json?.error || "Migration blocked.");
        return;
      }
      setStatus("Migration completed in development.");
    } catch (err) {
      setStatus((err instanceof Error ? err.message : undefined) || "Migration failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="mb-6">
        <h1 className="page-title">Tenant Migration</h1>
        <p className="page-subtitle">Backfill tenantId on legacy documents safely.</p>
      </div>

      <div className="card p-6 space-y-4">
        <div className="section-title">Run Migration</div>
        <p className="section-subtitle">Only enabled in development. Production uses the CLI script.</p>
        <div className="filter-bar">
          <input
            className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] px-4 py-2 text-sm"
            placeholder="Tenant ID (optional)"
            value={tenantId}
            onChange={(e) => setTenantId(e.target.value)}
          />
          <button
            className="rounded-xl bg-[var(--erp-blue)] px-4 py-2 text-sm font-semibold text-white"
            onClick={triggerMigration}
            disabled={loading}
          >
            {loading ? "Running..." : "Run Migration"}
          </button>
        </div>
        {status && <div className="text-sm text-[var(--text-muted)]">{status}</div>}
      </div>
    </div>
  );
}
