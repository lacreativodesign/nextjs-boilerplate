"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type UserRecord = {
  uid: string;
  name: string;
  email: string;
  role: string;
  status: string;
  createdAt?: number;
};

export default function AdminViewUsersPage() {
  const router = useRouter();
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function handleLogout() {
    try {
      await fetch("/api/logout", {
        method: "POST",
        credentials: "include",
      });
      window.location.href = "/login";
    } catch (err) {
      console.error("Logout failed:", err);
    }
  }

  useEffect(() => {
    async function loadUsers() {
      try {
        setLoading(true);
        setError("");

        const res = await fetch("/api/admin/list-users", {
          method: "GET",
          credentials: "include",
        });

        const data = await res.json();

        if (!res.ok) {
          throw new Error(data?.error || "Failed to load users");
        }

        setUsers(data.users || []);
      } catch (err: any) {
        console.error("LOAD USERS ERROR:", err);
        setError(err.message || "Failed to load users");
      } finally {
        setLoading(false);
      }
    }

    loadUsers();
  }, []);

  function formatDate(ts?: number) {
    if (!ts) return "-";
    try {
      return new Date(ts).toLocaleString();
    } catch {
      return "-";
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        backgroundColor: "#f9fafb",
        fontFamily: "Inter, sans-serif",
      }}
    >
      {/* Top Bar – SAME STYLE AS ADMIN PAGE */}
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "20px 40px",
          backgroundColor: "#111827",
          color: "white",
          boxShadow: "0 2px 10px rgba(0,0,0,0.1)",
        }}
      >
        <h1 style={{ fontSize: "20px", fontWeight: 600 }}>
          Admin · View All Users
        </h1>

        <button
          onClick={handleLogout}
          style={{
            padding: "10px 20px",
            borderRadius: "8px",
            border: "none",
            background: "#ef4444",
            color: "#fff",
            cursor: "pointer",
            fontWeight: 600,
            transition: "background 0.2s ease",
          }}
          onMouseOver={(e) => (e.currentTarget.style.background = "#dc2626")}
          onMouseOut={(e) => (e.currentTarget.style.background = "#ef4444")}
        >
          LOGOUT
        </button>
      </header>

      {/* Main Content */}
      <main
        style={{
          flex: 1,
          padding: "30px 40px",
          color: "#111827",
        }}
      >
        <div
          style={{
            marginBottom: "20px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div>
            <h2 style={{ fontSize: "22px", fontWeight: 600 }}>
              Team & Users 👥
            </h2>
            <p style={{ marginTop: 6, fontSize: 14, color: "#6b7280" }}>
              Overview of all LA CREATIVO users created in the system.
            </p>
          </div>
        </div>

        {error && (
          <div
            style={{
              marginBottom: 16,
              padding: 12,
              background: "#FEE2E2",
              color: "#B91C1C",
              borderRadius: 8,
              fontSize: 14,
            }}
          >
            {error}
          </div>
        )}

        {loading ? (
          <div
            style={{
              padding: 40,
              textAlign: "center",
              color: "#6b7280",
              fontSize: 15,
            }}
          >
            Loading users…
          </div>
        ) : users.length === 0 ? (
          <div
            style={{
              padding: 40,
              textAlign: "center",
              color: "#6b7280",
              fontSize: 15,
            }}
          >
            No users found yet. Create your first user from{" "}
            <span style={{ fontWeight: 600 }}>Admin &gt; Create User</span>.
          </div>
        ) : (
          <div
            style={{
              marginTop: 10,
              borderRadius: 12,
              border: "1px solid #e5e7eb",
              overflow: "hidden",
              background: "#ffffff",
              boxShadow: "0 1px 3px rgba(15,23,42,0.05)",
            }}
          >
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: 14,
              }}
            >
              <thead
                style={{
                  background: "#f3f4f6",
                  textAlign: "left",
                }}
              >
                <tr>
                  <th style={{ padding: "12px 16px" }}>Name</th>
                  <th style={{ padding: "12px 16px" }}>Email</th>
                  <th style={{ padding: "12px 16px" }}>Role</th>
                  <th style={{ padding: "12px 16px" }}>Status</th>
                  <th style={{ padding: "12px 16px" }}>Created</th>
                  <th style={{ padding: "12px 16px", textAlign: "right" }}>
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr
                    key={u.uid}
                    style={{
                      borderTop: "1px solid #e5e7eb",
                    }}
                  >
                    <td style={{ padding: "10px 16px", fontWeight: 500 }}>
                      {u.name || "-"}
                    </td>
                    <td style={{ padding: "10px 16px", color: "#4b5563" }}>
                      {u.email}
                    </td>
                    <td style={{ padding: "10px 16px", textTransform: "uppercase", fontSize: 12 }}>
                      {u.role || "-"}
                    </td>
                    <td style={{ padding: "10px 16px" }}>
                      <span
                        style={{
                          display: "inline-block",
                          padding: "4px 10px",
                          borderRadius: 9999,
                          fontSize: 11,
                          fontWeight: 600,
                          backgroundColor:
                            u.status === "active"
                              ? "#dcfce7"
                              : u.status === "suspended"
                              ? "#fef3c7"
                              : "#fee2e2",
                          color:
                            u.status === "active"
                              ? "#15803d"
                              : u.status === "suspended"
                              ? "#92400e"
                              : "#b91c1c",
                        }}
                      >
                        {u.status || "unknown"}
                      </span>
                    </td>
                    <td style={{ padding: "10px 16px", color: "#6b7280" }}>
                      {formatDate(u.createdAt)}
                    </td>
                    <td
                      style={{
                        padding: "10px 16px",
                        textAlign: "right",
                      }}
                    >
                      <button
                        onClick={() =>
                          router.push(`/admin/view-users/${u.uid}`)
                        }
                        style={{
                          padding: "8px 14px",
                          borderRadius: 8,
                          border: "none",
                          background: "#0ea5e9",
                          color: "#fff",
                          cursor: "pointer",
                          fontWeight: 500,
                          fontSize: 13,
                        }}
                      >
                        View / Edit →
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
