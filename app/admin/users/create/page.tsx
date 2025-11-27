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

    try {
      const res = await fetch("/api/admin/users/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName: name,
          email,
          role,
          password,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setMsg(data.error || "Failed to create user");
      } else {
        setMsg("User created successfully!");
        setName("");
        setEmail("");
        setPassword("");
        setRole("SALES");
      }
    } catch (err: any) {
      setMsg("Unexpected error: " + err.message);
    }

    setLoading(false);
  };

  return (
    <div
      style={{
        padding: "20px",
        maxWidth: "600px",
        margin: "0 auto",
      }}
    >
      <h1
        style={{
          fontSize: "22px",
          fontWeight: 600,
          marginBottom: "20px",
        }}
      >
        Create New User
      </h1>

      <form onSubmit={submitUser}>
        {/* Name */}
        <div style={{ marginBottom: "15px" }}>
          <label style={{ display: "block", marginBottom: "6px" }}>
            Full Name
          </label>
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={{
              width: "100%",
              padding: "10px",
              borderRadius: "6px",
              border: "1px solid #ccc",
            }}
          />
        </div>

        {/* Email */}
        <div style={{ marginBottom: "15px" }}>
          <label style={{ display: "block", marginBottom: "6px" }}>
            Email
          </label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{
              width: "100%",
              padding: "10px",
              borderRadius: "6px",
              border: "1px solid #ccc",
            }}
          />
        </div>

        {/* Password */}
        <div style={{ marginBottom: "15px" }}>
          <label style={{ display: "block", marginBottom: "6px" }}>
            Password
          </label>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{
              width: "100%",
              padding: "10px",
              borderRadius: "6px",
              border: "1px solid #ccc",
            }}
          />
        </div>

        {/* Role */}
        <div style={{ marginBottom: "15px" }}>
          <label style={{ display: "block", marginBottom: "6px" }}>
            Role
          </label>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            style={{
              width: "100%",
              padding: "10px",
              borderRadius: "6px",
              border: "1px solid #ccc",
            }}
          >
            <option value="SUPER_ADMIN">SUPER_ADMIN</option>
            <option value="ADMIN">ADMIN</option>
            <option value="SALES_MANAGER">SALES_MANAGER</option>
            <option value="SALES">SALES</option>
            <option value="ACCOUNT_MANAGER">ACCOUNT_MANAGER</option>
            <option value="PRODUCTION">PRODUCTION</option>
            <option value="HR">HR</option>
            <option value="FINANCE">FINANCE</option>
            <option value="CLIENT">CLIENT</option>
          </select>
        </div>

        {/* Submit button */}
        <button
          type="submit"
          disabled={loading}
          style={{
            width: "100%",
            padding: "12px",
            background: "var(--primary)",
            color: "#fff",
            borderRadius: "6px",
            border: "none",
            fontWeight: 600,
            cursor: "pointer",
            opacity: loading ? 0.6 : 1,
          }}
        >
          {loading ? "Creating..." : "Create User"}
        </button>

        {/* Message */}
        {msg && (
          <p
            style={{
              marginTop: "10px",
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
