"use client";

import React, { useEffect, useMemo, useState } from "react";
import ERPLayout from "@/components/layouts/ERPLayout";

type AttendanceLog = {
  type: "login" | "logout";
  timestamp: string;
};

type AttendanceRecord = {
  id: string;
  userId: string;
  email: string;
  displayName?: string;
  date: string; // ISO string for the date (e.g. "2025-11-17")
  logs: AttendanceLog[];
};

type AbsenteeRecord = {
  userId: string;
  email: string;
  displayName?: string;
  date: string;
};

/**
 * Compute total hours from an array of login/logout logs.
 * Matches every login with the *next* logout and sums the differences.
 */
function computeHours(logs: AttendanceLog[]) {
  let totalMs = 0;

  for (let i = 0; i < logs.length; i++) {
    if (logs[i].type === "login") {
      const logoutEvent = logs.find(
        (l: AttendanceLog) =>
          l.type === "logout" &&
          new Date(l.timestamp) > new Date(logs[i].timestamp)
      );

      if (logoutEvent) {
        const diff =
          new Date(logoutEvent.timestamp).getTime() -
          new Date(logs[i].timestamp).getTime();
        totalMs += diff;
      }
    }
  }

  const hrs = totalMs / (1000 * 60 * 60);
  return Number.isFinite(hrs) ? hrs.toFixed(2) : "0.00";
}

function formatDateLabel(value: string | Date) {
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
}

