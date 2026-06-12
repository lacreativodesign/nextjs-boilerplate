"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import TeamList from "@/components/manager/TeamList";

type Health = {
  activeClients: number;
  projectsAtRisk: number;
  changeRequestsMtd: number;
};

export default function AmManagerPage() {
  const [health, setHealth] = useState<Health | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/am_manager/overview", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) setHealth(d.health);
        else setError(d.error || "Failed to load");
      })
      .catch(() => setError("Network error"))
      .finally(() => setLoading(false));
  }, []);

  const fmt = (n: number) => n.toLocaleString();
  const cards = [
    { label: "Total Clients", value: health ? fmt(health.activeClients) : "—" },
    { label: "Projects At Risk", value: health ? fmt(health.projectsAtRisk) : "—" },
    { label: "Change Requests MTD", value: health ? fmt(health.changeRequestsMtd) : "—" },
    { label: "Team Members", value: "—" },
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
          { title: "Clients", href: "/clients", desc: "All client accounts under management." },
          { title: "Projects", href: "/projects", desc: "Pipeline and delivery status." },
          { title: "Team Performance", href: "/hr/performance", desc: "AM team KPIs." },
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

      <TeamList endpoint="/api/am_manager/team" title="My Account Managers" />
    </div>
  );
}
