"use client";

import { useState } from "react";

export default function SalesTargetsPage() {
  const [selectedMonth, setSelectedMonth] = useState("January");

  // DEMO DATA (Will be replaced with Firebase later)
  const exampleTargets = {
    January: {
      target: 5000,
      achieved: 3200,
    },
    February: {
      target: 6000,
      achieved: 4800,
    },
    March: {
      target: 7000,
      achieved: 2100,
    },
  };

  const data = exampleTargets[selectedMonth];
  const progress = Math.min(
    (data.achieved / data.target) * 100 || 0,
    100
  ).toFixed(0);

  return (
    <div className="p-6 space-y-8">
      <h1 className="text-2xl font-bold">Sales Targets</h1>

      {/* Month Selector */}
      <div className="bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-800 p-5 rounded-xl shadow-sm w-full sm:w-80">
        <label className="block text-sm font-medium text-gray-600 dark:text-neutral-400 mb-2">
          Select Month
        </label>
        <select
          value={selectedMonth}
          onChange={(e) => setSelectedMonth(e.target.value)}
          className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-gray-800 dark:text-neutral-200"
        >
          {Object.keys(exampleTargets).map((m) => (
            <option key={m}>{m}</option>
          ))}
        </select>
      </div>

      {/* Stats Box */}
      <div className="bg-white dark:bg-neutral-900 p-6 border border-gray-200 dark:border-neutral-800 rounded-xl shadow-sm space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <p className="text-sm text-gray-500 dark:text-neutral-400">Monthly Target</p>
            <p className="text-xl font-bold">${data.target}</p>
          </div>

          <div>
            <p className="text-sm text-gray-500 dark:text-neutral-400">Achieved</p>
            <p className="text-xl font-bold text-blue-600 dark:text-blue-400">
              ${data.achieved}
            </p>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="mt-4">
          <p className="text-sm font-medium mb-1">Progress: {progress}%</p>
          <div className="w-full h-3 rounded-full bg-gray-200 dark:bg-neutral-800">
            <div
              className="h-full rounded-full bg-blue-600 dark:bg-blue-400 transition-all"
              style={{ width: `${progress}%` }}
            ></div>
          </div>

          <p className="text-xs mt-2 text-gray-400 dark:text-neutral-500">
            (This data is demo-only. Once we connect Firebase, each Sales user
            will see **their** targets, and Sales Manager/Admin will see all.)
          </p>
        </div>
      </div>
    </div>
  );
}
