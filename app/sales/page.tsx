"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

type SalesStats = {
  totalLeads: number;
  activeDeals: number;
  pipelineValue: number;
  closedWonThisMonth: number;
  conversionRate: number;
};

const fmt = (n: number) =>
  n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${n.toFixed(0)}`;

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

export default function SalesPage() {
  const [data, setData] = useState<SalesStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/admin/sales/overview", { credentials: "include" })
      .then(r => r.json())
      .then(res => {
        if (res.ok) {
          const o = res.overview || {};
          setData({
            totalLeads: o.totalLeads ?? 0,
            activeDeals: o.activeDeals ?? 0,
            pipelineValue: o.pipelineValue ?? 0,
            closedWonThisMonth: o.closedWonThisMonth ?? 0,
            conversionRate: o.conversionRate ?? 0,
          });
        } else {
          setError(res.error || "Failed to load sales data");
        }
      })
      .catch(() => setError("Failed to load sales data"))
      .finally(() => setLoading(false));
  }, []);

  const v = (val: any) => loading ? "..." : val;

  return (
    <div className="space-y-6">
      <div className="kpis">
        <StatCard label="Total Leads" value={v(data?.totalLeads ?? 0)}
          sub="All time" href="/sales/leads" />
        <StatCard label="Active Deals" value={v(data?.activeDeals ?? 0)}
          sub="In pipeline" href="/sales/deals" color="#3b82f6" />
        <StatCard label="Pipeline Value" value={v(fmt(data?.pipelineValue ?? 0))}
          sub="Open deals total" color="#10b981" />
        <StatCard label="Closed Won (Month)" value={v(data?.closedWonThisMonth ?? 0)}
          sub="This month" color="#10b981" />
        <StatCard label="Conversion Rate"
          value={v(`${(data?.conversionRate ?? 0).toFixed(1)}%`)}
          sub="Leads to closed" />
      </div>

      {error && <div className="card p-4 text-red-400 text-sm">{error}</div>}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {[
          { title: "Leads", href: "/sales/leads", desc: "All leads and prospecting." },
          { title: "Deals", href: "/sales/deals", desc: "Active and closed deals." },
          { title: "Pipeline", href: "/sales/pipeline", desc: "Visual pipeline board." },
          { title: "Follow-ups", href: "/sales/follow-ups", desc: "Scheduled follow-ups." },
          { title: "Targets", href: "/sales/targets", desc: "Monthly revenue targets." },
          { title: "Campaigns", href: "/sales/campaigns", desc: "Marketing campaigns." },
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
