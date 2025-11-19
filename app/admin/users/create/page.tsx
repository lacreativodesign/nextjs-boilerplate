"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function CreateUserPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    role: "sales",
  });

  const submit = async () => {
    const res = await fetch("/api/admin/users/create", {
      method: "POST",
      body: JSON.stringify(form),
    });

    if (!res.ok) {
      alert("Error creating user");
      return;
    }

    router.push("/admin/users");
  };

  return (
    <div style={{ maxWidth: 450 }}>
      <h2 style={{ fontSize: 26, fontWeight: 700, marginBottom: 20 }}>
        Create User
      </h2>

      <label>Name</label>
      <input
        style={{
          width: "100%",
          padding: 10,
          border: "1px solid var(--border)",
          borderRadius: 8,
          marginBottom: 14,
        }}
        value={form.name}
        onChange={(e) => setForm({ ...form, name: e.target.value })}
      />

      <label>Email</label>
      <input
        style={{
          width: "100%",
          padding: 10,
          border: "1px solid var(--border)",
          borderRadius: 8,
          marginBottom: 14,
        }}
        value={form.email}
        onChange={(e) => setForm({ ...form, email: e.target.value })}
      />

      <label>Password</label>
      <input
        style={{
          width: "100%",
          padding: 10,
          border: "1px solid var(--border)",
          borderRadius: 8,
          marginBottom: 14,
        }}
        type="password"
        value={form.password}
        onChange={(e) => setForm({ ...form, password: e.target.value })}
      />

      <label>Role</label>
      <select
        style={{
          width: "100%",
          padding: 10,
          border: "1px solid var(--border)",
          borderRadius: 8,
          marginBottom: 20,
        }}
        value={form.role}
        onChange={(e) => setForm({ ...form, role: e.target.value })}
      >
        <option value="sales">Sales</option>
        <option value="sales_manager">Sales Manager</option>
        <option value="hr">HR</option>
        <option value="production">Production</option>
        <option value="admin">Admin</option>
      </select>

      <button
        onClick={submit}
        style={{
          background: "#2563eb",
          padding: "10px 18px",
          color: "white",
          borderRadius: 8,
          border: "none",
          cursor: "pointer",
          fontWeight: 600,
        }}
      >
        Create User
      </button>
    </div>
  );
          }
