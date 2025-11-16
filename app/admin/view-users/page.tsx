"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";

interface UserRecord {
  uid: string;
  name: string;
  email: string;
  role: string;
  createdAt: number;
}

export default function ViewUsersPage() {
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState(true);

  async function fetchUsers() {
    try {
      const res = await fetch("/api/admin/list-users", {
        method: "GET",
        credentials: "include",
      });

      const data = await res.json();
      if (res.ok && data?.users) {
        setUsers(data.users);
      }
    } catch (err) {
      console.error("Fetch users failed:", err);
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
        padding: "40px",
      }}
    >
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 20 }}>
        All Users 👥
      </h1>

      {loading ? (
        <p style={{ fontSize: 16, color: "#6b7280" }}>Loading users...</p>
      ) : users.length === 0 ? (
        <p style={{ fontSize: 16, color: "#6b7280" }}>No users found.</p>
      ) : (
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            backgroundColor: "#fff",
            borderRadius: 12,
            overflow: "hidden",
            boxShadow: "0 2px 10px rgba(0,0,0,0.08)",
          }}
        >
          <thead style={{ backgroundColor: "#111827", color: "#fff" }}>
            <tr>
              <th style={th}>Name</th>
              <th style={th}>Email</th>
              <th style={th}>Role</th>
              <th style={th}>Created</th>
              <th style={th}>Actions</th>
            </tr>
          </thead>

          <tbody>
            {users.map((u) => (
              <tr key={u.uid} style={{ borderBottom: "1px solid #e5e7eb" }}>
                <td style={td}>{u.name}</td>
                <td style={td}>{u.email}</td>
                <td style={td}>{u.role.toUpperCase()}</td>
                <td style={td}>
                  {new Date(u.createdAt).toLocaleDateString("en-US")}
                </td>
                <td style={td}>
                  <Link
                    href={`/admin/view-users/${u.uid}`}
                    style={{
                      color: "#06b6d4",
                      fontWeight: 600,
                      textDecoration: "none",
                    }}
                  >
                    View
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// Styles
const th: React.CSSProperties = {
  textAlign: "left",
  padding: "14px 20px",
  fontSize: 14,
  fontWeight: 600,
};

const td: React.CSSProperties = {
  padding: "14px 20px",
  fontSize: 14,
  color: "#374151",
};
