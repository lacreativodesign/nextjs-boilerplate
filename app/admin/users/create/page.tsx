"use client";

import { useState } from "react";

export default function CreateUserPage() {
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  const handleSubmit = async (e: any) => {
    e.preventDefault();
    setLoading(true);
    setMsg("");

    const formData = new FormData(e.target);
    const body = Object.fromEntries(formData);

    const res = await fetch("/api/admin/users/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body),
    });

    const result = await res.json();
    setLoading(false);

    if (!res.ok) {
      setMsg(result.error || "Failed to create user.");
      return;
    }

    setMsg("User created successfully! Redirecting…");

    setTimeout(() => {
      window.location.href = "/admin/users";
    }, 1200);
  };

  return (
    <div>
      <h3 style={{ fontSize: 22, fontWeight: 700, marginBottom: 14 }}>
        Create New User
      </h3>

      {msg && (
        <div
          style={{
            marginBottom: 18,
            padding: 12,
            borderRadius: 8,
            background: "#e0f2fe",
            border: "1px solid #7dd3fc",
            color: "#0369a1",
          }}
        >
          {msg}
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: 20,
          marginBottom: 20,
        }}
      >
        <Input label="Full Name" name="name" placeholder="e.g. Sarah Khan" required />
        <Input label="Email" name="email" type="email" placeholder="name@company.com" required />
        <Input label="Password" name="password" type="password" placeholder="Temporary password" required />
        <Input label="Phone" name="phone" placeholder="+92-" />
        <Input label="CNIC" name="cnic" placeholder="XXXXX-XXXXXXX-X" />
        <Input label="Address" name="address" />
        <Input label="City" name="city" />
        <Input label="Country" name="country" />
        <Input label="Department" name="department" placeholder="Sales / HR / AM / Dev…" />

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={{ fontSize: 13, fontWeight: 500 }}>Role</label>
          <select
            name="role"
            required
            style={{
              padding: "10px",
              borderRadius: 8,
              border: "1px solid var(--border)",
              background: "var(--page-bg)",
            }}
          >
            <option value="ADMIN">Admin</option>
            <option value="SUPER_ADMIN">Super Admin</option>
            <option value="SALES_MANAGER">Sales Manager</option>
            <option value="SALES">Sales</option>
            <option value="ACCOUNT_MANAGER">Account Manager</option>
            <option value="PRODUCTION">Production</option>
            <option value="HR">HR</option>
            <option value="FINANCE">Finance</option>
          </select>
        </div>

        <Input label="Joining Date" name="joiningDate" type="date" />
        <Input label="Date of Birth" name="dob" type="date" />
        <Input label="Salary (Rs.)" name="salary" />
        <Input label="Monthly Target (Rs.)" name="targetMonthly" />
      </form>

      <button
        type="submit"
        form="create"
        disabled={loading}
        style={{
          padding: "12px 24px",
          borderRadius: 8,
          background: "#2563eb",
          color: "#fff",
          border: "none",
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        {loading ? "Creating…" : "Create User"}
      </button>
    </div>
  );
}

/* COMMON INPUT COMPONENT */
function Input({ label, name, placeholder, type = "text", required = false }: any) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <label style={{ fontSize: 13, fontWeight: 500 }}>{label}</label>
      <input
        name={name}
        type={type}
        placeholder={placeholder}
        required={required}
        style={{
          padding: "10px",
          borderRadius: 8,
          border: "1px solid var(--border)",
          background: "var(--page-bg)",
        }}
      />
    </div>
  );
}
