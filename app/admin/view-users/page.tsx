"use client";

import React, { useEffect, useState } from "react";

export default function ViewUsersPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadUsers() {
      try {
        const res = await fetch("/api/admin/list-users", {
          method: "GET",
          credentials: "include",
        });

        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error || "Failed to load users");
        }

        setUsers(data.users || []);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    loadUsers();
  }, []);

  return (
    <div
      style={{
        minHeight: "100vh",
        fontFamily: "Inter, sans-serif",
        backgroundColor: "#f9fafb",
        padding: "40px",
      }}
    >
      {/* Page Heading */}
      <h1
        style={{
          fontSize: "28px",
          fontWeight: 700,
          marginBottom: "20px",
          color: "#111827",
        }}
      >
        Users Management
      </h1>

      {loading && (
        <p style={{ color: "#6b7280", fontSize: "16px" }}>Loading users…</p>
      )}

      {error && (
        <p
          style={{
            background: "#fee2e2",
            color: "#b91c1c",
            padding: "12px",
            borderRadius: "8px",
            marginBottom: "20px",
          }}
        >
          {error}
        </p>
      )}

      {/* USERS TABLE */}
      {!loading && !error && (
        <div
          style={{
            marginTop: "20px",
            background: "white",
            borderRadius: "12px",
            padding: "20px",
            boxShadow: "0 2px 10px rgba(0,0,0,0.06)",
          }}
        >
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#f3f4f6" }}>
                <th style={thStyle}>Name</th>
                <th style={thStyle}>Email</th>
                <th style={thStyle}>Role</th>
                <th style={thStyle}>Action</th>
              </tr>
            </thead>

            <tbody>
              {users.map((user, idx) => (
                <tr key={idx} style={{ borderBottom: "1px solid #e5e7eb" }}>
                  <td style={tdStyle}>{user.name}</td>
                  <td style={tdStyle}>{user.email}</td>
                  <td style={tdStyle}>{user.role}</td>
                  <td style={tdStyle}>
                    <a
                      href={`/admin/view-users/${user.uid}`}
                      style={{
                        padding: "6px 12px",
                        background: "#06b6d4",
                        color: "white",
                        borderRadius: "6px",
                        textDecoration: "none",
                        fontSize: "14px",
                        fontWeight: 600,
                      }}
                    >
                      View
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {users.length === 0 && (
            <p
              style={{
                marginTop: "20px",
                textAlign: "center",
                color: "#6b7280",
              }}
            >
              No users found.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

const thStyle = {
  textAlign: "left" as const,
  padding: "12px",
  fontWeight: 600,
  color: "#374151",
  fontSize: "14px",
};

const tdStyle = {
  padding: "12px",
  fontSize: "14px",
  color: "#374151",
};
