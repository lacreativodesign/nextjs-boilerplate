"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
  BarChart,
  Bar,
} from "recharts";

export default function SalesAnalyticsPage() {
  // Dummy analytics — replace later with Firestore data
  const monthlySales = [
    { month: "Jan", value: 12000 },
    { month: "Feb", value: 14500 },
    { month: "Mar", value: 18000 },
    { month: "Apr", value: 16500 },
    { month: "May", value: 21000 },
    { month: "Jun", value: 25000 },
  ];

  const leadConversion = [
    { stage: "New", count: 45 },
    { stage: "Contacted", count: 30 },
    { stage: "Qualified", count: 18 },
    { stage: "Proposal", count: 10 },
    { stage: "Closed Won", count: 6 },
  ];

  return (
    <div className="p-6 space-y-10">
      {/* Page Title */}
      <h1 className="text-2xl font-bold">Sales Analytics</h1>

      {/* --- Monthly Revenue Chart --- */}
      <div className="bg-white dark:bg-neutral-900 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-neutral-800">
        <h2 className="text-lg font-semibold mb-4">Monthly Revenue</h2>

        <ResponsiveContainer width="100%" height={350}>
          <LineChart data={monthlySales}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
            <XAxis dataKey="month" />
            <YAxis />
            <Tooltip />
            <Line
              type="monotone"
              dataKey="value"
              stroke="#6366F1"
              strokeWidth={3}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* --- Pipeline Chart --- */}
      <div className="bg-white dark:bg-neutral-900 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-neutral-800">
        <h2 className="text-lg font-semibold mb-4">Lead Pipeline Overview</h2>

        <ResponsiveContainer width="100%" height={350}>
          <BarChart data={leadConversion}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
            <XAxis dataKey="stage" />
            <YAxis />
            <Tooltip />
            <Bar dataKey="count" fill="#10B981" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
