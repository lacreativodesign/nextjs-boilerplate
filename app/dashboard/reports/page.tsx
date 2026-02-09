"use client";

import { useEffect, useState } from "react";
import { ReportCard } from "@/components/reports/ReportCard";
import { CreateReportDialog } from "@/components/reports/CreateReportDialog";
import type { Report } from "@/types/reports";

export default function ReportsPage() {
  const [reports, setReports] = useState<Report[]>([]);
  const [category, setCategory] = useState("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchReports();
  }, [category]);

  const fetchReports = async () => {
    setLoading(true);
    const params = new URLSearchParams({
      includePresets: "true",
      ...(category !== "all" && { category }),
    });

    const response = await fetch(`/api/reports?${params.toString()}`);
    const data = await response.json();
    setReports(data.reports || []);
    setLoading(false);
  };

  const categories = [
    { id: "all", label: "All Reports" },
    { id: "financial", label: "Financial" },
    { id: "sales", label: "Sales" },
    { id: "operations", label: "Operations" },
    { id: "inventory", label: "Inventory" },
    { id: "hr", label: "HR" },
    { id: "custom", label: "Custom" },
  ];

  return (
    <div className="p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">Reports & Analytics</h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">Run preset insights or build custom dashboards.</p>
        </div>
        <CreateReportDialog onSuccess={fetchReports} />
      </div>

      <div className="mt-6 flex flex-wrap gap-2 border-b border-neutral-200 dark:border-neutral-800">
        {categories.map((cat) => (
          <button
            key={cat.id}
            onClick={() => setCategory(cat.id)}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              category === cat.id
                ? "border-b-2 border-blue-600 text-blue-600"
                : "text-neutral-600 hover:text-neutral-900 dark:text-neutral-300 dark:hover:text-white"
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="mt-6 text-sm text-[var(--text-muted)]">Loading reports...</div>
      ) : reports.length === 0 ? (
        <div className="mt-6 text-sm text-[var(--text-muted)]">No reports found.</div>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {reports.map((report) => (
            <ReportCard
              key={report.id}
              report={report}
              onRun={() => {
                window.location.href = `/dashboard/reports/${report.id}`;
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
