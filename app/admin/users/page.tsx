"use client";

import { useState } from "react";

export default function AdminCreateUserPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("Admin");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState("");

  const handleSubmit = async (e: any) => {
    e.preventDefault();
    setLoading(true);
    setResult("");

    const res = await fetch("/api/admin/create-user", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, role }),
    });

    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      setResult("❌ " + (data.error || "Failed to create user"));
    } else {
      setResult(
        `✅ User created!
Name: ${name}
Email: ${email}
Password: ${data.password}
Role: ${role}`
      );
      setName("");
      setEmail("");
      setRole("Admin");
    }
  };

  return (
    <div style={{ padding: 40 }}>
      <h1 style={{ fontSize: 30, fontWeight: "bold", marginBottom: 20 }}>
        Create New User — LA CREATIVO
      </h1>

      <form onSubmit={handleSubmit} style={{ maxWidth: 400 }}>
        <label>Name</label>
        <input
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />

        <label>Email</label>
        <input
          className="input"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />

        <label>Role</label>
        <select
          className="input"
          value={role}
          onChange={(e) => setRole(e.target.value)}
        >
          <option>Admin</option>
          <option>Sales</option>
          <option>AM</option>
          <option>Production</option>
          <option>HR</option>
          <option>Finance</option>
          <option>Client</option>
        </select>

        <button
          type="submit"
          className="btn"
          disabled={loading}
          style={{
            marginTop: 20,
            padding: "10px 20px",
            background: "#000",
            color: "#fff",
          }}
        >
          {loading ? "Creating..." : "Create User"}
        </button>
      </form>

      {result && (
        <pre
          style={{
            marginTop: 20,
            background: "#f4f4f4",
            padding: 20,
            whiteSpace: "pre-wrap",
          }}
        >
          {result}
        </pre>
      )}

      <style>{`
        .input {
          width: 100%;
          margin-bottom: 15px;
          padding: 10px;
          border: 1px solid #ccc;
          border-radius: 6px;
        }
      `}</style>
    </div>
  );
}
