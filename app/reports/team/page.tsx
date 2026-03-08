"use client";

import { useEffect, useState } from "react";

type TeamStats = {
  activeEmployeesCount: number;
  onboardingOpenCount: number;
};

export default function ReportsTeamPage() {
  const [stats, setStats] = useState<TeamStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/overview", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) {
          setStats({
            activeEmployeesCount: d.people?.activeEmployeesCount ?? 0,
            onboardingOpenCount: d.people?.onboardingOpenCount ?? 0,
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
    {
      label: "Active Employees",
      value: stats ? fmt(stats.activeEmployeesCount) : "—",
    },
    { label: "Open Onboarding", value: stats ? fmt(stats.onboardingOpenCount) : "—" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-[var(--text-primary)]">Team Reports</h1>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Headcount, onboarding pipeline, and team performance overview.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
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
