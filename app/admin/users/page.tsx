"use client";

import { useEffect, useState } from "react";

export default function AdminUsersPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/admin/users/list", {
          cache: "no-store",
        });
        const data = await res.json();
        setUsers(data);
      } catch (e) {
        console.error("Failed to load users:", e);
      }
      setLoading(false);
    }
    load();
  }, []);

  return (
    <div>
      <h2 style={{ fontSize: 26, fontWeight: 700, marginBottom: 15 }}>
        Users
      </h2>

      <p style={{ fontSize: 16, color: "var(--sidebar-text)" }}>
        Manage all system users, roles & access levels.
      </p>

      {loading ? (
        <p style={{ marginTop: 25, color: "#777" }}>Loading...</p>
      ) : users.length === 0 ? (
        <p style={{ marginTop: 25, color: "#999" }}>No users found.</p>
      ) : (
        <div
          style={{
            marginTop: 25,
            border: "1px solid var(--border)",
            borderRadius: 10,
            background: "var(--card-bg)",
            padding: 10,
          }}
        >
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={th}>Name</th>
                <th style={th}>Email</th>
                <th style={th}>Role</th>
                <th style={th}>Status</th>
                <th style={th}>Created</th>
              </tr>
            </thead>

            <tbody>
              {users.map((u, i) => (
                <tr key={i} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={td}>{u.name}</td>
                  <td style={td}>{u.email}</td>
                  <td style={td}>{u.role}</td>
                  <td style={td}>{u.disabled ? "Disabled" : "Active"}</td>
                  <td style={td}>
                    {new Date(u.createdAt).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const th = {
  textAlign: "left",
  padding: "12px 8px",
  fontWeight: 600,
  fontSize: 14,
  color: "var(--sidebar-text)",
};

const td = {
  padding: "12px 8px",
  fontSize: 14,
};
