"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

type KPIs = {
  activeProjects: number;
  reviewProjects: number;
  openChangeRequests: number;
  unreadNotifications: number;
};

export default function AmPage() {
  const [kpis, setKpis] = useState<KPIs | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/am/overview", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) setKpis(d.kpis);
        else setError(d.error || "Failed to load");
      })
      .catch(() => setError("Network error"))
      .finally(() => setLoading(false));
  }, []);

  const fmt = (n: number) => n.toLocaleString();
  const cards = [
    { label: "My Active Projects", value: kpis ? fmt(kpis.activeProjects) : "—" },
    { label: "In Review", value: kpis ? fmt(kpis.reviewProjects) : "—" },
    { label: "Open Change Requests", value: kpis ? fmt(kpis.openChangeRequests) : "—" },
    { label: "Notifications", value: kpis ? fmt(kpis.unreadNotifications) : "—" },
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
          { title: "Clients", href: "/clients", desc: "Your assigned client accounts." },
          { title: "Projects", href: "/projects", desc: "Active project delivery." },
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
