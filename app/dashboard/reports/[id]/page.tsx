"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { ReportFilters } from "@/components/reports/ReportFilters";
import type { Report, ReportFilter } from "@/types/reports";

const ReportViewer = dynamic(
  () => import("@/components/reports/ReportViewer").then((module) => module.ReportViewer),
  {
    ssr: false,
    loading: () => <div className="mt-6 text-sm text-[var(--text-muted)]">Loading chart module...</div>,
  },
);

export default function ReportDetailPage({ params }: { params: { id: string } }) {
  const [report, setReport] = useState<Report | null>(null);
  const [data, setData] = useState<any[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState<ReportFilter[]>([]);
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);
  const [executedAt, setExecutedAt] = useState<string | null>(null);

  useEffect(() => {
    fetchReport();
  }, [params.id]);

  const fetchReport = async () => {
    const response = await fetch(`/api/reports/${params.id}`);
    const data = await response.json();
    setReport(data);
    setFilters(data.filters || []);
    executeReport(data.filters || []);
  };

  const executeReport = async (customFilters?: ReportFilter[], options?: { append?: boolean; pageToken?: string | null }) => {
    setLoading(true);
    const response = await fetch(`/api/reports/${params.id}/execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        filters: customFilters || filters,
        pageToken: options?.pageToken ?? null,
        pageSize: 200,
      }),
    });
    const result = await response.json();
    const incoming = result.data || [];
    setData((prev) => (options?.append && prev ? [...prev, ...incoming] : incoming));
    setNextPageToken(result.metadata?.nextPageToken || null);
    setExecutedAt(result.metadata?.executedAt || null);
    setLoading(false);
  };

  const exportReport = async (format: "csv" | "json") => {
    const response = await fetch(`/api/reports/${params.id}/execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        filters,
        export: format,
      }),
    });

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `report-${params.id}.${format}`;
    a.click();
  };

  const printReport = () => {
    window.print();
  };

  if (!report) return <div className="p-6">Loading...</div>;

  return (
    <div className="p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">{report.name}</h1>
          {report.description ? <p className="text-sm text-[var(--text-muted)]">{report.description}</p> : null}
          {executedAt ? (
            <p className="mt-1 text-xs text-[var(--text-muted)]">Last run: {new Date(executedAt).toLocaleString()}</p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => executeReport()}
            className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Run Report
          </button>
          <button
            type="button"
            onClick={() => exportReport("csv")}
            className="rounded bg-neutral-200 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-300 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
          >
            Export CSV
          </button>
          <button
            type="button"
            onClick={() => exportReport("json")}
            className="rounded bg-neutral-200 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-300 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
          >
            Export JSON
          </button>
          <button
            type="button"
            onClick={printReport}
            className="rounded bg-neutral-200 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-300 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
          >
            Export PDF
          </button>
        </div>
      </div>

      <div className="mt-6">
        <ReportFilters filters={filters} onChange={setFilters} onApply={() => executeReport(filters)} />
      </div>

      {loading ? (
        <div className="mt-6 text-sm text-[var(--text-muted)]">Running report...</div>
      ) : data ? (
        <div className="space-y-4">
          <ReportViewer data={data} chartType={report.chartType} chartConfig={report.chartConfig} />
          {nextPageToken ? (
            <button
              type="button"
              onClick={() => executeReport(filters, { append: true, pageToken: nextPageToken })}
              className="rounded border border-neutral-200 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
            >
              Load More
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
