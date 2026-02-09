"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChartContainer, chartAxisProps, chartGridProps, chartTooltipProps, CHART_COLORS } from "@/components/charts/ChartContainer";
import type { ChartConfiguration, ChartType } from "@/types/reports";

const resolveSeries = (data: any[], config?: ChartConfiguration) => {
  if (config?.yAxis?.length) return config.yAxis;
  if (!data.length) return [];
  return Object.keys(data[0]).filter((key) => key !== config?.xAxis);
};

export function ReportViewer({
  data,
  chartType,
  chartConfig,
}: {
  data: any[];
  chartType?: ChartType;
  chartConfig?: ChartConfiguration;
}) {
  if (!data || data.length === 0) {
    return <div className="card p-6 text-sm text-[var(--text-muted)]">No data available.</div>;
  }

  const type = chartType || "table";
  const xAxisKey = chartConfig?.xAxis || Object.keys(data[0] || {})[0];
  const series = resolveSeries(data, chartConfig).filter((key) => key !== xAxisKey);
  const colors = chartConfig?.colors?.length ? chartConfig.colors : CHART_COLORS;

  if (type === "table") {
    const headers = Object.keys(data[0] || {});
    return (
      <div className="card overflow-hidden">
        <table className="min-w-full divide-y divide-neutral-200 text-sm dark:divide-neutral-800">
          <thead className="bg-neutral-50 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:bg-neutral-900/50 dark:text-neutral-400">
            <tr>
              {headers.map((header) => (
                <th key={header} className="px-4 py-3">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
            {data.map((row, idx) => (
              <tr key={idx} className="text-neutral-700 dark:text-neutral-200">
                {headers.map((header) => (
                  <td key={header} className="px-4 py-3">
                    {String(row[header] ?? "")}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (type === "metric") {
    const metricKey = series[0] || xAxisKey;
    const value = data[0]?.[metricKey];
    return (
      <div className="card p-6">
        <div className="text-sm text-[var(--text-muted)]">{metricKey}</div>
        <div className="mt-2 text-3xl font-semibold text-[var(--text-primary)]">{value ?? 0}</div>
      </div>
    );
  }

  if (type === "pie") {
    const pieValueKey = series[0] || "value";
    return (
      <ChartContainer title="Report" description="Pie chart view" height={320}>
        {({ legendVisible }) => (
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Tooltip {...chartTooltipProps} />
              {legendVisible ? <Legend /> : null}
              <Pie
                data={data}
                dataKey={pieValueKey}
                nameKey={xAxisKey}
                outerRadius={110}
                fill={colors[0]}
                label
              />
            </PieChart>
          </ResponsiveContainer>
        )}
      </ChartContainer>
    );
  }

  const common = (
    <>
      {chartConfig?.showGrid !== false ? <CartesianGrid {...chartGridProps} /> : null}
      <XAxis dataKey={xAxisKey} {...chartAxisProps} />
      <YAxis {...chartAxisProps} />
      <Tooltip {...chartTooltipProps} />
      {chartConfig?.showLegend !== false ? <Legend /> : null}
    </>
  );

  if (type === "line") {
    return (
      <ChartContainer title="Report" description="Line chart view" height={320}>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={data}>
            {common}
            {series.map((key, index) => (
              <Line key={key} type="monotone" dataKey={key} stroke={colors[index % colors.length]} strokeWidth={2} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </ChartContainer>
    );
  }

  if (type === "area") {
    return (
      <ChartContainer title="Report" description="Area chart view" height={320}>
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart data={data}>
            {common}
            {series.map((key, index) => (
              <Area
                key={key}
                type="monotone"
                dataKey={key}
                stroke={colors[index % colors.length]}
                fill={colors[index % colors.length]}
                fillOpacity={0.2}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </ChartContainer>
    );
  }

  if (type === "scatter") {
    const scatterKey = series[0] || xAxisKey;
    return (
      <ChartContainer title="Report" description="Scatter plot view" height={320}>
        <ResponsiveContainer width="100%" height={300}>
          <ScatterChart>
            {common}
            <Scatter data={data} dataKey={scatterKey} fill={colors[0]} />
          </ScatterChart>
        </ResponsiveContainer>
      </ChartContainer>
    );
  }

  return (
    <ChartContainer title="Report" description="Bar chart view" height={320}>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={data}>
          {common}
          {series.map((key, index) => (
            <Bar key={key} dataKey={key} fill={colors[index % colors.length]} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </ChartContainer>
  );
}
