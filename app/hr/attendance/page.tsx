"use client";

import React, { useEffect, useState } from "react";
import ERPLayout from "@/components/layouts/ERPLayout";

type AttendanceLog = {
  id: string;
  userId: string;
  email: string;
  name: string;
  type: "login" | "logout";
  timestamp: string;
};

export default function HRAttendancePage() {
  const [logs, setLogs] = useState<AttendanceLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/hr/attendance/list", {
          method: "GET",
          credentials: "include",
        });

        const json = await res.json();

        // Accept multiple shapes from backend
        const arr =
          json.logs ||
          json.data ||
          json.attendance ||
          (Array.isArray(json) ? json : []);

        setLogs(arr);
      } catch (err) {
        console.error("Attendance fetch error:", err);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  return (
    <ERPLayout role="hr" title="Attendance">
      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        {/* Page Header */}
        <div>
          <h2 style={{ fontSize: 24, fontWeight: 600 }}>Attendance Logs</h2>
          <p style={{ fontSize: 14, color: "#6b7280" }}>
            View login and logout records for all employees.
          </p>
        </div>

        {/* Table */}
        <div
          style={{
            background: "#fff",
            borderRadius: 12,
            border: "1px solid #e5e7eb",
            boxShadow: "0 2px 4px rgba(0,0,0,0.05)",
            overflowX: "auto",
          }}
        >
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: 14,
            }}
          >
            <thead>
              <tr style={{ background: "#f9fafb", textAlign: "left" }}>
                <th style={th}>Name</th>
                <th style={th}>Email</th>
                <th style={th}>Type</th>
                <th style={th}>Timestamp</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={4} style={loadingCell}>
                    Loading...
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={4} style={loadingCell}>
                    No attendance logs found.
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.id} style={row}>
                    <td style={td}>{log.name || "—"}</td>
                    <td style={td}>{log.email || "—"}</td>
                    <td style={td}>
                      <span
                        style={{
                          padding: "4px 8px",
                          borderRadius: 6,
                          background:
                            log.type === "login" ? "#ecfdf5" : "#fef2f2",
                          color:
                            log.type === "login" ? "#065f46" : "#b91c1c",
                          border:
                            log.type === "login"
                              ? "1px solid #a7f3d0"
                              : "1px solid #fecaca",
                          fontWeight: 600,
                          fontSize: 12,
                        }}
                      >
                        {log.type.toUpperCase()}
                      </span>
                    </td>
                    <td style={td}>
                      {new Date(log.timestamp).toLocaleString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </ERPLayout>
  );
}

/* -------------------- TABLE STYLES -------------------- */

const th: React.CSSProperties = {
  padding: "14px 16px",
  fontWeight: 600,
  fontSize: 13,
  borderBottom: "1px solid #e5e7eb",
  color: "#374151",
};

const td: React.CSSProperties = {
  padding: "14px 16px",
  borderBottom: "1px solid #f3f4f6",
  color: "#374151",
};

const row: React.CSSProperties = {
  background: "#fff",
};

const loadingCell: React.CSSProperties = {
  textAlign: "center",
  padding: 30,
  color: "#6b7280",
};
