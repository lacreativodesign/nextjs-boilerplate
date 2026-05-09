"use client";

import React, { useState } from "react";
import { showToast } from "@/lib/utils/toast";

export default function AddEmployeePage() {
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);

    const form = new FormData(e.currentTarget);

    const payload = {
      name: form.get("name"),
      email: form.get("email"),
      role: form.get("role"),
      department: form.get("department"),
      status: form.get("status"),
    };

    try {
      const res = await fetch("/api/hr/employees/create", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json();

      if (json.success) {
        showToast.success("Employee created!");
        window.location.href = "/hr/employees";
      } else {
        showToast.error("Failed: " + (json.message || "Unknown error"));
      }
    } catch (err) {
      showToast.error("Error creating employee.");
    }

    setLoading(false);
  }

  return (
    <div className="space-y-6">
      <h2 style={{ fontSize: 26, fontWeight: 700, marginBottom: 10 }}>
        Add New Employee
      </h2>

      <p style={{ fontSize: 14, color: "#6b7280", marginBottom: 30 }}>
        Fill in the details below to create a new employee profile.
      </p>

      {/* Form Container */}
      <form
        onSubmit={handleSubmit}
        style={{
          maxWidth: 700,
          background: "#fff",
          padding: 30,
          borderRadius: 12,
          border: "1px solid #e5e7eb",
          boxShadow: "0 2px 4px rgba(0,0,0,0.05)",
        }}
      >
        {/* Grid */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 20,
            marginBottom: 25,
          }}
        >
          {/* Name */}
          <div>
            <label style={labelStyle}>Full Name</label>
            <input name="name" required style={inputStyle} />
          </div>

          {/* Email */}
          <div>
            <label style={labelStyle}>Email</label>
            <input type="email" name="email" required style={inputStyle} />
          </div>

          {/* Role */}
          <div>
            <label style={labelStyle}>Role</label>
            <input name="role" required style={inputStyle} />
          </div>

          {/* Department */}
          <div>
            <label style={labelStyle}>Department</label>
            <input name="department" required style={inputStyle} />
          </div>

          {/* Status */}
          <div>
            <label style={labelStyle}>Status</label>
            <select name="status" style={inputStyle}>
              <option>Active</option>
              <option>Inactive</option>
            </select>
          </div>
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          disabled={loading}
          style={{
            padding: "12px 22px",
            borderRadius: 8,
            background: loading ? "#9ca3af" : "#111827",
            color: "white",
            border: "none",
            fontWeight: 600,
            cursor: loading ? "not-allowed" : "pointer",
          }}
        >
          {loading ? "Saving..." : "Create Employee"}
        </button>
      </form>
    </div>
  );
}

const labelStyle = {
  fontSize: 12,
  fontWeight: 600,
  color: "#6b7280",
  textTransform: "uppercase" as const,
  marginBottom: 6,
  display: "block",
};

const inputStyle = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 8,
  border: "1px solid #d1d5db",
  fontSize: 15,
  outline: "none",
};
