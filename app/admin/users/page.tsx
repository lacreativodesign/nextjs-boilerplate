"use client";

import { useState } from "react";

export default function UsersPage() {
  const [activeTab, setActiveTab] = useState("all");

  return (
    <div>
      {/* ALL USERS LIST */}
      {activeTab === "all" && <AllUsersSection />}
      {activeTab === "create" && <CreateUserSection />}
      {activeTab === "view" && <ViewUserSection />}
      {activeTab === "activity" && <ActivityLogSection />}
    </div>
  );
}

/* ============================================================================
    ALL USERS SECTION (NO TABS HERE—CLEAN, SINGLE SECTION)
============================================================================ */

function AllUsersSection() {
  return (
    <div>
      <h2 style={{ fontSize: 26, fontWeight: 700, marginBottom: 10 }}>
        All Users
      </h2>

      <p style={{ fontSize: 14, color: "var(--sidebar-text)", marginBottom: 16 }}>
        List of all users with roles, status and actions.
      </p>

      <div style={{ overflowX: "auto" }}>
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: 14,
            background: "var(--card-bg)",
            borderRadius: 12,
            overflow: "hidden",
            border: "1px solid var(--border)",
          }}
        >
          <thead>
            <tr style={{ background: "var(--page-bg)", borderBottom: "1px solid var(--border)" }}>
              <th style={th}>Name</th>
              <th style={th}>Email</th>
              <th style={th}>Role</th>
              <th style={th}>Status</th>
              <th style={th}>Joining Date</th>
              <th style={th}>Actions</th>
            </tr>
          </thead>

          <tbody>
            <tr style={{ borderBottom: "1px solid var(--border)" }}>
              <td style={td}>John Doe</td>
              <td style={td}>john@example.com</td>
              <td style={td}>Sales</td>
              <td style={td}>Active</td>
              <td style={td}>12 Jan 2024</td>
              <td style={td}>
                <button
                  style={{
                    padding: "4px 10px",
                    fontSize: 12,
                    borderRadius: 6,
                    border: "1px solid var(--border)",
                    background: "#f3f4f6",
                    cursor: "pointer",
                  }}
                >
                  View
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

const th = { padding: "10px 8px", fontWeight: 600 };
const td = { padding: "10px 8px" };

/* ============================================================================
    CREATE USER (KEEPING YOUR CURRENT LAYOUT EXACTLY)
============================================================================ */

function CreateUserSection() {
  return (
    <div>
      <h2 style={{ fontSize: 26, fontWeight: 700, marginBottom: 10 }}>Create New User</h2>

      <form
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          gap: 16,
          background: "var(--card-bg)",
          padding: 20,
          borderRadius: 12,
          border: "1px solid var(--border)",
        }}
      >
        <Input label="Full Name" placeholder="e.g. Sarah Khan" />
        <Input label="Email" type="email" placeholder="name@company.com" />
        <Input label="Phone" placeholder="+923001234567" />
        <Input label="CNIC" placeholder="12345-1234567-1" />
        <Input label="City" placeholder="Karachi" />
        <Input label="Address" placeholder="Full address" />
        <Input label="Joining Date" type="date" />
        <Input label="Salary (Rs.)" type="number" />
        <Input label="Monthly Target (USD$)" type="number" />

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={{ fontSize: 13, fontWeight: 500 }}>Role</label>
          <select style={inputStyle}>
            <option value="">Select role</option>
            <option value="SUPER_ADMIN">Super Admin</option>
            <option value="ADMIN">Admin</option>
            <option value="SALES_MANAGER">Sales Manager</option>
            <option value="SALES">Sales</option>
            <option value="ACCOUNT_MANAGER">Account Manager</option>
            <option value="PRODUCTION">Production</option>
            <option value="HR">HR</option>
            <option value="FINANCE">Finance</option>
            <option value="CLIENT">Client</option>
          </select>
        </div>
      </form>

      <button
        style={{
          marginTop: 20,
          padding: "10px 18px",
          borderRadius: 8,
          background: "#2563eb",
          color: "#fff",
          border: "none",
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        Save User
      </button>
    </div>
  );
}

function Input({ label, placeholder, type = "text" }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <label style={{ fontSize: 13, fontWeight: 500 }}>{label}</label>
      <input type={type} placeholder={placeholder} style={inputStyle} />
    </div>
  );
}

const inputStyle = {
  padding: "8px 10px",
  borderRadius: 8,
  border: "1px solid var(--border)",
  background: "var(--page-bg)",
};

/* ============================================================================
  PLACEHOLDER SECTIONS
============================================================================ */

function ViewUserSection() {
  return <p style={{ padding: 20 }}>View User Page – Coming Soon</p>;
}

function ActivityLogSection() {
  return <p style={{ padding: 20 }}>Activity Log – Coming Soon</p>;
}
