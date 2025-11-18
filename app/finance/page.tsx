"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  Legend,
} from "recharts";

export default function FinanceOverviewPage() {
  // Top summary KPIs (dummy)
  const kpis = [
    { label: "Total Revenue (This Month)", value: "$48,320" },
    { label: "Outstanding Invoices", value: "$12,450" },
    { label: "Paid Invoices", value: "36" },
    { label: "Pending Payouts", value: "$5,780" },
  ];

  // Monthly revenue trend (dummy)
  const revenueTrend = [
    { month: "Jan", revenue: 21000 },
    { month: "Feb", revenue: 25500 },
    { month: "Mar", revenue: 31000 },
    { month: "Apr", revenue: 28000 },
    { month: "May", revenue: 33500 },
    { month: "Jun", revenue: 36100 },
  ];

  // Invoices by status (dummy)
  const invoiceStatus = [
    { status: "Paid", count: 36 },
    { status: "Overdue", count: 5 },
    { status: "Pending", count: 11 },
  ];

  return (
    <div className="p-6 space-y-8">
      {/* HEADER */}
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">Finance Overview</h1>
        <p className="text-sm text-gray-500 dark:text-neutral-400">
          High-level snapshot of revenue, invoices, and payouts.
        </p>
      </div>

      {/* KPI GRID */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((kpi, idx) => (
          <div
            key={idx}
            className="bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-800 rounded-xl p-5 shadow-sm"
          >
            <p className="text-xs font-medium text-gray-500 dark:text-neutral-400">
              {kpi.label}
            </p>
            <p className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">
              {kpi.value}
            </p>
          </div>
        ))}
      </div>

      {/* CHARTS ROW */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
        {/* REVENUE TREND LINE CHART */}
        <div className="bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-800 rounded-xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold">Monthly Revenue Trend</h2>
              <p className="text-xs text-gray-500 dark:text-neutral-400">
                Last 6 months (dummy data).
              </p>
            </div>
          </div>
          <div className="w-full h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={revenueTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="month" stroke="#9ca3af" />
                <YAxis stroke="#9ca3af" />
                <Tooltip
                  contentStyle={{
                    background: "#020617",
                    border: "1px solid #1f2937",
                    borderRadius: 8,
                    padding: 8,
                    color: "#f9fafb",
                  }}
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="revenue"
                  stroke="#2563eb"
                  strokeWidth={2}
                  dot={{ r: 4 }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* INVOICES BY STATUS BAR CHART */}
        <div className="bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-800 rounded-xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold">Invoices by Status</h2>
              <p className="text-xs text-gray-500 dark:text-neutral-400">
                Current snapshot (dummy).
              </p>
            </div>
          </div>
          <div className="w-full h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={invoiceStatus}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="status" stroke="#9ca3af" />
                <YAxis stroke="#9ca3af" />
                <Tooltip
                  contentStyle={{
                    background: "#020617",
                    border: "1px solid #1f2937",
                    borderRadius: 8,
                    padding: 8,
                    color: "#f9fafb",
                  }}
                />
                <Bar dataKey="count" radius={[6, 6, 0, 0]} fill="#16a34a" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* QUICK BREAKDOWN TABLE */}
      <div className="bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-800 rounded-xl p-6 shadow-sm">
        <h2 className="text-lg font-semibold mb-4">Quick Financial Snapshot</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 dark:text-neutral-400 border-b border-gray-200 dark:border-neutral-800">
                <th className="py-2 pr-4">Metric</th>
                <th className="py-2 pr-4">Value</th>
                <th className="py-2 pr-4">Notes</th>
              </tr>
            </thead>
            <tbody className="text-gray-900 dark:text-gray-100">
              <tr className="border-b border-gray-100 dark:border-neutral-800">
                <td className="py-2 pr-4">Avg Invoice Value</td>
                <td className="py-2 pr-4">$1,340</td>
                <td className="py-2 pr-4">Based on last 30 invoices.</td>
              </tr>
              <tr className="border-b border-gray-100 dark:border-neutral-800">
                <td className="py-2 pr-4">Avg Payment Time</td>
                <td className="py-2 pr-4">9.4 days</td>
                <td className="py-2 pr-4">From invoice date to payment.</td>
              </tr>
              <tr>
                <td className="py-2 pr-4">Overdue Risk</td>
                <td className="py-2 pr-4">Low</td>
                <td className="py-2 pr-4">
                  Most overdue invoices are &lt; 15 days old.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
              }
