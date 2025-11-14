"use client";

import React, { useEffect, useState } from "react";

export default function ViewUsersPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function fetchUsers() {
    try {
      setLoading(true);
      const res = await fetch("/api/admin/list-users", {
        method: "GET",
        credentials: "include",
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load users");

      setUsers(data.users || []);
    } catch (err: any) {
      setError(err.message || "Unable to load users");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchUsers();
  }, []);

  return (
    <div
      style={{
        minHeight: "100vh",
        backgroundColor: "#f9fafb",
        fontFamily: "Inter, sans-serif",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* TOP BAR */}
      <header
        style={{
          backgroundColor: "#111827",
          color: "white",
          padding: "20px 40px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          boxShadow: "0 2px 10px rgba(0,0,0,0.1)",
        }}
      >
        <h1 style={{ fontSize: 20, fontWeight: 600 }}>Admin Dashboard</h1>

        <div style={{ display: "flex", gap: 12 }}>
          <button
            onClick={() => (window.location.href = "/admin")}
            style={{
              padding: "10px 20px",
              borderRadius: 8,
              border: "none",
              background: "#3b82f6",
              color: "#fff",
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            Back
          </button>
        </div>
      </header>

      {/* MAIN CONTENT */}
      <main style={{ padding: 40, flex: 1 }}>
        <h2
          style={{
            fontSize: 24,
            fontWeight: 600,
            marginBottom: 20,
            color: "#111827",
          }}
        >
          All Users 👥
        </h2>

        {error && (
          <div
            style={{
              marginBottom: 20,
              padding: "12px",
              background: "#FEE2E2",
              color: "#B91C1C",
              borderRadius: 8,
              fontSize: 14,
            }}
          >
            {error}
          </div>
        )}

        {loading && (
          <p style={{ fontSize: 16, color: "#6b7280" }}>Loading users...</p>
        )}

        {!loading && users.length === 0 && (
          <p style={{ fontSize: 16, color: "#6b7280" }}>
            No users found in system.
          </p>
        )}

        {!loading && users.length > 0 && (
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              background: "white",
              borderRadius: 8,
              overflow: "hidden",
              boxShadow: "0 2px 4px rgba(0,0,0,0.05)",
            }}
          >
            <thead style={{ background: "#f3f4f6" }}>
              <tr>
                <th style={thStyle}>Email</th>
                <th style={thStyle}>Role</th>
                <th style={thStyle}>Created</th>
                <th style={thStyle}>Actions</th>
              </tr>
            </thead>

            <tbody>
              {users.map((u, i) => (
                <tr key={i} style={{ borderBottom: "1px solid #e5e7eb" }}>
                  <td style={tdStyle}>{u.email}</td>
                  <td style={tdStyle}>{u.role}</td>
                  <td style={tdStyle}>
                    {u.createdAt
                      ? new Date(u.createdAt._seconds * 1000).toLocaleString()
                      : "—"}
                  </td>

                  <td style={tdStyle}>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button style={actionBtn("#3b82f6")}>Edit</button>
                      <button style={actionBtn("#ef4444")}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </main>
    </div>
  );
}

const thStyle: React.CSSProperties = {
  padding: "12px 16px",
  textAlign: "left",
  fontSize: 14,
  fontWeight: 600,
  color: "#374151",
};

const tdStyle: React.CSSProperties = {
  padding: "12px 16px",
  fontSize: 14,
  color: "#374151",
};

function actionBtn(color: string): React.CSSProperties {
  return {
    padding: "6px 12px",
    borderRadius: 6,
    border: "none",
    cursor: "pointer",
    background: color,
    color: "white",
    fontSize: 13,
    fontWeight: 600,
  };
}
