"use client";

import React, { useEffect, useState } from "react";
import ERPLayout from "@/components/layouts/ERPLayout";

export default function HREmployeesPage() {
  const [employees, setEmployees] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/hr/employees/list", {
          method: "GET",
          credentials: "include",
        });

        if (res.ok) {
          const data = await res.json();

          // Try multiple possible payload shapes
          const list =
            data.employees ||
            data.users ||
            data.list ||
            (Array.isArray(data) ? data : []);

          setEmployees(list);
        }
      } catch (err) {
        console.error("HR Employees fetch error:", err);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  return (
    <ERPLayout role="hr" title="Employees">
      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        {/* Page Header */}
        <div>
          <h2 style={{ fontSize: 24, fontWeight: 600 }}>Employee Directory</h2>
          <p style={{ fontSize: 14, color: "#6b7280" }}>
            Manage employee roles, access, and details.
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
                <th style={th}>Role</th>
                <th style={th}>Status</th>
                <th style={th}>Actions</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} style={loadingCell}>
                    Loading…
                  </td>
                </tr>
              ) : employees.length === 0 ? (
                <tr>
                  <td colSpan={5} style={loadingCell}>
                    No employees found.
                  </td>
                </tr>
              ) : (
                employees.map((u) => (
                  <tr key={u.id} style={row}>
                    <td style={td}>{u.name || "—"}</td>
                    <td style={td}>{u.email || "—"}</td>
                    <td style={td}>{u.role || "—"}</td>
                    <td style={td}>
                      <span
                        style={{
                          padding: "4px 8px",
                          borderRadius: 6,
                          background:
                            u.status === "active" ? "#ecfdf5" : "#fef2f2",
                          color:
                            u.status === "active" ? "#065f46" : "#b91c1c",
                          border:
                            u.status === "active"
                              ? "1px solid #a7f3d0"
                              : "1px solid #fecaca",
                          fontSize: 12,
                          fontWeight: 600,
                        }}
                      >
                        {u.status || "unknown"}
                      </span>
                    </td>
                    <td style={td}>
                      <button
                        style={smallBtn}
                        onClick={() => alert("Edit user coming soon")}
                      >
                        Edit
                      </button>
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

/* -------------------- STYLES -------------------- */

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

const smallBtn: React.CSSProperties = {
  padding: "6px 12px",
  borderRadius: 6,
  background: "#2563eb",
  color: "#fff",
  border: "none",
  fontSize: 12,
  cursor: "pointer",
  fontWeight: 600,
};
