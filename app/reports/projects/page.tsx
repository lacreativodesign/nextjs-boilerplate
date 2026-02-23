"use client";

export default function ReportsProjectsPage() {
  return (
    <div className="card p-6 space-y-4">
      <h2 className="text-lg font-bold text-[var(--text-primary)]">
        Project Reports
      </h2>
      <p className="text-sm text-[var(--text-muted)]">
        Delivery timelines, milestones, and change request analysis.
      </p>
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          "On-Time Delivery",
          "Change Requests",
          "Projects Completed",
        ].map((label) => (
          <div
            key={label}
            className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-5"
          >
            <p className="text-sm text-[var(--text-muted)]">{label}</p>
            <p className="mt-2 text-3xl font-bold text-[var(--text-primary)]">—</p>
          </div>
        ))}
      </div>
    </div>
  );
}
