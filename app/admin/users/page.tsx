"use client";

import { useState } from "react";

type TabKey = "all" | "create" | "view" | "activity";

export default function UsersPage() {
  const [activeTab, setActiveTab] = useState<TabKey>("all");

  const tabs = [
    { key: "all", label: "All Users" },
    { key: "create", label: "Create User" },
    { key: "view", label: "View User Details" },
    { key: "activity", label: "Activity Log" },
  ];

  return (
    <div>
      {/* HORIZONTAL TABS (Correct Blue Style Comes From Users Layout) */}
      <div style={{ marginBottom: 20 }} />

      {/* TAB CONTENT BOX */}
      <div
        style={{
          padding: 20,
          borderRadius: 12,
          background: "var(--card-bg)",
          border: "1px solid var(--border)",
        }}
      >
        {activeTab === "all" && <AllUsersSection />}
        {activeTab === "create" && <CreateUserSection />}
        {activeTab === "view" && <ViewUserSection />}
        {activeTab === "activity" && <ActivityLogSection />}
      </div>
    </div>
  );
}

/* =======================================================
                    TAB CONTENT COMPONENTS
   ======================================================= */

function AllUsersSection() {
  return (
    <div>
      <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>
        All Users
      </h3>
      <p style={{ fontSize: 14, color: "var(--sidebar-text)", marginBottom: 16 }}>
        This table will list all users with roles, status, and quick actions.
      </p>

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border)" }}>
              <th style={{ padding: 8 }}>Name</th>
              <th style={{ padding: 8 }}>Email</th>
              <th style={{ padding: 8 }}>Role</th>
              <th style={{ padding: 8 }}>Status</th>
              <th style={{ padding: 8 }}>Actions</th>
            </tr>
          </thead>

          <tbody>
            <tr style={{ borderBottom: "1px solid var(--border)" }}>
              <td style={{ padding: 8 }}>John Doe</td>
              <td style={{ padding: 8 }}>john@example.com</td>
              <td style={{ padding: 8 }}>Sales</td>
              <td style={{ padding: 8 }}>Active</td>
              <td style={{ padding: 8 }}>
                <button
                  style={{
                    padding: "4px 10px",
                    fontSize: 12,
                    borderRadius: 6,
                    border: "1px solid var(--border)",
                    background: "#f3f4f6",
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

function CreateUserSection() {
  return (
    <div>
      <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>
        Create New User
      </h3>

      <form
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: 16,
        }}
      >
        <Input label="Full Name" placeholder="e.g. Sarah Khan" />
        <Input label="Email" placeholder="name@company.com" type="email" />
        <Input label="Password" placeholder="Temporary password" type="password" />

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={{ fontSize: 13, fontWeight: 500 }}>Role</label>
          <select
            style={{
              padding: "8px 10px",
              borderRadius: 8,
              border: "1px solid var(--border)",
            }}
          >
            <option value="">Select role</option>
            <option value="ADMIN">Admin</option>
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
        }}
      >
        Save User
      </button>
    </div>
  );
}

function ViewUserSection() {
  return <p>View User Details Placeholder</p>;
}

function ActivityLogSection() {
  return <p>User Activity Logs Placeholder</p>;
}

function Input({ label, placeholder, type = "text" }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <label style={{ fontSize: 13, fontWeight: 500 }}>{label}</label>
      <input
        type={type}
        placeholder={placeholder}
        style={{
          padding: "8px 10px",
          borderRadius: 8,
          border: "1px solid var(--border)",
        }}
      />
    </div>
  );
          }
