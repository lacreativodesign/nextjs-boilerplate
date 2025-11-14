"use client";

import React, { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";

export default function EditUserPage() {
  const router = useRouter();
  const params = useParams();
  const uid = params.uid as string;

  const [email, setEmail] = useState("");
  const [role, setRole] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const ROLES = ["admin", "sales", "am", "production", "hr", "finance", "client"];

  async function loadUser() {
    try {
      const res = await fetch(`/api/admin/get-user?uid=${uid}`, {
        credentials: "include",
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setEmail(data.user.email);
      setRole(data.user.role);
    } catch (err: any) {
      setError(err.message || "Failed to load user");
    } finally {
      setLoading(false);
    }
  }

  async function handleSave(e: any) {
    e.preventDefault();
    setSaving(true);
    setError("");

    try {
      const res = await fetch(`/api/admin/update-user`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid, email, role }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      alert("User updated successfully!");
      router.push("/admin/view-users");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    loadUser();
  }, []);

  return (
    <div
      style={{
        minHeight: "100vh",
        backgroundColor: "#f9fafb",
        fontFamily: "Inter, sans-serif",
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
        <h1 style={{ fontSize: 20, fontWeight: 600 }}>Edit User</h1>

        <button
          onClick={() => router.push("/admin/view-users")}
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
      </header>

      {/* MAIN CONTENT */}
      <main style={{ padding: 40, maxWidth: 500, margin: "0 auto" }}>
        {loading ? (
          <p style={{ fontSize: 16, color: "#6b7280" }}>Loading user...</p>
        ) : (
          <>
            {error && (
              <div
                style={{
                  marginBottom: 20,
                  padding: 12,
                  background: "#FEE2E2",
                  color: "#B91C1C",
                  borderRadius: 8,
                }}
              >
                {error}
              </div>
            )}

            <form
              onSubmit={handleSave}
              style={{
                background: "white",
                padding: 30,
                borderRadius: 12,
                boxShadow: "0 2px 10px rgba(0,0,0,0.05)",
              }}
            >
              {/* EMAIL */}
              <label style={labelStyle}>Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                style={inputStyle}
              />

              {/* ROLE */}
              <label style={labelStyle}>Role</label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                required
                style={{ ...inputStyle, cursor: "pointer" }}
              >
                <option value="">Select role</option>
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r.toUpperCase()}
                  </option>
                ))}
              </select>

              {/* SAVE BUTTON */}
              <button
                type="submit"
                disabled={saving}
                style={{
                  width: "100%",
                  padding: "12px",
                  marginTop: 20,
                  borderRadius: 8,
                  border: "none",
                  background: "#10b981",
                  color: "white",
                  fontSize: 16,
                  fontWeight: 600,
                  cursor: "pointer",
                  opacity: saving ? 0.6 : 1,
                }}
              >
                {saving ? "Saving..." : "Save Changes"}
              </button>
            </form>
          </>
        )}
      </main>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 14,
  marginBottom: 6,
  marginTop: 15,
  color: "#374151",
  fontWeight: 500,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "12px",
  borderRadius: 8,
  border: "1px solid #d1d5db",
  fontSize: 14,
  outline: "none",
};
