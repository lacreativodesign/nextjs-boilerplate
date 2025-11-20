"use client";

import { useState } from "react";

export default function CreateUserPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("SALES");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  const submitUser = async (e: any) => {
    e.preventDefault();
    setLoading(true);
    setMsg("");

    const res = await fetch("/api/admin/users/create", {
      method: "POST",
      body: JSON.stringify({ name, email, role, password }),
    });

    setLoading(false);

    if (res.ok) {
      setMsg("User created successfully!");
      setName("");
      setEmail("");
      setPassword("");
      setRole("SALES");
    } else {
      setMsg("Error creating user.");
    }
  };

  return (
    <div>
      <h2 style={{ fontSize: 26, fontWeight: 700, marginBottom: 20 }}>
        Create User
      </h2>

      <form
        onSubmit={submitUser}
        style={{
          maxWidth: 500,
          padding: 20,
          background: "var(--card-bg)",
          borderRadius: 10,
          border: "1px solid var(--border)",
          display: "flex",
          flexDirection: "column",
          gap: 15,
        }}
      >
        <input
          placeholder="Full Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={{
            padding: 12,
            borderRadius: 8,
            border: "1px solid var(--border)",
            background: "var(--input-bg)",
            color: "var(--text)",
          }}
        />

        <input
          placeholder="Email Address"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{
            padding: 12,
            borderRadius: 8,
            border: "1px solid var(--border)",
            background: "var(--input-bg)",
            color: "var(--text)",
          }}
        />

        <select
          value={role}
          onChange={(e) => setRole(e.target.value)}
          style={{
            padding: 12,
            borderRadius: 8,
            border: "1px solid var(--border)",
            background: "var(--input-bg)",
            color: "var(--text)",
          }}
        >
          <option value="SUPER_ADMIN">SUPER ADMIN</option>
          <option value="ADMIN">ADMIN</option>
          <option value="SALES_MANAGER">SALES MANAGER</option>
          <option value="SALES">SALES</option>
          <option value="ACCOUNT_MANAGER">ACCOUNT MANAGER</option>
          <option value="PRODUCTION">PRODUCTION</option>
          <option value="HR">HR</option>
          <option value="FINANCE">FINANCE</option>
        </select>

        <input
          placeholder="Temporary Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          type="password"
          style={{
            padding: 12,
            borderRadius: 8,
            border: "1px solid var(--border)",
            background: "var(--input-bg)",
            color: "var(--text)",
          }}
        />

        <button
          type="submit"
          disabled={loading}
          style={{
            padding: 12,
            borderRadius: 8,
            background: loading ? "#888" : "#2563eb",
            color: "#fff",
            fontWeight: 600,
            cursor: loading ? "not-allowed" : "pointer",
          }}
        >
          {loading ? "Creating..." : "Create User"}
        </button>

        {msg && (
          <p
            style={{
              marginTop: 10,
              fontWeight: 600,
              color: msg.includes("success")
                ? "var(--success)"
                : "var(--danger)",
            }}
          >
            {msg}
          </p>
        )}
      </form>
    </div>
  );
          }
