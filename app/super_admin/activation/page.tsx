"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api/client";
import { CheckCircle, Circle } from "lucide-react";

type Stage = { id: string; title: string; count: number; pct: number };
type TenantRow = {
  id: string;
  name: string;
  createdAt: string | null;
  milestones: Record<string, boolean>;
  progress: number;
};
type FunnelData = { totalTenants: number; stages: Stage[]; tenants: TenantRow[] };

export default function ActivationFunnelPage() {
  const [data, setData] = useState<FunnelData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void apiFetch("/api/super_admin/activation-funnel", { cache: "no-store" })
      .then((res) =>
        res.ok ? res.json() : Promise.reject(new Error(`Request failed (${res.status})`))
      )
      .then((payload) => {
        if (active) setData(payload);
      })
      .catch((e) => {
        if (active) setError(e instanceof Error ? e.message : "Failed to load");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  if (loading)
    return <div className="p-6 text-[var(--text-muted)]">Loading activation funnel…</div>;
  if (error)
    return <div className="p-6 text-[var(--text-muted)]">Unable to load: {error}</div>;
  if (!data) return null;

  return (
    <div className="space-y-6">
      <div className="mb-2">
        <h1 className="page-title">Activation Funnel</h1>
        <p className="page-subtitle">
          {data.totalTenants} tenant{data.totalTenants === 1 ? "" : "s"} — how far each has
          progressed.
        </p>
      </div>

      <div className="card p-6">
        <ul className="space-y-3">
          {data.stages.map((s) => (
            <li key={s.id}>
              <div className="mb-1 flex items-center justify-between text-sm">
                <span className="text-[var(--text-primary)]">{s.title}</span>
                <span className="text-[var(--text-muted)]">
                  {s.count}/{data.totalTenants} ({s.pct}%)
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--surface-muted,#f1f5f9)]">
                <div
                  className="h-full rounded-full bg-[var(--erp-blue)] transition-all"
                  style={{ width: `${s.pct}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border-subtle)] text-left text-[var(--text-muted)]">
              <th className="p-3">Tenant</th>
              {data.stages.map((s) => (
                <th key={s.id} className="p-3 text-center">
                  {s.title}
                </th>
              ))}
              <th className="p-3 text-right">Progress</th>
            </tr>
          </thead>
          <tbody>
            {data.tenants.map((t) => (
              <tr key={t.id} className="border-b border-[var(--border-subtle)]">
                <td className="p-3 font-medium text-[var(--text-primary)]">{t.name}</td>
                {data.stages.map((s) => (
                  <td key={s.id} className="p-3 text-center">
                    {t.milestones[s.id] ? (
                      <CheckCircle className="mx-auto h-4 w-4 text-[var(--erp-green,#16a34a)]" />
                    ) : (
                      <Circle className="mx-auto h-4 w-4 text-[var(--text-muted)]" />
                    )}
                  </td>
                ))}
                <td className="p-3 text-right text-[var(--text-muted)]">{t.progress}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
