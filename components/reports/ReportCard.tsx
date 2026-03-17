"use client";

import type { Report } from "@/types/reports";

export function ReportCard({ report, onRun }: { report: Report | any; onRun: () => void }) {
  return (
    <div className="card flex h-full flex-col justify-between gap-4 p-5">
      <div>
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="text-lg font-semibold text-[var(--text-primary)]">{report.name}</h3>
            {report.description ? (
              <p className="mt-1 text-sm text-[var(--text-muted)]">{report.description}</p>
            ) : null}
          </div>
          <span className="rounded-full bg-[var(--surface-muted)] px-2 py-1 text-xs font-medium text-[var(--text-muted)]">
            {report.type === "preset" ? "Preset" : "Custom"}
          </span>
        </div>
        <div className="mt-4 flex flex-wrap gap-2 text-xs text-[var(--text-muted)]">
          <span className="rounded-full bg-[var(--erp-blue-soft)] px-2 py-1 text-[var(--erp-blue)]">
            {report.category}
          </span>
          <span className="rounded-full bg-[var(--surface-muted)] px-2 py-1 text-[var(--text-muted)]">
            {report.dataSource}
          </span>
          {report.isScheduled ? (
            <span className="rounded-full bg-emerald-50 px-2 py-1 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-200">
              Scheduled
            </span>
          ) : null}
        </div>
      </div>
      <button
        type="button"
        onClick={onRun}
        className="btn w-full"
      >
        View Report
      </button>
    </div>
  );
}
