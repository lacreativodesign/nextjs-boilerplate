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

const ROLES = [
  "admin",
  "sales",
  "am",
  "production",
  "hr",
  "finance",
  "client",
];

export default function AdminUserDetailPage({ params }: any) {
  const router = useRouter();
  const { uid } = params;

  const [user, setUser] = useState<UserRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function handleLogout() {
    try {
      await fetch("/api/logout", { method: "POST", credentials: "include" });
      window.location.href = "/login";
    } catch (err) {
      console.error("Logout failed:", err);
    }
  }

  // Load user by UID
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/admin/get-user?uid=${uid}`, {
          credentials: "include",
        });
        const data = await res.json();

        if (!res.ok) throw new Error(data?.error || "Failed loading user");

        setUser(data.user);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [uid]);

  async function saveChanges() {
    if (!user) return;

    try {
      setSaving(true);
      setError("");
      setSuccess("");

      const res = await fetch("/api/admin/update-user", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uid: user.uid,
          name: user.name,
          role: user.role,
          status: user.status,
        }),
      });

      const data = await res.json();

      if (!res.ok) throw new Error(data?.error || "Failed to update user");

      setSuccess("User updated successfully");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function deleteUser() {
    if (!confirm("Are you sure? This action cannot be undone.")) return;

    try {
      setSaving(true);

      const res = await fetch("/api/admin/delete-user", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid }),
      });

      const data = await res.json();

      if (!res.ok) throw new Error(data?.error || "Delete failed");

      router.push("/admin/view-users");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div
        style={{
          padding: 40,
          textAlign: "center",
          fontFamily: "Inter, sans-serif",
        }}
      >
        Loading user…
      </div>
    );
  }

  if (!user) {
    return (
      <div
        style={{
          padding: 40,
          textAlign: "center",
          fontFamily: "Inter, sans-serif",
        }}
      >
        User not found.
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
        <h1 style={{ fontSize: 20, fontWeight: 600 }}>
          Admin · Edit User ({user.role})
        </h1>

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

      {/* BODY */}
      <main style={{ padding: 40 }}>
        <button
          onClick={() => router.push("/admin/view-users")}
          style={{
            marginBottom: 20,
            padding: "8px 14px",
            background: "#e5e7eb",
            border: "none",
            borderRadius: 6,
            cursor: "pointer",
            fontWeight: 500,
          }}
        >
          ← Back to all users
        </button>

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

        {success && (
          <div
            style={{
              marginBottom: 16,
              padding: 12,
              background: "#DCFCE7",
              color: "#166534",
              borderRadius: 8,
            }}
          >
            {success}
          </div>
        )}

        {/* FORM */}
        <div
          style={{
            background: "#fff",
            padding: 30,
            borderRadius: 12,
            border: "1px solid #e5e7eb",
            maxWidth: 500,
            boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
          }}
        >
          {/* Name */}
          <label style={{ fontWeight: 600 }}>Name</label>
          <input
            type="text"
            value={user.name}
            onChange={(e) => setUser({ ...user, name: e.target.value })}
            style={{
              width: "100%",
              padding: 12,
              borderRadius: 8,
              border: "1px solid #d1d5db",
              marginTop: 6,
              marginBottom: 18,
            }}
          />

          {/* Email (read-only) */}
          <label style={{ fontWeight: 600 }}>Email</label>
          <input
            type="text"
            readOnly
            value={user.email}
            style={{
              width: "100%",
              padding: 12,
              borderRadius: 8,
              border: "1px solid #d1d5db",
              background: "#f3f4f6",
              marginTop: 6,
              marginBottom: 18,
            }}
          />

          {/* Role */}
          <label style={{ fontWeight: 600 }}>Role</label>
          <select
            value={user.role}
            onChange={(e) => setUser({ ...user, role: e.target.value })}
            style={{
              width: "100%",
              padding: 12,
              borderRadius: 8,
              border: "1px solid #d1d5db",
              marginTop: 6,
              marginBottom: 18,
            }}
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r.toUpperCase()}
              </option>
            ))}
          </select>

          {/* Status */}
          <label style={{ fontWeight: 600 }}>Status</label>
          <select
            value={user.status}
            onChange={(e) => setUser({ ...user, status: e.target.value })}
            style={{
              width: "100%",
              padding: 12,
              borderRadius: 8,
              border: "1px solid #d1d5db",
              marginTop: 6,
              marginBottom: 20,
            }}
          >
            <option value="active">ACTIVE</option>
            <option value="suspended">SUSPENDED</option>
            <option value="disabled">DISABLED</option>
          </select>

          {/* Buttons */}
          <div style={{ display: "flex", gap: 12 }}>
            <button
              disabled={saving}
              onClick={saveChanges}
              style={{
                flex: 1,
                padding: "12px",
                background: "#0ea5e9",
                borderRadius: 8,
                border: "none",
                color: "white",
                cursor: "pointer",
                fontWeight: 600,
                opacity: saving ? 0.6 : 1,
              }}
            >
              {saving ? "Saving…" : "Save Changes"}
            </button>

            <button
              disabled={saving}
              onClick={deleteUser}
              style={{
                flex: 1,
                padding: "12px",
                background: "#ef4444",
                borderRadius: 8,
                border: "none",
                color: "white",
                cursor: "pointer",
                fontWeight: 600,
                opacity: saving ? 0.6 : 1,
              }}
            >
              Delete User
            </button>
          </div>
        </div>
      </main>
    </div>
  );
          }
