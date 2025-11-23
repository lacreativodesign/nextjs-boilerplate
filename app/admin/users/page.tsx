"use client";

import { useState } from "react";

type TabKey = "all" | "create" | "view" | "activity";

export default function UsersPage() {
  const [activeTab, setActiveTab] = useState<TabKey>("all");

  const tabs: { key: TabKey; label: string }[] = [
    { key: "all", label: "All Users" },
    { key: "create", label: "Create User" },
    { key: "view", label: "View User Details" },
    { key: "activity", label: "Activity Log" },
  ];

  return (
    <div>
      {/* PAGE TITLE */}
      <h2 style={{ fontSize: 26, fontWeight: 700, marginBottom: 8 }}>
        User Management
      </h2>

      {/* TABS */}
      <div
        style={{
          display: "flex",
          gap: 24,
          borderBottom: "1px solid var(--border)",
          marginBottom: 20,
        }}
      >
        {tabs.map((tab) => {
          const isActive = tab.key === activeTab;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                background: "transparent",
                border: "none",
                padding: "10px 0",
                cursor: "pointer",
                fontSize: 15,
                fontWeight: isActive ? 700 : 500,
                borderBottom: isActive
                  ? "3px solid #2563eb"
                  : "3px solid transparent",
                color: isActive ? "#111827" : "var(--sidebar-text)",
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* CONTENT BOX */}
      <div
        style={{
          padding: 20,
          borderRadius: 12,
          background: "var(--card-bg)",
          border: "1px solid var(--border)",
        }}
      >
        {activeTab === "all" && <AllUsers />}
        {activeTab === "create" && <CreateUser />}
        {activeTab === "view" && <ViewUser />}
        {activeTab === "activity" && <ActivityLog />}
      </div>
    </div>
  );
}

/* =======================================================
                      ALL USERS
   ======================================================= */
function AllUsers() {
  return (
    <div>
      <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>
        All Users
      </h3>

      <div style={{ overflowX: "auto" }}>
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: 14,
          }}
        >
          <thead>
            <tr
              style={{
                textAlign: "left",
                borderBottom: "1px solid var(--border)",
              }}
            >
              <th style={{ padding: "8px 4px" }}>Name</th>
              <th style={{ padding: "8px 4px" }}>Email</th>
              <th style={{ padding: "8px 4px" }}>Role</th>
              <th style={{ padding: "8px 4px" }}>Status</th>
              <th style={{ padding: "8px 4px" }}>Joining Date</th>
              <th style={{ padding: "8px 4px" }}>Actions</th>
            </tr>
          </thead>

          <tbody>
            {/* Dummy Row */}
            <tr style={{ borderBottom: "1px solid var(--border)" }}>
              <td style={{ padding: "8px 4px" }}>John Doe</td>
              <td style={{ padding: "8px 4px" }}>john@example.com</td>
              <td style={{ padding: "8px 4px" }}>Sales</td>
              <td style={{ padding: "8px 4px" }}>Active</td>
              <td style={{ padding: "8px 4px" }}>2025-01-12</td>
              <td style={{ padding: "8px 4px" }}>
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

/* =======================================================
                      CREATE USER (GRID FORM)
   ======================================================= */
function CreateUser() {
  return (
    <div>
      <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>
        Create New User
      </h3>

      {/* GRID FORM */}
      <form
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
          gap: 20,
        }}
      >
        <Input label="Full Name" placeholder="e.g. Clara Smith" />
        <Input label="Email" type="email" placeholder="user@company.com" />
        <Input label="Password" type="password" placeholder="Temporary password" />
        <Input label="CNIC" placeholder="42101-xxxxxxx-x" />
        <Input label="Phone" placeholder="+92-3xx-xxxxxxx" />
        <Input label="Address" placeholder="Full address" />
        <Input label="Joining Date" type="date" />
        <Input label="Salary (PKR)" type="number" placeholder="50000" />
        <Input label="Monthly Target (USD)" type="number" placeholder="1000" />

        {/* ROLE DROPDOWN */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={{ fontSize: 13, fontWeight: 500 }}>Role</label>
          <select
            style={{
              padding: "10px",
              borderRadius: 8,
              border: "1px solid var(--border)",
              background: "var(--page-bg)",
            }}
          >
            <option value="">Select role</option>
            <option value="SUPER_ADMIN">Super Admin</option>
            <option value="ADMIN">Admin</option>
            <option value="SALES_MANAGER">Sales Manager</option>
            <option value="SALES">Sales</option>
            <option value="ACCOUNT_MANAGER">Account Manager</option>
            <option value="PRODUCTION">Production</option>
            <option value="HR">HR</option>
            <option value="FINANCE">Finance</option>
          </select>
        </div>
      </form>

      <button
        type="button"
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

/* =======================================================
                      PLACEHOLDERS
   ======================================================= */
function ViewUser() {
  return <p style={{ fontSize: 14 }}>User detail viewer coming soon.</p>;
}

function ActivityLog() {
  return <p style={{ fontSize: 14 }}>User activity logs will appear here.</p>;
}

/* =======================================================
                      INPUT COMPONENT
   ======================================================= */
function Input({ label, placeholder, type = "text" }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <label style={{ fontSize: 13, fontWeight: 500 }}>{label}</label>
      <input
        type={type}
        placeholder={placeholder}
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
