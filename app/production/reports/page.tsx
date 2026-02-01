"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Pie,
  PieChart,
  Cell,
  Legend,
  CartesianGrid,
} from "recharts";
import {
  ChartContainer,
  CHART_COLORS,
  chartAxisProps,
  chartGridProps,
  chartTooltipProps,
  useChartAnimation,
} from "@/components/charts/ChartContainer";

export default function ProductionReportsPage() {
  const chartAnimation = useChartAnimation();
  // --- Dummy KPI data ---
  const kpis = [
    { label: "Projects In Queue", value: 12 },
    { label: "Projects Completed", value: 38 },
    { label: "Revisions This Week", value: 21 },
    { label: "Avg Turnaround (hrs)", value: "14.8" },
  ];

  // --- Bar chart: Tasks completed per team member ---
  const barData = [
    { name: "Ali", tasks: 18 },
    { name: "Sara", tasks: 25 },
    { name: "Imran", tasks: 12 },
    { name: "Fatima", tasks: 30 },
  ];

  // --- Pie chart: Project category distribution ---
  const pieData = [
    { name: "Branding", value: 14 },
    { name: "Web", value: 22 },
    { name: "Social Media", value: 18 },
    { name: "Video/Animation", value: 9 },
  ];

  return (
    <div className="p-6 space-y-8">
      {/* Title */}
      <div>
        <h1 className="text-2xl font-bold">Reports</h1>
        <p className="text-sm text-gray-500 dark:text-neutral-400">
          Production analytics to track performance and workload.
        </p>
      </div>

      {/* KPI CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((kpi, i) => (
          <div
            key={i}
            className="bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-800 rounded-xl p-5 shadow-sm"
          >
            <p className="text-xs text-gray-500 dark:text-neutral-400 font-medium">
              {kpi.label}
            </p>
            <p className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">
              {kpi.value}
            </p>
          </div>
        ))}
      </div>

      {/* CHARTS GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* BAR CHART */}
        <ChartContainer
          title="Tasks Completed Per Member"
          description="Daily task throughput by team member."
          height={288}
        >
          <div className="w-full h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barData}>
                <CartesianGrid {...chartGridProps} />
                <XAxis dataKey="name" {...chartAxisProps} />
                <YAxis {...chartAxisProps} />
                <Tooltip {...chartTooltipProps} />
                <Bar dataKey="tasks" fill="var(--chart-series-1)" radius={[8, 8, 0, 0]} {...chartAnimation} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartContainer>

        {/* PIE CHART */}
        <ChartContainer
          title="Project Category Breakdown"
          description="Work distribution by service category."
          height={288}
          showLegendToggle
        >
          {({ legendVisible }) => (
            <div className="w-full h-72">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={85}
                    paddingAngle={3}
                    dataKey="value"
                    stroke="var(--surface-card)"
                    {...chartAnimation}
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={entry.name} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  {legendVisible && (
                    <Legend
                      align="center"
                      verticalAlign="bottom"
                      iconType="circle"
                      wrapperStyle={{ fontSize: 12, color: "var(--text-muted)" }}
                    />
                  )}
                  <Tooltip {...chartTooltipProps} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </ChartContainer>
      </div>
    </div>
  );
}
