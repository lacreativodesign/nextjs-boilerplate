"use client";

import React from "react";
import ERPLayout from "@/components/layouts/ERPLayout";
import {
  BarChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Bar,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";

// Dummy pipeline data (UI only)
const pipelineData = [
  { stage: "New Lead", count: 24 },
  { stage: "Contacted", count: 18 },
  { stage: "Qualified", count: 12 },
  { stage: "Proposal Sent", count: 8 },
  { stage: "Negotiation", count: 4 },
  { stage: "Closed Won", count: 6 },
  { stage: "Closed Lost", count: 5 },
];

const pieData = [
  { name: "Won", value: 6 },
  { name: "Lost", value: 5 },
  { name: "In Pipeline", value: 66 },
];

const COLORS = ["#10b981", "#ef4444", "#6366f1"];

export default function SalesAnalyticsPage() {
  return (
    <ERPLayout pageTitle="Sales Analytics">
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* KPI CARDS */}
        <div className="xl:col-span-3 grid grid-cols-1 md:grid-cols-4 gap-4">
          {[
            { label: "Total Leads", value: 84 },
            { label: "Active Pipeline", value: 66 },
            { label: "Closed Won", value: 6 },
            { label: "Closed Lost", value: 5 },
          ].map((kpi, i) => (
            <div
              key={i}
              className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm p-5 flex flex-col"
            >
              <span className="text-sm text-slate-500 dark:text-slate-400">
                {kpi.label}
              </span>
              <span className="text-2xl font-semibold mt-2 text-slate-900 dark:text-white">
                {kpi.value}
              </span>
            </div>
          ))}
        </div>

        {/* PIPELINE BAR CHART */}
        <div className="xl:col-span-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm p-6">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
            Pipeline Overview
          </h2>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={pipelineData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" />
                <XAxis dataKey="stage" stroke="#94a3b8" />
                <YAxis stroke="#94a3b8" />
                <Tooltip />
                <Bar dataKey="count" fill="#6366f1" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* PIE CHART */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm p-6">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
            Win / Loss Ratio
          </h2>
          <div className="h-80 flex justify-center items-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  outerRadius={120}
                  dataKey="value"
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </ERPLayout>
  );
        }
