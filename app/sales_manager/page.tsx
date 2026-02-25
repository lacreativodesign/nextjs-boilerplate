"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

type KPIs = {
  newLeads30d: number;
  activeDeals: number;
  revenueClosed: number;
  closedWonMonth: number;
};

export default function SalesManagerPage() {
  const [kpis, setKpis] = useState<KPIs | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/sales_manager/overview", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) setKpis(d.kpis);
        else setError(d.error || "Failed to load");
      })
      .catch(() => setError("Network error"))
      .finally(() => setLoading(false));
  }, []);

  const fmt = (n: number) => n.toLocaleString();
  const fmtCurrency = (n: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(n);

  const cards = [
    { label: "New Leads (30d)", value: kpis ? fmt(kpis.newLeads30d) : "—" },
    { label: "Active Deals", value: kpis ? fmt(kpis.activeDeals) : "—" },
    { label: "Revenue Closed", value: kpis ? fmtCurrency(kpis.revenueClosed) : "—" },
    { label: "Closed This Month", value: kpis ? fmt(kpis.closedWonMonth) : "—" },
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
          { title: "Sales Pipeline", href: "/sales", desc: "Full team pipeline overview." },
          { title: "Targets", href: "/sales/targets", desc: "Set and track monthly targets." },
          { title: "Team Performance", href: "/hr/performance", desc: "Sales KPI reviews." },
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
    </div>
  );
}
