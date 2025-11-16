"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type UserRecord = {
  uid: string;
  name: string;
  email: string;
  role: string;
  status: string;
};

export default function AdminViewUsersPage() {
  const router = useRouter();

  const [users, setUsers] = useState<UserRecord[]>([]);
  const [filtered, setFiltered] = useState<UserRecord[]>([]);
  const [search, setSearch] = useState("");
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

  // Load all users
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/admin/list-users", {
          credentials: "include",
        });
        const data = await res.json();

        if (!res.ok) throw new Error(data?.error || "Failed to load users");

        setUsers(data.users);
        setFiltered(data.users);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  // Live search filter
  useEffect(() => {
    const term = search.toLowerCase();

    const results = users.filter((u) =>
      u.name.toLowerCase().includes(term) ||
      u.email.toLowerCase().includes(term) ||
      u.role.toLowerCase().includes(term)
    );

    setFiltered(results);
  }, [search, users]);

  if (loading) {
    return (
      <div
        style={{
          padding: 40,
          textAlign: "center",
          fontFamily: "Inter, sans-serif",
        }}
      >
        Loading users…
      </div>
    );
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
      {/* HEADER */}
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
        <h1 style={{ fontSize: 20, fontWeight: 600 }}>Admin · View Users</h1>

        <button
          onClick={handleLogout}
          style={{
            padding: "10px 20px",
            borderRadius: 8,
            border: "none",
            background: "#ef4444",
            color: "#fff",
            cursor: "pointer",
            fontWeight: 600,
          }}
        >
          LOGOUT
        </button>
      </header>

      <main style={{ padding: "40px" }}>
        {/* Search Bar */}
        <input
          type="text"
          placeholder="Search by name, email, or role…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            width: "100%",
            maxWidth: 400,
            padding: 12,
            marginBottom: 30,
            borderRadius: 8,
            border: "1px solid #d1d5db",
            fontSize: 15,
          }}
        />

        {/* Error message */}
        {error && (
          <div
            style={{
              marginBottom: 16,
              padding: 12,
              background: "#FEE2E2",
              color: "#B91C1C",
              borderRadius: 8,
            }}
          >
            {error}
          </div>
        )}

        {/* Users List */}
        <div
          style={{
            background: "#fff",
            padding: 20,
            borderRadius: 12,
            border: "1px solid #e5e7eb",
            boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
          }}
        >
          {filtered.length === 0 ? (
            <div style={{ padding: 20, textAlign: "center", color: "#6b7280" }}>
              No users found.
            </div>
          ) : (
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: 15,
              }}
            >
              <thead>
                <tr style={{ background: "#f3f4f6", textAlign: "left" }}>
                  <th style={{ padding: 12 }}>Name</th>
                  <th style={{ padding: 12 }}>Email</th>
                  <th style={{ padding: 12 }}>Role</th>
                  <th style={{ padding: 12 }}>Status</th>
                  <th style={{ padding: 12 }}>Actions</th>
                </tr>
              </thead>

              <tbody>
                {filtered.map((u) => (
                  <tr
                    key={u.uid}
                    style={{
                      borderBottom: "1px solid #e5e7eb",
                    }}
                  >
                    <td style={{ padding: 12 }}>{u.name}</td>
                    <td style={{ padding: 12 }}>{u.email}</td>
                    <td style={{ padding: 12, textTransform: "uppercase" }}>
                      {u.role}
                    </td>
                    <td style={{ padding: 12 }}>{u.status}</td>
                    <td style={{ padding: 12 }}>
                      <button
                        onClick={() =>
                          router.push(`/admin/view-users/${u.uid}`)
                        }
                        style={{
                          padding: "6px 12px",
                          borderRadius: 6,
                          border: "none",
                          background: "#0ea5e9",
                          color: "white",
                          cursor: "pointer",
                          fontWeight: 600,
                        }}
                      >
                        View / Edit →
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </main>
    </div>
  );
        }
