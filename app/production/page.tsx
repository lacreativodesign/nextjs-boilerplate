"use client";
import Link from "next/link";
export default function ProductionPage() {
  return (
    <div className="space-y-6">
      <div className="kpis">
        {["Active Jobs","Due Today","Overdue","Delivered This Month"].map(l => (
          <div key={l} className="card">
            <div className="helper-text mb-2">{l}</div>
            <div className="text-3xl font-bold">—</div>
          </div>
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {[
          {title:"Jobs",href:"/production/jobs",desc:"Active job queue."},
          {title:"Workload",href:"/production/workload",desc:"Team capacity."},
          {title:"QA",href:"/production/qa",desc:"Quality review."},
          {title:"Files",href:"/production/files",desc:"Deliverables."},
        ].map(i=>(
          <Link key={i.href} href={i.href} className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-5 hover:border-[var(--erp-blue)] transition-all group">
            <p className="font-semibold text-[var(--text-primary)] group-hover:text-[var(--erp-blue)]">{i.title}</p>
            <p className="mt-1 text-sm text-[var(--text-muted)]">{i.desc}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
