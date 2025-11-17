"use client";

import React, { useEffect, useState } from "react";

export default function HRAttendancePage() {
  const [attendance, setAttendance] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [openRow, setOpenRow] = useState<string | null>(null);

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

  const toggleRow = (userId: string) => {
    setOpenRow(openRow === userId ? null : userId);
  };

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
                <th style={th}></th>
                <th style={th}>Name</th>
                <th style={th}>Email</th>
                <th style={th}>Role</th>
                <th style={th}>Last Login</th>
              </tr>
            </thead>

            <tbody>
              {attendance.map((u) => {
                const lastLog = u.logs?.[0];

                return (
                  <>
                    <tr
                      key={u.userId}
                      style={{ borderBottom: "1px solid #f3f4f6" }}
                    >
                      <td style={td}>
                        <button
                          onClick={() => toggleRow(u.userId)}
                          style={{
                            border: "none",
                            background: "transparent",
                            cursor: "pointer",
                            fontSize: "18px",
                          }}
                        >
                          {openRow === u.userId ? "▾" : "▸"}
                        </button>
                      </td>

                      <td style={td}>{u.name}</td>
                      <td style={td}>{u.email}</td>
                      <td style={td}>{u.role}</td>

                      <td style={td}>
                        {lastLog
                          ? new Date(lastLog.timestamp).toLocaleString()
                          : "No logins yet"}
                      </td>
                    </tr>

                    {/* EXPANDED ROW */}
                    {openRow === u.userId && (
                      <tr>
                        <td colSpan={5} style={expandedBox}>
                          <h3 style={expHeader}>Full Attendance History</h3>

                          {u.logs.length === 0 && (
                            <p style={{ color: "#6b7280" }}>
                              No attendance records found.
                            </p>
                          )}

                          {u.logs.length > 0 && (
                            <ul style={{ paddingLeft: "20px" }}>
                              {u.logs.map((log: any, idx: number) => (
                                <li
                                  key={idx}
                                  style={{
                                    marginBottom: "6px",
                                    fontSize: "14px",
                                    color: "#374151",
                                  }}
                                >
                                  {new Date(log.timestamp).toLocaleString()}
                                </li>
                              ))}
                            </ul>
                          )}
                        </td>
                      </tr>
                    )}
                  </>
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

const expandedBox = {
  background: "#f9fafb",
  padding: "20px",
  borderTop: "1px solid #e5e7eb",
};

const expHeader = {
  fontSize: "16px",
  fontWeight: 600,
  marginBottom: "10px",
};
