"use client";

import { useEffect, useState } from "react";

type PerfData = {
  openProjects: number;
  draftsPendingReview: number;
  revisionsInProgress: number;
  overdueItems: number;
};

export default function ProductionManagerPerformancePage() {
  const [data, setData] = useState<PerfData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/production_manager/overview", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) setData(d.workload);
        else setError(d.error || "Failed to load");
      })
      .catch(() => setError("Network error"))
      .finally(() => setLoading(false));
  }, []);

  const fmt = (n: number) => n.toLocaleString();

  const metrics = data
    ? [
        {
          label: "Open Projects",
          value: fmt(data.openProjects),
          sub: "Total active projects",
        },
        {
          label: "Drafts Pending Review",
          value: fmt(data.draftsPendingReview),
          sub: "Awaiting review",
        },
        {
          label: "Revisions In Progress",
          value: fmt(data.revisionsInProgress),
          sub: "Currently being revised",
        },
        {
          label: "Overdue Items",
          value: fmt(data.overdueItems),
          sub: "Past due date",
        },
      ]
    : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-[var(--text-primary)]">My Performance</h1>
        <p className="text-sm text-[var(--text-muted)] mt-1">
          Production workload and delivery status
        </p>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-4 text-sm text-red-700 dark:text-red-400">
          {error}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {loading
          ? Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="card p-5 space-y-3">
                <div className="skeleton h-4 w-32 rounded" />
                <div className="skeleton h-9 w-24 rounded" />
                <div className="skeleton h-3 w-40 rounded" />
              </div>
            ))
          : metrics.map((m) => (
              <div key={m.label} className="card p-5">
                <p className="helper-text">{m.label}</p>
                <p className="text-3xl font-bold text-[var(--text-primary)] mt-1">{m.value}</p>
                <p className="text-xs text-[var(--text-muted)] mt-1">{m.sub}</p>
              </div>
            ))}
      </div>
    </div>
  );
}
