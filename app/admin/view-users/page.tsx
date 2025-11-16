"use client";

import React, { useEffect, useState } from "react";

export default function ViewUsersPage() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  async function fetchUsers() {
    try {
      const res = await fetch("/api/admin/list-users");
      const data = await res.json();

      if (data.users) {
        setUsers(data.users);
      }
    } catch (err) {
      console.error("Fetch users error:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchUsers();
  }, []);

  return (
    <div style={{ padding: "40px" }}>
      <h1 style={{ fontSize: "24px", fontWeight: 600 }}>All Users</h1>

      {loading ? (
        <p style={{ marginTop: "20px" }}>Loading...</p>
      ) : users.length === 0 ? (
        <p style={{ marginTop: "20px", color: "#6b7280" }}>
          No users found.
        </p>
      ) : (
        <div style={{ marginTop: "20px" }}>
          {users.map((user) => (
            <div
              key={user.id}
              style={{
                background: "#fff",
                padding: "15px",
                marginBottom: "10px",
                borderRadius: "8px",
                boxShadow: "0 2px 4px rgba(0,0,0,0.06)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div>
                <p style={{ fontWeight: 600 }}>{user.email}</p>
                <p style={{ fontSize: "14px", color: "#6b7280" }}>
                  Role: {user.role}
                </p>
              </div>

              <div style={{ display: "flex", gap: "10px" }}>
                <a
                  href={`/admin/view-users/${user.id}`}
                  style={{
                    padding: "8px 12px",
                    background: "#3b82f6",
                    color: "white",
                    borderRadius: "6px",
                    textDecoration: "none",
                  }}
                >
                  Edit
                </a>
                <a
                  href={`/admin/delete-user?id=${user.id}`}
                  style={{
                    padding: "8px 12px",
                    background: "#ef4444",
                    color: "white",
                    borderRadius: "6px",
                    textDecoration: "none",
                  }}
                >
                  Delete
                </a>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
