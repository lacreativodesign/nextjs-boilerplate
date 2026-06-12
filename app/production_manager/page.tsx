"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import TeamList from "@/components/manager/TeamList";

type Workload = {
  openProjects: number;
  draftsPendingReview: number;
  revisionsInProgress: number;
  overdueItems: number;
};

export default function ProductionManagerPage() {
  const [workload, setWorkload] = useState<Workload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/production_manager/overview", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) setWorkload(d.workload);
        else setError(d.error || "Failed to load");
      })
      .catch(() => setError("Network error"))
      .finally(() => setLoading(false));
  }, []);

  const fmt = (n: number) => n.toLocaleString();
  const cards = [
    { label: "Active Jobs", value: workload ? fmt(workload.openProjects) : "—" },
    { label: "Drafts Pending Review", value: workload ? fmt(workload.draftsPendingReview) : "—" },
    { label: "Revisions In Progress", value: workload ? fmt(workload.revisionsInProgress) : "—" },
    { label: "Overdue", value: workload ? fmt(workload.overdueItems) : "—" },
  ];

  return (
    <div className="space-y-6">
      {error && (
        <div className="card p-4 text-sm text-red-400">
          {error}
        </div>
      )}

      <div className="kpis">
        {cards.map((c) => (
          <div key={c.label} className="card">
            <div className="helper-text mb-2">{c.label}</div>
            <div className="text-3xl font-bold">
              {loading ? <span className="text-[var(--text-muted)]">…</span> : c.value}
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {[
          { title: "Production", href: "/production", desc: "Jobs, workload and QA." },
          { title: "Team Performance", href: "/hr/performance", desc: "Production KPIs." },
        ].map((i) => (
          <Link
            key={i.href}
            href={i.href}
            className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-5 transition-all hover:border-[var(--erp-blue)] group"
          >
            <p className="font-semibold text-[var(--text-primary)] group-hover:text-[var(--erp-blue)]">{i.title}</p>
            <p className="mt-1 text-sm text-[var(--text-muted)]">{i.desc}</p>
          </Link>
        ))}
      </div>

      <TeamList endpoint="/api/production_manager/team" title="My Production Team" />
    </div>
  );
}
