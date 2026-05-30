"use client";

import { useEffect, useState } from "react";
import dayjs from "dayjs";

export default function AttendanceDashboard() {
  const [attendance, setAttendance] = useState<unknown[]>([]);
  const [loading, setLoading] = useState(true);
  const [month, setMonth] = useState(dayjs());
  const [employees, setEmployees] = useState<unknown[]>([]);

  const _start = month.startOf("month");
  const end = month.endOf("month");
  const daysInMonth = end.date();

  useEffect(() => {
    fetchData();
  }, [month]);

  async function fetchData() {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/hr/attendance?month=${month.format("YYYY-MM")}`
      );
      const data = await res.json();

      if (data.success) {
        setAttendance(data.attendance);
        setEmployees(data.employees);
      }
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }

  function getDayAttendance(empId: string, day: number) {
    const dateStr = month.date(day).format("YYYY-MM-DD");

    const logs = attendance.filter(
      (a) => (a as Record<string, unknown>).userId === empId && (a as Record<string, unknown>).date === dateStr
    );

    if (logs.length === 0) return null;

    const login = logs.find((l) => (l as Record<string, unknown>).type === "login");
    const logout = logs.find((l) => (l as Record<string, unknown>).type === "logout");

    let total = 0;
    if (login && logout) {
      total =
        new Date(String((logout as Record<string, unknown>).timestamp || "")).getTime() -
        new Date(String((login as Record<string, unknown>).timestamp || "")).getTime();
    }

    const hrs = (total / (1000 * 60 * 60)).toFixed(1);

    return { login, logout, hrs };
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <p>Loading...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* HEADER */}
      <div
        style={{
          marginBottom: 30,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          background: "var(--surface-card)",
          padding: 20,
          borderRadius: 10,
          border: "1px solid var(--border-subtle)",
        }}
      >
        <h2 style={{ fontSize: 24, fontWeight: 700 }}>
          Attendance — {month.format("MMMM YYYY")}
        </h2>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setMonth(month.subtract(1, "month"))}
            style={btn}
          >
            Prev
          </button>
          <button onClick={() => setMonth(dayjs())} style={btn}>
            Today
          </button>
          <button
            onClick={() => setMonth(month.add(1, "month"))}
            style={btn}
          >
            Next
          </button>
        </div>
      </div>

      {/* TABLE */}
      <div className="w-full overflow-x-auto rounded-xl" style={{ border: "1px solid var(--border-subtle)", background: "var(--surface-card)" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead style={{ background: "var(--surface-muted)" }}>
            <tr>
              <th style={th}>Employee</th>
              {Array.from({ length: daysInMonth }).map((_, i) => (
                <th key={i} style={th}>
                  {i + 1}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {employees.map((emp) => (
              <tr key={String((emp as Record<string, unknown>).id ?? "")}>
                <td style={tdLabel}>{String((emp as Record<string, unknown>).name ?? "")}</td>

                {Array.from({ length: daysInMonth }).map((_, dayIndex) => {
                  const info = getDayAttendance(String((emp as Record<string, unknown>).id ?? ""), dayIndex + 1);
                  const isWeekend =
                    month.date(dayIndex + 1).day() === 0 ||
                    month.date(dayIndex + 1).day() === 6;

                  let bg = "var(--surface-card)";
                  let text = "var(--text-primary)";

                  if (isWeekend) {
                    bg = "var(--surface-muted)";
                  }

                  if (info?.hrs) {
                    bg = "var(--status-success-bg, #dcfce7)"; // green
                    text = "var(--status-success-text, #166534)";
                  }

                  return (
                    <td key={dayIndex} style={{ ...td, background: bg, color: text }}>
                      {info?.hrs || ""}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const btn = {
  padding: "8px 16px",
  background: "var(--erp-blue)",
  color: "var(--text-on-inverse, #fff)",
  border: "none",
  borderRadius: 8,
  cursor: "pointer",
};

const th = {
  padding: 10,
  fontSize: 13,
  minWidth: "80px",
  fontWeight: 600,
  borderBottom: "1px solid var(--border-subtle)",
  whiteSpace: "nowrap" as const,
};

const td = {
  padding: 10,
  fontSize: 13,
  textAlign: "center" as const,
  borderBottom: "1px solid var(--border-subtle)",
};

const tdLabel = {
  padding: 10,
  fontSize: 14,
  fontWeight: 600,
  borderBottom: "1px solid var(--border-subtle)",
  whiteSpace: "nowrap" as const,
};
