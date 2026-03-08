"use client";

import { useMemo } from "react";
import { Skeleton } from "@/components/ui/Skeleton";
import { formatDate } from "@/components/finance/financeUtils";

export type SortDirection = "asc" | "desc";

export function useSortableData<T extends Record<string, any>>(items: T[], key: string, direction: SortDirection) {
  return useMemo(() => {
    const sorted = [...items];
    sorted.sort((a, b) => {
      const left = a?.[key];
      const right = b?.[key];
      if (left == null && right == null) return 0;
      if (left == null) return direction === "asc" ? -1 : 1;
      if (right == null) return direction === "asc" ? 1 : -1;
      if (typeof left === "number" && typeof right === "number") {
        return direction === "asc" ? left - right : right - left;
      }
      const leftStr = String(left).toLowerCase();
      const rightStr = String(right).toLowerCase();
      if (leftStr < rightStr) return direction === "asc" ? -1 : 1;
      if (leftStr > rightStr) return direction === "asc" ? 1 : -1;
      return 0;
    });
    return sorted;
  }, [items, key, direction]);
}

export const headerButtonStyle = {
  background: "none",
  border: "none",
  fontWeight: 700,
  cursor: "pointer",
} as const;

export function ErrorCard({ message }: { message: string }) {
  return (
    <div
      className="card"
      style={{
        borderRadius: 14,
        padding: 16,
        border: "1px solid rgba(239,68,68,0.35)",
        background: "rgba(254,226,226,0.6)",
        color: "#991b1b",
        fontWeight: 600,
      }}
    >
      {message}
    </div>
  );
}

export function KpiCard({
  title,
  value,
  subtitle,
  tone,
  loading,
}: {
  title: string;
  value: string;
  subtitle?: string;
  tone?: "warning";
  loading?: boolean;
}) {
  const showSkeleton = loading || value === "—";
  return (
    <div
      className="card kpi-card"
      style={{
        padding: 18,
        borderRadius: 16,
        border: tone === "warning" ? "1px solid rgba(248,113,113,0.25)" : undefined,
        background: tone === "warning" ? "rgba(248,113,113,0.06)" : undefined,
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>{title}</div>
      <div style={{ fontSize: 24, fontWeight: 700, marginTop: 8 }}>
        {showSkeleton ? <Skeleton variant="text" className="h-6 w-24" /> : value}
      </div>
      {subtitle &&
        (showSkeleton ? (
          <Skeleton variant="text" className="mt-2 h-3 w-32" />
        ) : (
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 6 }}>{subtitle}</div>
        ))}
    </div>
  );
}

export function CardShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="card" style={{ padding: 20, borderRadius: 18 }}>
      {children}
    </div>
  );
}

export function MiniBarChart({
  rows,
  valueFormatter,
}: {
  rows: Array<{ label: string; value: number }>;
  valueFormatter?: (value: number) => string;
}) {
  const max = Math.max(...rows.map((row) => row.value), 1);
  return (
    <div className="space-y-3">
      {rows.map((row) => (
        <div key={row.label}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 6 }}>
            <span>{row.label}</span>
            <span>{valueFormatter ? valueFormatter(row.value) : row.value.toLocaleString()}</span>
          </div>
          <div
            style={{
              height: 10,
              borderRadius: 999,
              background: "var(--chart-track)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${Math.round((row.value / max) * 100)}%`,
                height: "100%",
                borderRadius: 999,
                background: "var(--chart-fill)",
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export function ActivityRow({
  title,
  description,
  createdAt,
  type,
}: {
  title: string;
  description: string;
  createdAt?: string | null;
  type: string;
}) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 16, padding: "12px 0" }}>
      <div>
        <div style={{ fontWeight: 600 }}>{title || "Activity"}</div>
        <div style={{ fontSize: 12, color: "var(--sidebar-text)", marginTop: 4 }}>{description || "-"}</div>
        <div style={{ fontSize: 11, marginTop: 6, color: "var(--sidebar-text)" }}>{type || "system"}</div>
      </div>
      <div style={{ fontSize: 12, color: "var(--sidebar-text)", whiteSpace: "nowrap" }}>
        {formatDate(createdAt || undefined)}
      </div>
    </div>
  );
}
