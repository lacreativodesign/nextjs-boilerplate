"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

type KPIs = {
  assigned: number;
  active: number;
  dueSoon: number;
  qaQueue: number;
};

type QueueItem = {
  id: string;
  projectName?: string;
  clientName?: string;
  stage?: string;
  priority?: string;
  dueDate?: string | null;
};

export default function ProductionPage() {
  const [kpis, setKpis] = useState<KPIs | null>(null);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/production/overview", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) {
          setKpis(d.kpis);
          setQueue(d.myQueueTop10 ?? []);
        } else {
          setError(d.error || "Failed to load");
        }
      })
      .catch(() => setError("Network error"))
      .finally(() => setLoading(false));
  }, []);

  const fmt = (n: number) => n.toLocaleString();

  const cards = [
    { label: "Assigned", value: kpis ? fmt(kpis.assigned) : "—" },
    { label: "Active", value: kpis ? fmt(kpis.active) : "—" },
    { label: "Due Soon", value: kpis ? fmt(kpis.dueSoon) : "—" },
    { label: "QA Queue", value: kpis ? fmt(kpis.qaQueue) : "—" },
  ];

  const stageColor: Record<string, string> = {
    Draft:
      "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
    Review: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
    Revisions:
      "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
    Final:
      "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
  };

  return (
    <div className="space-y-6">
      {error && (
        <div className="card border-red-200 bg-red-50 text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300">
          {error}
        </div>
      )}

      {/* KPI Cards */}
      <div className="kpis">
        {cards.map((c) => (
          <div key={c.label} className="card">
            <div className="helper-text mb-2">{c.label}</div>
            {loading ? (
              <div className="skeleton h-9 w-24 rounded" />
            ) : (
              <div className="text-3xl font-bold">{c.value}</div>
            )}
          </div>
        ))}
      </div>

      {/* My Queue */}
      {!loading && queue.length > 0 && (
        <div className="card overflow-hidden p-0">
          <div className="border-b border-[var(--border-subtle)] px-5 py-4">
            <h3 className="font-semibold text-[var(--text-primary)]">My Queue</h3>
          </div>
          <div className="divide-y divide-[var(--border-subtle)]">
            {queue.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between gap-4 px-5 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-[var(--text-primary)]">
                    {item.projectName || "Untitled"}
                  </p>
                  <p className="truncate text-xs text-[var(--text-muted)]">
                    {item.clientName}
                  </p>
                </div>
                <div className="flex flex-shrink-0 items-center gap-2">
                  {item.stage && (
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        stageColor[item.stage] ??
                        "bg-[var(--surface-muted)] text-[var(--text-muted)]"
                      }`}
                    >
                      {item.stage}
                    </span>
                  )}
                  {item.dueDate && (
                    <span className="text-xs text-[var(--text-muted)]">
                      {new Date(item.dueDate).toLocaleDateString()}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Module Links */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { title: "Jobs", href: "/production/jobs", desc: "Active job queue." },
          {
            title: "Workload",
            href: "/production/workload",
            desc: "Team capacity.",
          },
          { title: "QA", href: "/production/qa", desc: "Quality review." },
          { title: "Files", href: "/production/files", desc: "Deliverables." },
        ].map((i) => (
          <Link
            key={i.href}
            href={i.href}
            className="group rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-5 transition-all hover:border-[var(--erp-blue)]"
          >
            <p className="font-semibold text-[var(--text-primary)] group-hover:text-[var(--erp-blue)]">
              {i.title}
            </p>
            <p className="mt-1 text-sm text-[var(--text-muted)]">{i.desc}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
