"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import {
  ChartContainer,
  chartAxisProps,
  chartGridProps,
  chartTooltipProps,
  useChartAnimation,
} from "@/components/charts/ChartContainer";

export default function SalesPerformancePage() {
  const chartAnimation = useChartAnimation();
  // Dummy placeholder data until backend is connected
  const monthlyData = [
    { month: "Jan", leads: 18, closed: 3 },
    { month: "Feb", leads: 22, closed: 5 },
    { month: "Mar", leads: 20, closed: 4 },
    { month: "Apr", leads: 25, closed: 6 },
    { month: "May", leads: 19, closed: 2 },
    { month: "Jun", leads: 30, closed: 7 },
  ];

  const stats = [
    { label: "Total Leads", value: 134 },
    { label: "Deals Closed", value: 27 },
    { label: "Conversion Rate", value: "20%" },
    { label: "Total Revenue", value: "$32,000" },
  ];

  return (
    <div className="p-6 space-y-8">
      <h1 className="text-2xl font-bold">Sales Performance</h1>

      {/* KPI CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((s, idx) => (
          <div
            key={idx}
            className="bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-800 rounded-xl p-5 shadow-sm"
          >
            <p className="text-sm text-gray-500 dark:text-neutral-400">
              {s.label}
            </p>
            <p className="text-2xl font-semibold mt-2">{s.value}</p>
          </div>
        ))}
      </div>

      {/* PERFORMANCE CHART */}
      <ChartContainer
        title="Monthly Lead Performance"
        description="Demo values until Firebase connectivity is enabled."
        height={320}
      >
        <div className="w-full h-80 mt-2">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={monthlyData}>
              <CartesianGrid {...chartGridProps} />
              <XAxis dataKey="month" {...chartAxisProps} />
              <YAxis {...chartAxisProps} />
              <Tooltip {...chartTooltipProps} />
              <Bar dataKey="leads" fill="var(--chart-series-1)" radius={[8, 8, 0, 0]} {...chartAnimation} />
              <Bar dataKey="closed" fill="var(--chart-series-2)" radius={[8, 8, 0, 0]} {...chartAnimation} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </ChartContainer>
    </div>
  );
}
