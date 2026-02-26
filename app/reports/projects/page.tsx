"use client";

import { useEffect, useState } from "react";

type ProjectStats = {
  totalProjects: number;
  deliveredOnTime: number;
  openChangeRequests: number;
  overdueProjects: number;
};

export default function ReportsProjectsPage() {
  const [stats, setStats] = useState<ProjectStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/overview", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) {
          setStats({
            totalProjects: d.ops?.activeProjectsCount ?? 0,
            deliveredOnTime: 0,
            openChangeRequests: d.ops?.openChangeRequestsCount ?? 0,
            overdueProjects: d.ops?.overdueProjectsCount ?? 0,
          });
        } else {
          setError(d.error || "Failed to load");
        }
      })
      .catch(() => setError("Network error"))
      .finally(() => setLoading(false));
  }, []);

  const fmt = (n: number) => n.toLocaleString();

  const cards = [
    { label: "Active Projects", value: stats ? fmt(stats.totalProjects) : "—" },
    {
      label: "Open Change Requests",
      value: stats ? fmt(stats.openChangeRequests) : "—",
    },
    { label: "Overdue Projects", value: stats ? fmt(stats.overdueProjects) : "—" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-[var(--text-primary)]">Project Reports</h1>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Delivery timelines, milestones, and change request analysis.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        {cards.map((c) => (
          <div
            key={c.label}
            className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-5"
          >
            <p className="text-sm text-[var(--text-muted)]">{c.label}</p>
            {loading ? (
              <div className="skeleton mt-2 h-9 w-20 rounded" />
            ) : (
              <p className="mt-2 text-3xl font-bold text-[var(--text-primary)]">{c.value}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
