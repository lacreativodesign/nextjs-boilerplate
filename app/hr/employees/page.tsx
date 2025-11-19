"use client";

import React, { useEffect, useState } from "react";
import ERPLayout from "@/components/layouts/ERPLayout";

type Employee = {
  id: string;
  name: string;
  email: string;
  role: string;
  department?: string;
  status?: string;
  createdAt?: string;
};

export default function HREmployeesPage() {
  const [list, setList] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadEmployees() {
      try {
        const res = await fetch("/api/hr/employees/list", {
          method: "GET",
          credentials: "include",
        });

        const json = await res.json();

        const arr =
          json.employees ||
          json.users ||
          json.data ||
          (Array.isArray(json) ? json : []);

        setList(arr);
      } catch (err) {
        console.error("Employees fetch error:", err);
      } finally {
        setLoading(false);
      }
    }

    loadEmployees();
  }, []);

  return (
    <ERPLayout role="hr" title="Employees">
      <h2 style={{ fontSize: 24, fontWeight: 600, marginBottom: 10 }}>
        Employee Directory
      </h2>

      <p style={{ fontSize: 14, color: "#6b7280", marginBottom: 20 }}>
        Manage all employees across departments from one central view.
      </p>

      <div
        style={{
          background: "#fff",
          borderRadius: 12,
          border: "1px solid #e5e7eb",
          boxShadow: "0 2px 4px rgba(0,0,0,0.05)",
          overflow: "hidden",
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
            <tr style={{ background: "#f9fafb" }}>
              <th style={th}>Name</th>
              <th style={th}>Email</th>
              <th style={th}>Role</th>
              <th style={th}>Department</th>
              <th style={th}>Status</th>
              <th style={th}>Joined</th>
            </tr>
          </thead>

          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} style={loadingCell}>
                  Loading...
                </td>
              </tr>
            ) : list.length === 0 ? (
              <tr>
                <td colSpan={6} style={loadingCell}>
                  No employees found.
                </td>
              </tr>
            ) : (
              list.map((e) => (
                <tr key={e.id} style={row}>
                  <td style={td}>{e.name || "—"}</td>
                  <td style={td}>{e.email || "—"}</td>
                  <td style={td}>{e.role || "—"}</td>
                  <td style={td}>{e.department || "—"}</td>
                  <td style={td}>
                    <span
                      style={{
                        padding: "4px 10px",
                        borderRadius: 6,
                        background:
                          e.status === "active" ? "#dcfce7" : "#fee2e2",
                        color: e.status === "active" ? "#166534" : "#b91c1c",
                        border:
                          e.status === "active"
                            ? "1px solid #bbf7d0"
                            : "1px solid #fecaca",
                        fontWeight: 600,
                        fontSize: 12,
                      }}
                    >
                      {e.status?.toUpperCase() || "UNKNOWN"}
                    </span>
                  </td>
                  <td style={td}>
                    {e.createdAt
                      ? new Date(e.createdAt).toLocaleDateString()
                      : "—"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </ERPLayout>
  );
}

/* ---------------- TABLE STYLES ---------------- */

const th: React.CSSProperties = {
  padding: "14px 16px",
  fontWeight: 600,
  fontSize: 13,
  borderBottom: "1px solid #e5e7eb",
  color: "#374151",
  textAlign: "left",
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
