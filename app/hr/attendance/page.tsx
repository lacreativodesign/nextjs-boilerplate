"use client";

import React, { useEffect, useState } from "react";

export default function HRAttendancePage() {
  const [attendance, setAttendance] = useState<any[]>([]);
  const [filtered, setFiltered] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [openRow, setOpenRow] = useState<string | null>(null);
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    async function loadAttendance() {
      try {
        const res = await fetch("/api/hr/attendance/list");
        const data = await res.json();

        if (data.success) {
          setAttendance(data.attendance);
          setFiltered(data.attendance);
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

  const handleFilter = (value: string) => {
    setFilter(value);

    const now = new Date();
    let start: Date | null = null;

    if (value === "today") {
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    }

    if (value === "week") {
      const firstDay = new Date(now);
      firstDay.setDate(now.getDate() - now.getDay());
      firstDay.setHours(0, 0, 0, 0);
      start = firstDay;
    }

    if (value === "month") {
      start = new Date(now.getFullYear(), now.getMonth(), 1);
    }

    if (!start) {
      setFiltered(attendance);
      return;
    }

    const filteredData = attendance.map((u) => ({
      ...u,
      logs: u.logs.filter((log: any) => new Date(log.timestamp) >= start),
    }));

    setFiltered(filteredData);
  };

  return (
    <div
      style={{
        padding: "40px",
        fontFamily: "Inter, sans-serif",
        color: "#111827",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "20px",
        }}
      >
        <div>
          <h1 style={{ fontSize: "28px", fontWeight: 700 }}>
            Attendance Overview
          </h1>
          <p style={{ color: "#6b7280", marginTop: "4px" }}>
            Track employee attendance and login activity.
          </p>
        </div>

        {/* FILTER DROPDOWN */}
        <select
          value={filter}
          onChange={(e) => handleFilter(e.target.value)}
          style={{
            padding: "10px 14px",
            background: "white",
            border: "1px solid #d1d5db",
            borderRadius: "8px",
            fontSize: "14px",
            cursor: "pointer",
            color: "#374151",
            boxShadow: "0 2px 5px rgba(0,0,0,0.05)",
          }}
        >
          <option value="all">All Time</option>
          <option value="today">Today</option>
          <option value="week">This Week</option>
          <option value="month">This Month</option>
        </select>
      </div>

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
              {filtered.map((u) => {
                const lastLog = u.logs?.[0];

                return (
                  <>
                    <tr key={u.userId} style={{ borderBottom: "1px solid #f3f4f6" }}>
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
