"use client";

import { useEffect, useState } from "react";
import dayjs from "dayjs";
import ERPLayout from "@/components/layouts/ERPLayout";

export default function AttendanceDashboard() {
  const [attendance, setAttendance] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [month, setMonth] = useState(dayjs());
  const [employees, setEmployees] = useState<any[]>([]);

  const start = month.startOf("month");
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
      (a) => a.userId === empId && a.date === dateStr
    );

    if (logs.length === 0) return null;

    const login = logs.find((l) => l.type === "login");
    const logout = logs.find((l) => l.type === "logout");

    let total = 0;
    if (login && logout) {
      total =
        new Date(logout.timestamp).getTime() -
        new Date(login.timestamp).getTime();
    }

    const hrs = (total / (1000 * 60 * 60)).toFixed(1);

    return { login, logout, hrs };
  }

  if (loading) {
    return (
      <ERPLayout role="hr" title="Attendance">
        <p>Loading...</p>
      </ERPLayout>
    );
  }

  return (
    <ERPLayout role="hr" title="Attendance">
      {/* HEADER */}
      <div
        style={{
          marginBottom: 30,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          background: "#fff",
          padding: 20,
          borderRadius: 10,
          border: "1px solid #e5e7eb",
        }}
      >
        <h2 style={{ fontSize: 24, fontWeight: 700 }}>
          Attendance — {month.format("MMMM YYYY")}
        </h2>

        <div style={{ display: "flex", gap: 10 }}>
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
      <div
        style={{
          overflowX: "auto",
          border: "1px solid #e5e7eb",
          borderRadius: 10,
          background: "#fff",
        }}
      >
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead style={{ background: "#f3f4f6" }}>
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
              <tr key={emp.id}>
                <td style={tdLabel}>{emp.name}</td>

                {Array.from({ length: daysInMonth }).map((_, dayIndex) => {
                  const info = getDayAttendance(emp.id, dayIndex + 1);
                  const isWeekend =
                    month.date(dayIndex + 1).day() === 0 ||
                    month.date(dayIndex + 1).day() === 6;

                  let bg = "#ffffff";
                  let text = "#111827";

                  if (isWeekend) {
                    bg = "#f3f4f6";
                  }

                  if (info?.hrs) {
                    bg = "#dcfce7"; // green
                    text = "#166534";
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
    </ERPLayout>
  );
}

const btn = {
  padding: "8px 16px",
  background: "#2563eb",
  color: "white",
  border: "none",
  borderRadius: 8,
  cursor: "pointer",
};

const th = {
  padding: 10,
  fontSize: 13,
  fontWeight: 600,
  borderBottom: "1px solid #e5e7eb",
  whiteSpace: "nowrap" as const,
};

const td = {
  padding: 10,
  fontSize: 13,
  textAlign: "center" as const,
  borderBottom: "1px solid #f3f4f6",
};

const tdLabel = {
  padding: 10,
  fontSize: 14,
  fontWeight: 600,
  borderBottom: "1px solid #f3f4f6",
  whiteSpace: "nowrap" as const,
};
