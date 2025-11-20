"use client";

import { useEffect, useState } from "react";

export default function UsersPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const loadUsers = async () => {
    setLoading(true);
    const res = await fetch("/api/admin/users/list");
    const data = await res.json();
    setUsers(data || []);
    setLoading(false);
  };

  useEffect(() => {
    loadUsers();
  }, []);

  return (
    <div>
      <h2 style={{ fontSize: 26, fontWeight: 700, marginBottom: 20 }}>
        All Users
      </h2>

      {loading && <p>Loading users...</p>}

      {!loading && users.length === 0 && (
        <p style={{ fontSize: 16, color: "var(--text)" }}>No users found.</p>
      )}

      {!loading && users.length > 0 && (
        <div
          style={{
            marginTop: 20,
            border: "1px solid var(--border)",
            borderRadius: 10,
            overflow: "hidden",
            background: "var(--card-bg)",
          }}
        >
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead
              style={{
                background: "var(--table-head)",
                color: "var(--text)",
              }}
            >
              <tr>
                <th style={th}>Name</th>
                <th style={th}>Email</th>
                <th style={th}>Role</th>
                <th style={th}>Status</th>
                <th style={th}>Created</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.uid}>
                  <td style={td}>{u.name}</td>
                  <td style={td}>{u.email}</td>
                  <td style={td}>{u.role}</td>
                  <td style={td}>{u.disabled ? "Disabled" : "Active"}</td>
                  <td style={td}>
                    {u.createdAt
                      ? new Date(u.createdAt).toLocaleDateString()
                      : "-"}
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
  padding: "14px",
  textAlign: "left" as const,
  fontWeight: 600,
  borderBottom: "1px solid var(--border)",
};

const td = {
  padding: "14px",
  borderBottom: "1px solid var(--border)",
  fontSize: 15,
  color: "var(--text)",
};
