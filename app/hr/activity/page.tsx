"use client";

import React from "react";
import dayjs from "dayjs";

export default function HRActivityPage() {
  // Dummy logs until endpoints exist
  const logs = [
    {
      id: 1,
      user: "John Carter",
      type: "login",
      timestamp: "2025-01-15T09:00:00",
    },
    {
      id: 2,
      user: "John Carter",
      type: "logout",
      timestamp: "2025-01-15T18:00:00",
    },
    {
      id: 3,
      user: "Sarah Miles",
      type: "login",
      timestamp: "2025-01-15T08:45:00",
    },
    {
      id: 4,
      user: "Sarah Miles",
      type: "logout",
      timestamp: "2025-01-15T17:45:00",
    },
    {
      id: 5,
      user: "Ahsan Ali",
      type: "login",
      timestamp: "2025-01-15T10:12:00",
    },
  ];

  const getColor = (type: string) => {
    if (type === "login") return "text-green-600";
    if (type === "logout") return "text-red-600";
    return "text-gray-600";
  };

  return (
    <div className="p-6 space-y-10">
      {/* HEADER */}
      <div>
        <h1 className="text-2xl font-bold">Activity Logs</h1>
        <p className="text-sm text-gray-500 dark:text-neutral-400">
          Track login, logout, system access, and overall user activity in real-time.
        </p>
      </div>

      {/* TABLE */}
      <div className="bg-white dark:bg-neutral-900 rounded-xl border border-gray-200 dark:border-neutral-800 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-100 dark:bg-neutral-800 border-b border-gray-200 dark:border-neutral-700">
            <tr>
              <th className="text-left p-4 font-medium">User</th>
              <th className="text-left p-4 font-medium">Activity</th>
              <th className="text-left p-4 font-medium">Timestamp</th>
            </tr>
          </thead>

          <tbody>
            {logs.map((log) => (
              <tr
                key={log.id}
                className="border-b border-gray-100 dark:border-neutral-800 hover:bg-gray-50 dark:hover:bg-neutral-800 transition"
              >
                <td className="p-4 font-medium">{log.user}</td>

                <td className={`p-4 font-semibold capitalize ${getColor(log.type)}`}>
                  {log.type}
                </td>

                <td className="p-4 text-gray-600 dark:text-neutral-400">
                  {dayjs(log.timestamp).format("DD MMM YYYY • hh:mm A")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
                    }
