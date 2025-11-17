"use client";

import React from "react";

export default function HRPerformancePage() {
  const employees = [
    {
      id: 1,
      name: "John Carter",
      role: "Designer",
      performance: 92,
      attendance: 97,
      tasks: 48,
    },
    {
      id: 2,
      name: "Sarah Miles",
      role: "Developer",
      performance: 88,
      attendance: 91,
      tasks: 52,
    },
    {
      id: 3,
      name: "Ahsan Ali",
      role: "Sales Executive",
      performance: 74,
      attendance: 85,
      tasks: 31,
    },
    {
      id: 4,
      name: "Kiran Shah",
      role: "Account Manager",
      performance: 95,
      attendance: 99,
      tasks: 60,
    },
  ];

  const getBadgeColor = (score: number) => {
    if (score >= 90) return "bg-green-100 text-green-700";
    if (score >= 75) return "bg-yellow-100 text-yellow-700";
    return "bg-red-100 text-red-700";
  };

  return (
    <div className="p-6 space-y-10">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Performance Overview</h1>
        <p className="text-sm text-gray-500 dark:text-neutral-400">
          Review employee KPIs, attendance efficiency, productivity scores, and overall performance.
        </p>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-neutral-900 rounded-xl border border-gray-200 dark:border-neutral-800 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-100 dark:bg-neutral-800 border-b border-gray-200 dark:border-neutral-700">
            <tr>
              <th className="text-left p-4 font-medium">Employee</th>
              <th className="text-left p-4 font-medium">Role</th>
              <th className="text-left p-4 font-medium">Performance</th>
              <th className="text-left p-4 font-medium">Attendance</th>
              <th className="text-left p-4 font-medium">Tasks Completed</th>
            </tr>
          </thead>

          <tbody>
            {employees.map((emp) => (
              <tr
                key={emp.id}
                className="border-b border-gray-100 dark:border-neutral-800 hover:bg-gray-50 dark:hover:bg-neutral-800 transition"
              >
                <td className="p-4 font-medium">{emp.name}</td>
                <td className="p-4 text-gray-600 dark:text-neutral-400">{emp.role}</td>

                <td className="p-4">
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-semibold ${getBadgeColor(
                      emp.performance
                    )}`}
                  >
                    {emp.performance}%
                  </span>
                </td>

                <td className="p-4">
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-semibold ${getBadgeColor(
                      emp.attendance
                    )}`}
                  >
                    {emp.attendance}%
                  </span>
                </td>

                <td className="p-4 font-medium">{emp.tasks}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
    }
