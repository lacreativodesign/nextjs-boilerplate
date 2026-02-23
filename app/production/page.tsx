"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

type ProdStats = {
  totalActive: number;
  dueToday: number;
  overdue: number;
  deliveredThisMonth: number;
};

function StatCard({ label, value, sub, href, color }: {
  label: string; value: string | number; sub: string; href?: string; color?: string;
}) {
  const inner = (
    <div className={`card ${href ? "cursor-pointer hover:border-[var(--erp-blue)] transition-all group" : ""}`}>
      <div className="helper-text mb-2">{label}</div>
      <div className="text-3xl font-bold group-hover:text-[var(--erp-blue)]"
        style={{ color: color || "var(--text-primary)" }}>
        {value}
      </div>
      <div className="mt-1 text-xs text-[var(--text-muted)]">{sub}</div>
    </div>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}

export default function ProductionPage() {
  const [data, setData] = useState<ProdStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/admin/production/overview", { credentials: "include" })
      .then(r => r.json())
      .then(res => {
        if (res.ok) {
          const o = res.overview || {};
          const projects = o.projects || [];
          const now = new Date();
          const todayStr = now.toISOString().slice(0, 10);
          const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

          const activeStages = ["Draft", "Review", "Revisions", "Final"];
          const active = projects.filter((p: any) => activeStages.includes(p.stage));
          const dueToday = active.filter((p: any) => {
            const due = p.dueDate ? new Date(p.dueDate).toISOString().slice(0, 10) : null;
            return due === todayStr;
          });
          const overdue = active.filter((p: any) => {
            const due = p.dueDate ? new Date(p.dueDate) : null;
            return due && due < now;
          });
          const delivered = projects.filter((p: any) => {
            if (p.stage !== "Delivered") return false;
            const updated = p.updatedAt ? new Date(p.updatedAt) : null;
            return updated && updated >= startOfMonth;
          });

          setData({
            totalActive: active.length,
            dueToday: dueToday.length,
            overdue: overdue.length,
            deliveredThisMonth: delivered.length,
          });
        } else {
          setError(res.error || "Failed to load production data");
        }
      })
      .catch(() => setError("Failed to load production data"))
      .finally(() => setLoading(false));
  }, []);

  const v = (val: any) => loading ? "..." : val;

  return (
    <div className="space-y-6">
      <div className="kpis">
        <StatCard label="Active Jobs" value={v(data?.totalActive ?? 0)}
          sub="In progress" href="/production/jobs" color="#3b82f6" />
        <StatCard label="Due Today" value={v(data?.dueToday ?? 0)}
          sub="Need delivery today"
          color={data?.dueToday ? "#f59e0b" : undefined} />
        <StatCard label="Overdue" value={v(data?.overdue ?? 0)}
          sub="Past due date"
          color={data?.overdue ? "#ef4444" : undefined} />
        <StatCard label="Delivered (Month)" value={v(data?.deliveredThisMonth ?? 0)}
          sub="Completed this month" color="#10b981" />
      </div>

      {error && <div className="card p-4 text-red-400 text-sm">{error}</div>}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {[
          { title: "Jobs", href: "/production/jobs", desc: "All active and queued jobs." },
          { title: "Workload", href: "/production/workload", desc: "Team capacity and assignment." },
          { title: "QA", href: "/production/qa", desc: "Quality review and approvals." },
          { title: "Files", href: "/production/files", desc: "Deliverable file management." },
        ].map(item => (
          <Link key={item.href} href={item.href}
            className="rounded-xl border border-[var(--border-subtle)]
              bg-[var(--surface-card)] p-5
              hover:border-[var(--erp-blue)] transition-all group">
            <p className="font-semibold text-[var(--text-primary)]
              group-hover:text-[var(--erp-blue)]">{item.title}</p>
            <p className="mt-1 text-sm text-[var(--text-muted)]">{item.desc}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
