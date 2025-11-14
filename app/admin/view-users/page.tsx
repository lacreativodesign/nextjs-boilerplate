"use client";

import React, { useEffect, useState } from "react";
import { db } from "@/lib/firebaseClient";
import { collection, getDocs, query, orderBy } from "firebase/firestore";

type UserRole =
  | "admin"
  | "sales"
  | "am"
  | "production"
  | "hr"
  | "finance"
  | "client";

interface UserRow {
  uid: string;
  name?: string;
  email: string;
  role: UserRole;
  createdAt?: number;
}

export default function AdminViewUsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadUsers() {
      try {
        setLoading(true);
        setError("");

        const q = query(collection(db, "users"), orderBy("createdAt", "desc"));
        const snap = await getDocs(q);

        const list: UserRow[] = [];
        snap.forEach((doc) => {
          const data = doc.data() as any;
          list.push({
            uid: doc.id,
            name: data.name || "",
            email: data.email || "",
            role: (data.role || "client") as UserRole,
            createdAt: data.createdAt || 0,
          });
        });

        setUsers(list);
      } catch (err: any) {
        console.error("LOAD USERS ERROR:", err);
        setError(err.message || "Failed to load users.");
      } finally {
        setLoading(false);
      }
    }

    loadUsers();
  }, []);

  async function handleDelete(uid: string, email: string) {
    const confirmDelete = window.confirm(
      `Are you sure you want to delete "${email}"?\nThis action cannot be undone.`
    );

    if (!confirmDelete) return;

    try {
      const res = await fetch("/api/admin/delete-user", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid }),
      });

      const data = await res.json();
      if (!res.ok || !data?.ok) {
        throw new Error(data.error || "Delete failed");
      }

      alert("User deleted successfully.");

      // Remove from local state without full reload
      setUsers((prev) => prev.filter((u) => u.uid !== uid));
    } catch (err: any) {
      console.error("DELETE USER ERROR:", err);
      alert("ERROR: " + (err.message || "Delete failed"));
    }
  }

  const tdStyle: React.CSSProperties = {
    padding: "12px 16px",
    fontSize: 14,
    color: "#111827",
    borderBottom: "1px solid #e5e7eb",
    textAlign: "left",
  };

  const thStyle: React.CSSProperties = {
    padding: "12px 16px",
    fontSize: 12,
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    color: "#6b7280",
    borderBottom: "1px solid #e5e7eb",
    textAlign: "left",
    background: "#f9fafb",
  };

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
      {/* Top Bar - same dark theme as locked Admin UI */}
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
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 600 }}>
            Admin · User Directory
          </h1>
          <p style={{ fontSize: 13, color: "#9ca3af", marginTop: 4 }}>
            Manage all LA CREATIVO roles and access from one place.
          </p>
        </div>

        <button
          onClick={() => (window.location.href = "/admin")}
          style={{
            padding: "10px 18px",
            borderRadius: 8,
            border: "none",
            background: "#374151",
            color: "#fff",
            cursor: "pointer",
            fontWeight: 500,
          }}
        >
          ← Back to Admin Home
        </button>
      </header>

      {/* Main Content */}
      <main
        style={{
          flex: 1,
          padding: "30px 40px 40px",
        }}
      >
        <div
          style={{
            maxWidth: 1100,
            margin: "0 auto",
            background: "#ffffff",
            borderRadius: 16,
            border: "1px solid #e5e7eb",
            boxShadow: "0 10px 30px rgba(15,23,42,0.08)",
            padding: 24,
          }}
        >
          <div
            style={{
              marginBottom: 16,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div>
              <h2 style={{ fontSize: 18, fontWeight: 600, color: "#111827" }}>
                Team & Clients
              </h2>
              <p
                style={{
                  fontSize: 13,
                  color: "#6b7280",
                  marginTop: 4,
                }}
              >
                View, edit, and delete users across LA CREATIVO (Admin only).
              </p>
            </div>
            <div
              style={{
                fontSize: 12,
                color: "#6b7280",
                textAlign: "right",
              }}
            >
              Total Users:{" "}
              <span style={{ fontWeight: 600, color: "#111827" }}>
                {users.length}
              </span>
            </div>
          </div>

          {loading && (
            <p
              style={{
                fontSize: 14,
                color: "#6b7280",
                padding: "16px 8px",
              }}
            >
              Loading users…
            </p>
          )}

          {error && (
            <p
              style={{
                fontSize: 14,
                color: "#b91c1c",
                padding: "16px 8px",
              }}
            >
              {error}
            </p>
          )}

          {!loading && !error && users.length === 0 && (
            <p
              style={{
                fontSize: 14,
                color: "#6b7280",
                padding: "16px 8px",
              }}
            >
              No users found yet. Create the first one from{" "}
              <strong>Admin &gt; Create User</strong>.
            </p>
          )}

          {!loading && users.length > 0 && (
            <div style={{ overflowX: "auto", marginTop: 8 }}>
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  minWidth: 600,
                }}
              >
                <thead>
                  <tr>
                    <th style={thStyle}>Name</th>
                    <th style={thStyle}>Email</th>
                    <th style={thStyle}>Role</th>
                    <th style={thStyle}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.uid}>
                      <td style={tdStyle}>{u.name || "—"}</td>
                      <td style={tdStyle}>{u.email}</td>
                      <td style={tdStyle}>{u.role.toUpperCase()}</td>
                      <td style={tdStyle}>
                        <button
                          onClick={() =>
                            (window.location.href = `/admin/edit-user/${u.uid}`)
                          }
                          style={{
                            padding: "6px 12px",
                            background: "#3b82f6",
                            color: "white",
                            border: "none",
                            borderRadius: 6,
                            cursor: "pointer",
                            marginRight: 10,
                          }}
                        >
                          Edit
                        </button>

                        <button
                          onClick={() => handleDelete(u.uid, u.email)}
                          style={{
                            padding: "6px 12px",
                            background: "#ef4444",
                            color: "white",
                            border: "none",
                            borderRadius: 6,
                            cursor: "pointer",
                          }}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
