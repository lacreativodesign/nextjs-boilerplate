"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import dayjs from "dayjs";
import ERPLayout from "@/components/layouts/ERPLayout";

type Log = {
  type: "login" | "logout";
  timestamp: string;
  date: string;
};

type Employee = {
  id: string;
  name: string;
  email?: string;
  role?: string;
};

export const dynamic = "force-dynamic";

export default function EmployeeAttendanceDetail() {
  const params = useParams() as { employeeId: string };
  const router = useRouter();
  const [month, setMonth] = useState(dayjs());
  const [logs, setLogs] = useState<Log[]>([]);
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [loading, setLoading] = useState(true);

  const start = month.startOf("month");
  const end = month.endOf("month");
  const daysInMonth = end.date();

  useEffect(() => {
    if (!params.employeeId) return;
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month, params.employeeId]);

  async function fetchData() {
    try {
      setLoading(true);
      const res = await fetch(
        `/api/hr/attendance/employee?userId=${params.employeeId}&month=${month.format(
          "YYYY-MM"
        )}`
      );
      const data = await res.json();

      if (data.success) {
        setLogs(data.logs || []);
        setEmployee(data.employee || null);
      }
    } catch (err) {
      console.error("Employee attendance load error:", err);
    } finally {
      setLoading(false);
    }
  }

  function computeDayInfo(day: number) {
    const dateStr = month.date(day).format("YYYY-MM-DD");
    const dayLogs = logs.filter((l) => l.date === dateStr);

    if (!dayLogs.length) return null;

    // sort by time
    dayLogs.sort(
      (a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    const firstLogin = dayLogs.find((l) => l.type === "login");
    const lastLogout = [...dayLogs].reverse().find((l) => l.type === "logout");

    let totalMs = 0;
    for (let i = 0; i < dayLogs.length; i++) {
      if (dayLogs[i].type === "login") {
        const logoutEvent = dayLogs.find(
          (l) =>
            l.type === "logout" &&
            new Date(l.timestamp) > new Date(dayLogs[i].timestamp)
        );
        if (logoutEvent) {
          totalMs +=
            new Date(logoutEvent.timestamp).getTime() -
            new Date(dayLogs[i].timestamp).getTime();
        }
      }
    }

    const hrs = totalMs / (1000 * 60 * 60);

    return {
      firstLogin,
      lastLogout,
      hours: hrs > 0 ? hrs.toFixed(2) : "",
    };
  }

  function getSummary() {
    let totalHours = 0;
    let daysPresent = 0;

    for (let d = 1; d <= daysInMonth; d++) {
      const info = computeDayInfo(d);
      if (info && info.hours) {
        daysPresent += 1;
        totalHours += parseFloat(info.hours);
      }
    }

    return {
      daysPresent,
      totalHours: totalHours.toFixed(1),
    };
  }

  const summary = getSummary();

  if (loading) {
    return (
      <ERPLayout role="hr" title="Attendance Detail">
        <p>Loading...</p>
      </ERPLayout>
    );
  }

  if (!employee) {
    return (
      <ERPLayout role="hr" title="Attendance Detail">
        <p>Employee not found.</p>
      </ERPLayout>
    );
  }

  return (
    <ERPLayout role="hr" title="Attendance Detail">
      {/* TOP BAR */}
      <div
        style={{
          marginBottom: 20,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 16,
        }}
      >
        <button
          onClick={() => router.push("/hr/attendance")}
          style={{
            padding: "8px 14px",
            borderRadius: 8,
            border: "1px solid #e5e7eb",
            background: "#fff",
            cursor: "pointer",
            fontSize: 13,
          }}
        >
          ← Back to Attendance
        </button>

        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button
            onClick={() => setMonth(month.subtract(1, "month"))}
            style={btn}
          >
            Prev
          </button>
          <button onClick={() => setMonth(dayjs())} style={btn}>
            Today
          </button>
          <button onClick={() => setMonth(month.add(1, "month"))} style={btn}>
            Next
          </button>
        </div>
      </div>

      {/* EMPLOYEE CARD */}
      <div
        style={{
          marginBottom: 24,
          padding: 20,
          borderRadius: 12,
          border: "1px solid #e5e7eb",
          background: "#ffffff",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 16,
        }}
      >
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>
            {employee.name}
          </h2>
          {employee.email && (
            <p style={{ fontSize: 14, color: "#6b7280" }}>{employee.email}</p>
          )}
          {employee.role && (
            <p style={{ fontSize: 13, color: "#9ca3af", marginTop: 4 }}>
              Role: {employee.role}
            </p>
          )}
        </div>

        <div
          style={{
            display: "flex",
            gap: 16,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <div style={statCard}>
            <span style={statLabel}>Month</span>
            <span style={statValue}>{month.format("MMMM YYYY")}</span>
          </div>
          <div style={statCard}>
            <span style={statLabel}>Days Present</span>
            <span style={statValue}>{summary.daysPresent}</span>
          </div>
          <div style={statCard}>
            <span style={statLabel}>Total Hours</span>
            <span style={statValue}>{summary.totalHours}</span>
          </div>
        </div>
      </div>

      {/* DAILY TABLE */}
      <div
        style={{
          borderRadius: 12,
          border: "1px solid #e5e7eb",
          background: "#ffffff",
          overflow: "hidden",
        }}
      >
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead style={{ background: "#f9fafb" }}>
            <tr>
              <th style={th}>Date</th>
              <th style={th}>Day</th>
              <th style={th}>Status</th>
              <th style={th}>First Login</th>
              <th style={th}>Last Logout</th>
              <th style={th}>Hours</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: daysInMonth }).map((_, index) => {
              const day = index + 1;
              const dateObj = month.date(day);
              const info = computeDayInfo(day);

              const isWeekend =
                dateObj.day() === 0 || dateObj.day() === 6; // Sun / Sat

              let status = "Absent";
              let badgeBg = "#fee2e2";
              let badgeColor = "#b91c1c";

              if (isWeekend) {
                status = "Weekend";
                badgeBg = "#e5e7eb";
                badgeColor = "#374151";
              }

              if (info && info.hours) {
                status = "Present";
                badgeBg = "#dcfce7";
                badgeColor = "#166534";
              }

              const rowBg = index % 2 === 0 ? "#ffffff" : "#f9fafb";

              return (
                <tr key={day} style={{ background: rowBg }}>
                  <td style={td}>
                    {dateObj.format("YYYY-MM-DD")}
                  </td>
                  <td style={td}>
                    {dateObj.format("ddd")}
                  </td>
                  <td style={td}>
                    <span
                      style={{
                        padding: "2px 8px",
                        borderRadius: 999,
                        fontSize: 12,
                        background: badgeBg,
                        color: badgeColor,
                        fontWeight: 500,
                      }}
                    >
                      {status}
                    </span>
                  </td>
                  <td style={td}>
                    {info?.firstLogin
                      ? dayjs(info.firstLogin.timestamp).format("HH:mm")
                      : "-"}
                  </td>
                  <td style={td}>
                    {info?.lastLogout
                      ? dayjs(info.lastLogout.timestamp).format("HH:mm")
                      : "-"}
                  </td>
                  <td style={td}>{info?.hours || "-"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </ERPLayout>
  );
}

const btn = {
  padding: "8px 14px",
  background: "#2563eb",
  color: "white",
  border: "none",
  borderRadius: 8,
  cursor: "pointer",
  fontSize: 13,
};

const th: React.CSSProperties = {
  padding: 10,
  fontSize: 12,
  fontWeight: 600,
  borderBottom: "1px solid #e5e7eb",
  textAlign: "left",
  whiteSpace: "nowrap",
};

const td: React.CSSProperties = {
  padding: 10,
  fontSize: 13,
  borderBottom: "1px solid #f3f4f6",
  whiteSpace: "nowrap",
};

const statCard: React.CSSProperties = {
  padding: "8px 14px",
  borderRadius: 10,
  background: "#f9fafb",
  border: "1px solid #e5e7eb",
  minWidth: 110,
};

const statLabel: React.CSSProperties = {
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: 0.5,
  color: "#6b7280",
};

const statValue: React.CSSProperties = {
  fontSize: 16,
  fontWeight: 700,
  color: "#111827",
};
