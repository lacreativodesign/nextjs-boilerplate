"use client";

import React, { useEffect, useState } from "react";
import { SkeletonChart } from "@/components/ui/skeleton";
import { ErrorBoundary } from "@/components/errors/ErrorBoundary";

export const CHART_COLORS = [
  "var(--chart-series-1)",
  "var(--chart-series-2)",
  "var(--chart-series-3)",
  "var(--chart-series-4)",
  "var(--chart-series-5)",
  "var(--chart-series-6)",
];

export const chartAxisProps = {
  tick: { fill: "var(--text-muted)", fontSize: 11 },
  tickLine: { stroke: "var(--border-subtle)" },
  axisLine: { stroke: "var(--border-subtle)" },
} as const;

export const chartGridProps = {
  stroke: "var(--border-subtle)",
  strokeDasharray: "3 3",
  opacity: 0.3,
} as const;

export const chartTooltipProps = {
  contentStyle: {
    background: "var(--surface-elevated)",
    border: "1px solid var(--border-subtle)",
    borderRadius: 10,
    boxShadow: "var(--shadow-sm)",
    color: "var(--text-primary)",
    fontSize: 12,
    padding: "8px 10px",
  },
  labelStyle: { color: "var(--text-muted)", fontSize: 11, marginBottom: 4 },
  itemStyle: { color: "var(--text-primary)", fontSize: 12 },
  cursor: { stroke: "var(--border-strong)", strokeDasharray: "4 4" },
} as const;

export function useChartAnimation(duration = 800) {
  const [isAnimationActive, setIsAnimationActive] = useState(true);

  useEffect(() => {
    const timer = window.setTimeout(() => setIsAnimationActive(false), 0);
    return () => window.clearTimeout(timer);
  }, []);

  return {
    isAnimationActive,
    animationDuration: duration,
    animationEasing: "ease-out" as const,
  };
}

type ChartContainerProps = {
  title: string;
  description?: string;
  children:
    | React.ReactNode
    | ((options: { legendVisible: boolean }) => React.ReactNode);
  showLegendToggle?: boolean;
  defaultLegendVisible?: boolean;
  isLoading?: boolean;
  isEmpty?: boolean;
  height?: number;
  className?: string;
};

export function ChartContainer({
  title,
  description,
  children,
  showLegendToggle = false,
  defaultLegendVisible = true,
  isLoading = false,
  isEmpty = false,
  height = 240,
  className = "",
}: ChartContainerProps) {
  const [legendVisible, setLegendVisible] = useState(defaultLegendVisible);

  const content = typeof children === "function" ? children({ legendVisible }) : children;

  return (
    <ErrorBoundary
      fallback={
        <div className="flex h-[300px] items-center justify-center rounded-lg border border-red-200 bg-red-50">
          <p className="text-red-600">Failed to load chart</p>
        </div>
      }
    >
      <div className={`card ${className}`} style={{ padding: 20, borderRadius: 18 }}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <div style={{ fontSize: 14, fontWeight: 700 }}>{title}</div>
            {description && (
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>{description}</div>
            )}
          </div>
          {showLegendToggle && (
            <button
              type="button"
              onClick={() => setLegendVisible((prev) => !prev)}
              className="btn"
              style={{
                padding: "6px 12px",
                borderRadius: 999,
                fontSize: 12,
                background: "var(--surface-muted)",
              }}
            >
              {legendVisible ? "Hide legend" : "Show legend"}
            </button>
          )}
        </div>
        <div style={{ marginTop: 16 }}>{isLoading || isEmpty ? <SkeletonChart height={height} /> : content}</div>
      </div>
    </ErrorBoundary>
  );
}
