"use client";

import { useState } from "react";

/* TAB KEYS */
type TabKey = "all" | "create" | "view" | "activity";

export default function UsersPage() {
  const [activeTab, setActiveTab] = useState<TabKey>("all");

  return (
    <div>
      {/* PAGE HEADING (NO TABS HERE!) */}
      <h2 style={{ fontSize: 26, fontWeight: 700, marginBottom: 8 }}>
        User Management
      </h2>

      {/* TAB CONTENT ONLY (Tabs come from layout.tsx) */}
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
                      TAB SECTIONS
======================================================= */

function AllUsersSection() {
  return (
    <div>
      <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>
        All Users
      </h3>

      <p style={{ fontSize: 14, color: "var(--sidebar-text)", marginBottom: 16 }}>
        All user accounts with sorting, quick actions and details drawer.
      </p>

      {/* TABLE */}
      <div style={{ overflowX: "auto" }}>
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: 14,
          }}
        >
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid var(--border)" }}>
              <SortableLabel label="Name" />
              <SortableLabel label="Email" />
              <SortableLabel label="Role" />
              <SortableLabel label="Status" />
              <SortableLabel label="Joining Date" />
              <th style={{ padding: "8px 4px" }}>Actions</th>
            </tr>
          </thead>

          <tbody>
            <tr style={{ borderBottom: "1px solid var(--border)" }}>
              <td style={{ padding: "8px 4px" }}>John Doe</td>
              <td style={{ padding: "8px 4px" }}>john@example.com</td>
              <td style={{ padding: "8px 4px" }}>Sales</td>
              <td style={{ padding: "8px 4px" }}>Active</td>
              <td style={{ padding: "8px 4px" }}>2024-10-01</td>
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
                  View More
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* SORT LABEL */
function SortableLabel({ label }: { label: string }) {
  return (
    <th
      style={{
        padding: "8px 4px",
        cursor: "pointer",
        whiteSpace: "nowrap",
        fontWeight: 600,
      }}
    >
      {label} ▾
    </th>
  );
}

function CreateUserSection() {
  return (
    <div>
      <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>
        Create New User
      </h3>

      {/* GRID FORM */}
      <form
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: 16,
        }}
      >
        <Input label="Full Name" placeholder="e.g. Sarah Khan" />
        <Input label="Email" placeholder="name@company.com" type="email" />
        <Input label="Contact Number" placeholder="+92-300-XXXXXXX" />
        <Input label="Address" placeholder="Street, City, Country" />
        <Input label="Joining Date" type="date" />
        <Input label="Salary (Rs.)" placeholder="60000" type="number" />
        <Input label="Monthly Target (USD$)" placeholder="1000" type="number" />

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={{ fontSize: 13, fontWeight: 500 }}>Role</label>
          <select
            style={{
              padding: "8px 10px",
              borderRadius: 8,
              border: "1px solid var(--border)",
              background: "var(--page-bg)",
            }}
          >
            <option>Select role</option>
            <option>Super Admin</option>
            <option>Admin</option>
            <option>Sales Manager</option>
            <option>Sales</option>
            <option>Account Manager</option>
            <option>Production</option>
            <option>Finance</option>
            <option>HR</option>
            <option>Client</option>
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
          fontWeight: 600,
          border: "none",
          cursor: "pointer",
        }}
      >
        Save User
      </button>
    </div>
  );
}

function ViewUserSection() {
  return (
    <div>
      <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>
        View User Details
      </h3>
      <p style={{ color: "var(--sidebar-text)" }}>
        Will display full user profile, editable fields, status updates.
      </p>
    </div>
  );
}

function ActivityLogSection() {
  return (
    <div>
      <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>
        User Activity Log
      </h3>

      <ul style={{ fontSize: 14, lineHeight: 1.6 }}>
        <li>• Login / Logout history</li>
        <li>• Created clients / projects</li>
        <li>• Critical changes (status, roles)</li>
      </ul>
    </div>
  );
}

/* INPUT FIELD */
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
          background: "var(--page-bg)",
        }}
      />
    </div>
  );
}
