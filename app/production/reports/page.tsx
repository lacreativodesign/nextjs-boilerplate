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
} from "recharts";

export default function ProductionReportsPage() {
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

  const COLORS = ["#2563eb", "#16a34a", "#f59e0b", "#dc2626"]; // blue, green, amber, red

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
        <div className="bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-800 rounded-xl p-6 shadow-sm">
          <h2 className="text-lg font-semibold mb-4">Tasks Completed Per Member</h2>
          <div className="w-full h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barData}>
                <XAxis dataKey="name" stroke="#888" />
                <YAxis stroke="#888" />
                <Tooltip
                  contentStyle={{
                    background: "#111",
                    border: "1px solid #333",
                    color: "white",
                  }}
                />
                <Bar dataKey="tasks" fill="#2563eb" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* PIE CHART */}
        <div className="bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-800 rounded-xl p-6 shadow-sm">
          <h2 className="text-lg font-semibold mb-4">Project Category Breakdown</h2>
          <div className="w-full h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={45}
                  outerRadius={80}
                  fill="#8884d8"
                  paddingAngle={4}
                  dataKey="value"
                >
                  {pieData.map((entry, index) => (
                    <Cell key={index} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Legend />
                <Tooltip
                  contentStyle={{
                    background: "#111",
                    border: "1px solid #333",
                    color: "white",
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
      }
