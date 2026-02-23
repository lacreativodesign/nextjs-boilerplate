"use client";
import Link from "next/link";
export default function AmManagerPage() {
  return (
    <div className="space-y-6">
      <div className="kpis">
        {["Total Clients","Active Projects","Team Members","At Risk Projects"].map(l => (
          <div key={l} className="card">
            <div className="helper-text mb-2">{l}</div>
            <div className="text-3xl font-bold">—</div>
          </div>
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {[
          {title:"Clients",href:"/clients",desc:"All client accounts under management."},
          {title:"Projects",href:"/projects",desc:"Pipeline and delivery status."},
          {title:"Team Performance",href:"/hr/performance",desc:"AM team KPIs."},
        ].map(i => (
          <Link key={i.href} href={i.href}
            className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-5 hover:border-[var(--erp-blue)] transition-all group">
            <p className="font-semibold text-[var(--text-primary)] group-hover:text-[var(--erp-blue)]">{i.title}</p>
            <p className="mt-1 text-sm text-[var(--text-muted)]">{i.desc}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
