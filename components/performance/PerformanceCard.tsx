"use client";

import ProgressBar from "@/components/performance/ProgressBar";

type PerformanceCardProps = {
  metricKey: string;
  label: string;
  actual: number;
  target: number;
  unit: "USD" | "count" | "%";
  trend?: number | null;
};

function formatValue(actual: number, unit: "USD" | "count" | "%") {
  if (unit === "USD") {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(actual);
  }
  if (unit === "%") return `${actual.toFixed(1)}%`;
  return actual.toLocaleString();
}

export default function PerformanceCard({ label, actual, target, unit, trend }: PerformanceCardProps) {
  return (
    <div className="card p-5 space-y-3">
      <p className="text-xs uppercase tracking-wide text-[var(--text-muted)]">{label}</p>
      <p className="text-3xl font-bold text-[var(--text-primary)]">{formatValue(actual, unit)}</p>
      <ProgressBar label={label} actual={actual} target={target} unit={unit} size="md" />
      {typeof trend === "number" && (
        <p className={`text-xs ${trend >= 0 ? "text-green-600" : "text-red-600"}`}>
          {trend >= 0 ? "+" : ""}
          {trend.toFixed(1)}% vs last period
        </p>
      )}
    </div>
  );
}
