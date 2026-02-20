import { Suspense } from "react";

const kpiCards = [
  { label: "Active Projects", value: "—", sub: "Across all clients" },
  { label: "Open Invoices", value: "—", sub: "Pending payment" },
  { label: "Team Members", value: "—", sub: "Active users" },
  { label: "Leads This Month", value: "—", sub: "In pipeline" },
];

function ActivityOverviewPlaceholder() {
  return (
    <div
      className="rounded-xl border border-[var(--border-subtle)]
        bg-[var(--surface-card)] p-6"
    >
      <p className="mb-1 text-sm font-semibold text-[var(--text-primary)]">
        Activity Overview
      </p>
      <p className="text-xs text-[var(--text-muted)]">Connect data sources to populate charts.</p>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <div className="mb-6">
        <h1 className="page-title">Overview</h1>
        <p className="page-subtitle">Platform-wide snapshot across all operations.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpiCards.map((card) => (
          <div
            key={card.label}
            className="rounded-xl border border-[var(--border-subtle)]
            bg-[var(--surface-card)] p-5"
          >
            <p className="text-sm text-[var(--text-muted)]">{card.label}</p>
            <p className="mt-2 text-3xl font-bold text-[var(--text-primary)]">{card.value}</p>
            <p className="mt-1 text-xs text-[var(--text-soft)]">{card.sub}</p>
          </div>
        ))}
      </div>

      <Suspense fallback={<ActivityOverviewPlaceholder />}>
        <ActivityOverviewPlaceholder />
      </Suspense>
    </div>
  );
}
