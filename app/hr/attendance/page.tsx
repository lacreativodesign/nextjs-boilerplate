"use client";

import React, { useEffect, useState } from "react";

export default function HRAttendancePage() {
  const [attendance, setAttendance] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadAttendance() {
      try {
        const res = await fetch("/api/hr/attendance/list");
        const data = await res.json();

        if (data.success) {
          setAttendance(data.attendance);
        }
      } catch (err) {
        console.error("Failed to load attendance:", err);
      } finally {
        setLoading(false);
      }
    }

    loadAttendance();
  }, []);

  return (
    <div
      style={{
        padding: "40px",
        fontFamily: "Inter, sans-serif",
        color: "#111827",
      }}
    >
      <h1 style={{ fontSize: "28px", fontWeight: 700, marginBottom: "10px" }}>
        Attendance
      </h1>

      <p style={{ color: "#6b7280", marginBottom: "30px" }}>
        Daily login attendance for every employee.
      </p>

      {/* Loading State */}
      {loading && (
        <div
          style={{
            padding: "20px",
            background: "#fff",
            borderRadius: "12px",
            border: "1px solid #e5e7eb",
            boxShadow: "0 2px 6px rgba(0,0,0,0.05)",
          }}
        >
          Loading attendance...
        </div>
      )}

      {/* Attendance Table */}
      {!loading && (
        <div
          style={{
            background: "#fff",
            borderRadius: "12px",
            border: "1px solid #e5e7eb",
            boxShadow: "0 2px 6px rgba(0,0,0,0.05)",
            overflow: "hidden",
          }}
        >
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead style={{ background: "#f3f4f6" }}>
              <tr>
                <th style={th}>Name</th>
                <th style={th}>Email</th>
                <th style={th}>Role</th>
                <th style={th}>Last Login</th>
              </tr>
            </thead>

            <tbody>
              {attendance.map((u, i) => {
                const lastLog = u.logs?.[0];

                return (
                  <tr key={i} style={{ borderBottom: "1px solid #f3f4f6" }}>
                    <td style={td}>{u.name}</td>
                    <td style={td}>{u.email}</td>
                    <td style={td}>{u.role}</td>
                    <td style={td}>
                      {lastLog
                        ? new Date(lastLog.timestamp).toLocaleString()
                        : "No logins yet"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const th = {
  padding: "14px",
  fontSize: "14px",
  fontWeight: 600,
  color: "#374151",
  textAlign: "left" as const,
};

const td = {
  padding: "14px",
  fontSize: "14px",
  color: "#4b5563",
};
