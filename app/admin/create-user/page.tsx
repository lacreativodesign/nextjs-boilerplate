"use client";

import React, { useState } from "react";

export default function CreateUserPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("client");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPass, setShowPass] = useState(false);

  async function handleCreateUser(e: any) {
    e.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);

    try {
      const res = await fetch("/api/admin/create-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password, role }),
      });

      const data = await res.json();

      if (!res.ok) throw new Error(data.error || "Failed to create user");

      setSuccess("User created successfully!");
      setEmail("");
      setPassword("");
      setRole("client");
    } catch (err: any) {
      setError(err.message || "Error creating user");
    } finally {
      setLoading(false);
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
      {/* Top Bar */}
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
        <h1 style={{ fontSize: "20px", fontWeight: 600 }}>Admin Dashboard</h1>

        <button
          onClick={() => (window.location.href = "/admin")}
          style={{
            padding: "10px 20px",
            borderRadius: "8px",
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

      {/* Main Content */}
      <main
        style={{
          flex: 1,
          padding: "40px",
          maxWidth: "500px",
          margin: "0 auto",
        }}
      >
        <h2
          style={{
            fontSize: "24px",
            fontWeight: "600",
            color: "#111827",
            marginBottom: "20px",
            textAlign: "center",
          }}
        >
          Create New User 👤
        </h2>

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

        {success && (
          <div
            style={{
              marginBottom: 16,
              padding: 12,
              background: "#DCFCE7",
              color: "#166534",
              borderRadius: 8,
              fontSize: 14,
            }}
          >
            {success}
          </div>
        )}

        <form onSubmit={handleCreateUser}>
          {/* Email */}
          <label style={{ fontSize: 14, fontWeight: 500 }}>Email</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{
              width: "100%",
              padding: "12px 14px",
              marginTop: 6,
              marginBottom: 20,
              borderRadius: 8,
              border: "1px solid #CBD5E1",
            }}
          />

          {/* Password */}
          <label style={{ fontSize: 14, fontWeight: 500 }}>Password</label>
          <div style={{ position: "relative" }}>
            <input
              type={showPass ? "text" : "password"}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{
                width: "100%",
                padding: "12px 14px",
                marginTop: 6,
                marginBottom: 20,
                borderRadius: 8,
                border: "1px solid #CBD5E1",
              }}
            />
            <span
              onClick={() => setShowPass(!showPass)}
              style={{
                position: "absolute",
                right: 14,
                top: "50%",
                transform: "translateY(-50%)",
                cursor: "pointer",
                fontSize: 13,
                color: "#6b7280",
              }}
            >
              {showPass ? "HIDE" : "SHOW"}
            </span>
          </div>

          {/* Role */}
          <label style={{ fontSize: 14, fontWeight: 500 }}>Role</label>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            style={{
              width: "100%",
              padding: "12px 14px",
              marginTop: 6,
              marginBottom: 20,
              borderRadius: 8,
              border: "1px solid #CBD5E1",
              background: "white",
            }}
          >
            <option value="admin">Admin</option>
            <option value="sales">Sales</option>
            <option value="am">Account Manager</option>
            <option value="production">Production</option>
            <option value="hr">HR</option>
            <option value="finance">Finance</option>
            <option value="client">Client</option>
          </select>

          <button
            type="submit"
            disabled={loading}
            style={{
              width: "100%",
              padding: "12px",
              background: "#06B6D4",
              borderRadius: 8,
              color: "#fff",
              fontWeight: 700,
              border: "none",
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.6 : 1,
            }}
          >
            {loading ? "Creating..." : "Create User"}
          </button>
        </form>
      </main>
    </div>
  );
}
