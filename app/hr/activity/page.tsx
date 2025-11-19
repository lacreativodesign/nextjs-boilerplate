"use client";

import React, { useEffect, useState } from "react";
import ERPLayout from "@/components/layouts/ERPLayout";

type ActivityRecord = {
  id: string;
  userId: string;
  name: string;
  email: string;
  action: string;
  timestamp: string;
  details?: string;
};

export default function HRActivityLogPage() {
  const [records, setRecords] = useState<ActivityRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/hr/activity/list", {
          method: "GET",
          credentials: "include",
        });

        const json = await res.json();

        const arr =
          json.records ||
          json.logs ||
          json.data ||
          (Array.isArray(json) ? json : []);

        setRecords(arr);
      } catch (err) {
        console.error("Activity fetch error:", err);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  return (
    <ERPLayout role="hr" title="Activity Log">
      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        {/* PAGE HEADER */}
        <div>
          <h2 style={{ fontSize: 24, fontWeight: 600 }}>Employee Activity Log</h2>
          <p style={{ fontSize: 14, color: "#6b7280" }}>
            Monitor every action taken across the ERP system.
          </p>
        </div>

        {/* TABLE */}
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
                <th style={th}>Action</th>
                <th style={th}>Details</th>
                <th style={th}>Timestamp</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} style={loadingCell}>
                    Loading...
                  </td>
                </tr>
              ) : records.length === 0 ? (
                <tr>
                  <td colSpan={5} style={loadingCell}>
                    No activity recorded.
                  </td>
                </tr>
              ) : (
                records.map((r) => (
                  <tr key={r.id} style={row}>
                    <td style={td}>{r.name || "—"}</td>
                    <td style={td}>{r.email || "—"}</td>
                    <td style={td}>
                      <span
                        style={{
                          padding: "4px 10px",
                          borderRadius: 6,
                          background: "#eef2ff",
                          color: "#4f46e5",
                          border: "1px solid #c7d2fe",
                          fontWeight: 600,
                          fontSize: 12,
                        }}
                      >
                        {r.action}
                      </span>
                    </td>
                    <td style={td}>{r.details || "—"}</td>
                    <td style={td}>
                      {new Date(r.timestamp).toLocaleString()}
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
