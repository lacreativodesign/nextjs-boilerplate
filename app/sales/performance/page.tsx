"use client";

import { useMemo } from "react";

export default function SalesPerformancePage() {
  // Dummy KPI data — replace later with Firestore
  const kpis = useMemo(
    () => [
      { title: "Monthly Target", value: 50000, achieved: 32000 },
      { title: "Closed Deals", value: 20, achieved: 12 },
      { title: "Lead Conversion %", value: 40, achieved: 28 },
    ],
    []
  );

  const teamPerformance = useMemo(
    () => [
      { name: "Ahmed", deals: 6, revenue: 15000 },
      { name: "Mansoor", deals: 4, revenue: 12000 },
      { name: "Bilal", deals: 3, revenue: 8000 },
      { name: "Saad", deals: 2, revenue: 5000 },
    ],
    []
  );

  return (
    <div className="p-6 space-y-10">
      <h1 className="text-2xl font-bold">Sales Performance</h1>

      {/* KPI Targets */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {kpis.map((kpi, index) => {
          const progress = Math.min(
            Math.round((kpi.achieved / kpi.value) * 100),
            100
          );

          return (
            <div
              key={index}
              className="bg-white dark:bg-neutral-900 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-neutral-800"
            >
              <div className="flex justify-between mb-2">
                <span className="font-semibold">{kpi.title}</span>
                <span className="font-medium">{progress}%</span>
              </div>

              <div className="w-full bg-gray-200 dark:bg-neutral-800 h-3 rounded-full">
                <div
                  className="h-3 bg-indigo-500 rounded-full"
                  style={{ width: `${progress}%` }}
                />
              </div>

              <p className="text-sm mt-3 text-gray-600 dark:text-gray-400">
                {kpi.achieved} / {kpi.value}
              </p>
            </div>
          );
        })}
      </div>

      {/* Team Performance Leaderboard */}
      <div className="bg-white dark:bg-neutral-900 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-neutral-800">
        <h2 className="text-lg font-semibold mb-4">Team Leaderboard</h2>

        <div className="space-y-4">
          {teamPerformance.map((member, index) => (
            <div
              key={index}
              className="flex items-center justify-between p-4 rounded-lg border border-gray-200 dark:border-neutral-800"
            >
              <div>
                <p className="font-semibold">{member.name}</p>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Deals: {member.deals}
                </p>
              </div>

              <span className="text-indigo-500 font-bold">
                ${member.revenue.toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
            }