export default function HRAttendancePage() {
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [absentees, setAbsentees] = useState<AbsenteeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedDate, setSelectedDate] = useState<string>(() => {
    const today = new Date();
    return today.toISOString().slice(0, 10); // yyyy-mm-dd
  });

  const [search, setSearch] = useState("");

  // --- Fetch data from API routes we already created ---
  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        setError(null);

        const [attendanceRes, absenteesRes] = await Promise.all([
          fetch("/api/hr/attendance/list"),
          fetch("/api/hr/attendance/absentees"),
        ]);

        if (!attendanceRes.ok) {
          throw new Error("Failed to load attendance list");
        }

        const attendanceJson = await attendanceRes.json();
        const absenteesJson = absenteesRes.ok ? await absenteesRes.json() : null;

        setRecords(attendanceJson.records || []);
        setAbsentees(absenteesJson?.records || []);
      } catch (err: any) {
        console.error("Error loading attendance:", err);
        setError(err.message || "Failed to load attendance data");
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, []);

  // --- Derived data: today, summary, filtered list ---

  const filteredByDate = useMemo(() => {
    if (!selectedDate) return records;
    return records.filter((r) => r.date === selectedDate);
  }, [records, selectedDate]);

  const filteredAndSearched = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return filteredByDate;
    return filteredByDate.filter((r) => {
      const name = (r.displayName || "").toLowerCase();
      const email = (r.email || "").toLowerCase();
      return name.includes(q) || email.includes(q);
    });
  }, [filteredByDate, search]);

  const summary = useMemo(() => {
    const uniqueUsers = new Map<string, AttendanceRecord[]>();

    filteredByDate.forEach((rec) => {
      if (!uniqueUsers.has(rec.userId)) {
        uniqueUsers.set(rec.userId, []);
      }
      uniqueUsers.get(rec.userId)!.push(rec);
    });

    let totalHoursForDate = 0;

    uniqueUsers.forEach((userRecs) => {
      userRecs.forEach((r) => {
        totalHoursForDate += parseFloat(computeHours(r.logs)) || 0;
      });
    });

    const totalEmployees = uniqueUsers.size;
    const presentCount = uniqueUsers.size;
    const absentCount = absentees.filter((a) => a.date === selectedDate).length;
    const avgHours =
      totalEmployees > 0 ? (totalHoursForDate / totalEmployees).toFixed(2) : "0.00";

    return {
      totalEmployees,
      presentCount,
      absentCount,
      avgHours,
    };
  }, [filteredByDate, absentees, selectedDate]);

  return (
    <ERPLayout pageTitle="HR • Attendance">
      <div className="flex flex-col gap-6">
        {/* Page header + filters */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-50">
              Attendance Overview
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              Track daily presence, hours worked, and absentees across your team.
            </p>
          </div>

          <div className="flex flex-col md:flex-row gap-3">
            <div className="flex flex-col">
              <label className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                Date
              </label>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-slate-50 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div className="flex flex-col">
              <label className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                Search (name / email)
              </label>
              <input
                type="text"
                placeholder="Type to filter..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-slate-50 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 min-w-[220px]"
              />
            </div>
          </div>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-3 shadow-sm flex flex-col gap-1">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Total Employees (with logs)
            </span>
            <span className="text-2xl font-semibold text-slate-900 dark:text-slate-50">
              {summary.totalEmployees}
            </span>
            <span className="text-[11px] text-slate-400">
              Counted from attendance records for the selected date.
            </span>
          </div>

          <div className="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 px-4 py-3 shadow-sm flex flex-col gap-1">
            <span className="text-xs font-medium text-emerald-700 dark:text-emerald-300">
              Present Today
            </span>
            <span className="text-2xl font-semibold text-emerald-900 dark:text-emerald-100">
              {summary.presentCount}
            </span>
            <span className="text-[11px] text-emerald-700/70 dark:text-emerald-200/70">
              Users with at least one login record.
            </span>
          </div>

          <div className="rounded-xl border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 px-4 py-3 shadow-sm flex flex-col gap-1">
            <span className="text-xs font-medium text-rose-700 dark:text-rose-300">
              Absent Today
            </span>
            <span className="text-2xl font-semibold text-rose-900 dark:text-rose-100">
              {summary.absentCount}
            </span>
            <span className="text-[11px] text-rose-700/70 dark:text-rose-200/70">
              From HR absentees report for this date.
            </span>
          </div>

          <div className="rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950/40 px-4 py-3 shadow-sm flex flex-col gap-1">
            <span className="text-xs font-medium text-indigo-700 dark:text-indigo-300">
              Avg. Hours (Present)
            </span>
            <span className="text-2xl font-semibold text-indigo-900 dark:text-indigo-100">
              {summary.avgHours}
            </span>
            <span className="text-[11px] text-indigo-700/70 dark:text-indigo-200/70">
              Approx. hours worked for present users.
            </span>
          </div>
        </div>

        {/* Table */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-800">
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-50">
                Daily attendance – {formatDateLabel(selectedDate)}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Each row shows a user&apos;s total hours computed from login / logout
                events.
              </p>
            </div>

            <button
              type="button"
              className="inline-flex items-center rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-100 shadow-sm hover:bg-slate-50 dark:hover:bg-slate-800"
              onClick={() => {
                // Stub for future CSV/Excel export – safe no-op for now.
                alert("Export coming soon (stub only for now).");
              }}
            >
              ⬇️ Export (CSV)
            </button>
          </div>

          {loading ? (
            <div className="px-4 py-10 text-center text-sm text-slate-500 dark:text-slate-400">
              Loading attendance data…
            </div>
          ) : error ? (
            <div className="px-4 py-10 text-center text-sm text-rose-500 dark:text-rose-400">
              {error}
            </div>
          ) : filteredAndSearched.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-slate-500 dark:text-slate-400">
              No attendance records found for this date with the current filters.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm border-t border-slate-100 dark:border-slate-800">
                <thead className="bg-slate-50 dark:bg-slate-900/60">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium text-slate-500 dark:text-slate-400">
                      User
                    </th>
                    <th className="px-4 py-2 text-left font-medium text-slate-500 dark:text-slate-400">
                      Email
                    </th>
                    <th className="px-4 py-2 text-left font-medium text-slate-500 dark:text-slate-400">
                      Hours (approx.)
                    </th>
                    <th className="px-4 py-2 text-left font-medium text-slate-500 dark:text-slate-400">
                      First Login
                    </th>
                    <th className="px-4 py-2 text-left font-medium text-slate-500 dark:text-slate-400">
                      Last Logout
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredAndSearched.map((rec) => {
                    const hours = computeHours(rec.logs || []);
                    const firstLogin = rec.logs
                      ?.filter((l) => l.type === "login")
                      .map((l) => l.timestamp)
                      .sort()[0];

                    const lastLogout = rec.logs
                      ?.filter((l) => l.type === "logout")
                      .map((l) => l.timestamp)
                      .sort()
                      .slice(-1)[0];

                    return (
                      <tr key={rec.id}>
                        <td className="px-4 py-2 whitespace-nowrap text-slate-900 dark:text-slate-50">
                          {rec.displayName || "—"}
                        </td>
                        <td className="px-4 py-2 whitespace-nowrap text-slate-600 dark:text-slate-300">
                          {rec.email || "—"}
                        </td>
                        <td className="px-4 py-2 whitespace-nowrap text-slate-900 dark:text-slate-50">
                          {hours} hrs
                        </td>
                        <td className="px-4 py-2 whitespace-nowrap text-slate-600 dark:text-slate-300 text-xs">
                          {firstLogin
                            ? new Date(firstLogin).toLocaleTimeString(undefined, {
                                hour: "2-digit",
                                minute: "2-digit",
                              })
                            : "—"}
                        </td>
                        <td className="px-4 py-2 whitespace-nowrap text-slate-600 dark:text-slate-300 text-xs">
                          {lastLogout
                            ? new Date(lastLogout).toLocaleTimeString(undefined, {
                                hour: "2-digit",
                                minute: "2-digit",
                              })
                            : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </ERPLayout>
  );
          }
