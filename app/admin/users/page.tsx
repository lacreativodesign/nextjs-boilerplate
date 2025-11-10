"use client";

import React, { useState } from "react";
import RequireAuth from "@/components/RequireAuth";

const ROLES = ["admin", "sales", "am", "production", "hr", "finance", "client"] as const;

export default function AdminUsersPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<typeof ROLES[number]>("client");
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setMsg(null);
    setErr(null);
    try {
      const res = await fetch("/api/admin/create-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, role }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create user");
      setMsg(`User created ✔`);
      setName("");
      setEmail("");
      setRole("client");
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <RequireAuth allowed={["admin"]}>
      <div style={{ minHeight: "100vh", background: "#0B1220", color: "#E5E7EB", padding: 24 }}>
        <div style={{ maxWidth: 680, margin: "0 auto" }}>
          <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 16 }}>Users — Create New</h1>

          {msg && (
            <div style={{ background: "#DCFCE7", color: "#166534", padding: 12, borderRadius: 8, marginBottom: 12 }}>
              {msg}
            </div>
          )}
          {err && (
            <div style={{ background: "#FEE2E2", color: "#991B1B", padding: 12, borderRadius: 8, marginBottom: 12 }}>
              {err}
            </div>
          )}

          <form
            onSubmit={handleCreate}
            style={{ background: "#0F172A", border: "1px solid #1F2937", borderRadius: 12, padding: 20 }}
          >
            <div style={{ display: "grid", gap: 12 }}>
              <label style={{ display: "grid", gap: 6 }}>
                <span>Name</span>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  style={inputStyle}
                  placeholder="John Carter"
                />
              </label>

              <label style={{ display: "grid", gap: 6 }}>
                <span>Email</span>
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  type="email"
                  style={inputStyle}
                  placeholder="john@company.com"
                />
              </label>

              <label style={{ display: "grid", gap: 6 }}>
                <span>Role</span>
                <select value={role} onChange={(e) => setRole(e.target.value as any)} style={inputStyle}>
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r.toUpperCase()}
                    </option>
                  ))}
                </select>
              </label>

              <button
                type="submit"
                disabled={submitting}
                style={{
                  marginTop: 8,
                  padding: "12px 16px",
                  borderRadius: 10,
                  border: "1px solid #0EA5E9",
                  background: submitting ? "#0B1220" : "#06B6D4",
                  color: "#fff",
                  fontWeight: 800,
                  cursor: submitting ? "not-allowed" : "pointer",
                }}
              >
                {submitting ? "Creating…" : "Create User & Send Email"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </RequireAuth>
  );
}

const inputStyle: React.CSSProperties = {
  padding: "12px 14px",
  borderRadius: 10,
  border: "1px solid #1F2937",
  background: "#0B1220",
  color: "#E5E7EB",
  outline: "none",
};
