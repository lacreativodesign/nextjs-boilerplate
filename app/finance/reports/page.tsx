"use client";

import {
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  BarChart,
  Bar,
  Legend,
  ResponsiveContainer,
} from "recharts";

const revenueData = [
  { month: "Jan", revenue: 12000, expenses: 6500 },
  { month: "Feb", revenue: 15000, expenses: 7200 },
  { month: "Mar", revenue: 18000, expenses: 8000 },
  { month: "Apr", revenue: 22000, expenses: 9000 },
  { month: "May", revenue: 26000, expenses: 11000 },
  { month: "Jun", revenue: 24000, expenses: 10500 },
];

const expenseBreakdown = [
  { category: "Salaries", amount: 11000 },
  { category: "Software", amount: 3000 },
  { category: "Marketing", amount: 3500 },
  { category: "Office Rent", amount: 2500 },
  { category: "Misc", amount: 1500 },
];

export default function FinanceReportsPage() {
  return (
    <div className="p-6 space-y-10">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Financial Reports</h1>
        <p className="text-sm text-gray-500 dark:text-neutral-400">
          Revenue, expenses, trend lines, and financial health indicators.
        </p>
      </div>

      {/* Revenue vs Expenses Chart */}
      <div className="bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-800 rounded-xl p-6 shadow-sm">
        <h2 className="text-lg font-semibold mb-4">
          Revenue vs Expenses (Last 6 Months)
        </h2>

        <div className="w-full h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={revenueData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="revenue" stroke="#4f46e5" strokeWidth={3} />
              <Line type="monotone" dataKey="expenses" stroke="#dc2626" strokeWidth={3} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Expense Breakdown */}
      <div className="bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-800 rounded-xl p-6 shadow-sm">
        <h2 className="text-lg font-semibold mb-4">Expense Breakdown</h2>

        <div className="w-full h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={expenseBreakdown}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="category" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="amount" fill="#06b6d4" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
   }
