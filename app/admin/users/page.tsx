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

      {/* CONTENT AREA */}
      <div
        style={{
          padding: 20,
          borderRadius: 12,
          background: "var(--card-bg)",
          border: "1px solid var(--border)",
        }}
      >
        {activeTab === "all" && <AllUsers />}
        {activeTab === "create" && <CreateUserForm />}
        {activeTab === "view" && <ViewUser />}
        {activeTab === "activity" && <ActivityLog />}
      </div>
    </div>
  );
}

/* ============================================
   TAB 1 — ALL USERS (TABLE)
================================================ */

function AllUsers() {
  return (
    <div>
      <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>
        All Users
      </h3>

      <p style={{ fontSize: 14, color: "var(--sidebar-text)", marginBottom: 16 }}>
        List of all system users.
      </p>

      <div style={{ overflowX: "auto" }}>
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: 14,
          }}
        >
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border)" }}>
              <th style={{ padding: 8 }}>Name</th>
              <th style={{ padding: 8 }}>Email</th>
              <th style={{ padding: 8 }}>Role</th>
              <th style={{ padding: 8 }}>Status</th>
              <th style={{ padding: 8 }}>Joining Date</th>
              <th style={{ padding: 8 }}>Actions</th>
            </tr>
          </thead>

          <tbody>
            <tr style={{ borderBottom: "1px solid var(--border)" }}>
              <td style={{ padding: 8 }}>John Doe</td>
              <td style={{ padding: 8 }}>john@example.com</td>
              <td style={{ padding: 8 }}>Sales</td>
              <td style={{ padding: 8 }}>Active</td>
              <td style={{ padding: 8 }}>2024-12-01</td>
              <td style={{ padding: 8 }}>
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

/* ============================================
   TAB 2 — CREATE USER (GRID FORM)
================================================ */

function CreateUserForm() {
  return (
    <div>
      <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>
        Create New User
      </h3>

      <p style={{ fontSize: 14, color: "var(--sidebar-text)", marginBottom: 20 }}>
        Fill in the user details below.
      </p>

      {/* GRID FORM */}
      <form
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: 20,
        }}
      >
        <FormField label="Full Name" type="text" placeholder="John Khan" />
        <FormField label="Email" type="email" placeholder="john@company.com" />
        <FormField label="Password" type="password" placeholder="Create password" />
        <FormField label="Phone Number" placeholder="+92 300 1234567" />
        <FormField label="CNIC" placeholder="42101-1234567-1" />
        <FormField label="Address" placeholder="Street, City, Country" />
        <FormField label="Joining Date" type="date" />
        <FormField label="Salary (Rs.)" type="number" placeholder="50000" />
        <FormField label="Monthly Target (USD$)" type="number" placeholder="10000" />

        {/* ROLE DROPDOWN */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={{ fontSize: 13, fontWeight: 500 }}>Role</label>

          <select
            style={{
              padding: "10px 12px",
              borderRadius: 8,
              border: "1px solid var(--border)",
              background: "var(--page-bg)",
            }}
          >
            <option>Select Role</option>
            <option>SUPER_ADMIN</option>
            <option>ADMIN</option>
            <option>SALES_MANAGER</option>
            <option>SALES</option>
            <option>ACCOUNT_MANAGER</option>
            <option>PRODUCTION</option>
            <option>HR</option>
            <option>FINANCE</option>
          </select>
        </div>
      </form>

      {/* SUBMIT */}
      <button
        style={{
          marginTop: 20,
          padding: "10px 18px",
          background: "#2563eb",
          color: "white",
          border: "none",
          borderRadius: 8,
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        Save User
      </button>
    </div>
  );
}

/* ============================================
   TAB 3 — VIEW USER
================================================ */

function ViewUser() {
  return (
    <div>
      <h3 style={{ fontSize: 18, fontWeight: 600 }}>View User Details</h3>
      <p style={{ color: "var(--sidebar-text)", fontSize: 14 }}>
        Coming soon — will load full user profile here.
      </p>
    </div>
  );
}

/* ============================================
   TAB 4 — ACTIVITY LOG
================================================ */

function ActivityLog() {
  return (
    <div>
      <h3 style={{ fontSize: 18, fontWeight: 600 }}>Activity Log</h3>
      <p style={{ color: "var(--sidebar-text)", fontSize: 14 }}>
        Coming soon — will track all user actions.
      </p>
    </div>
  );
}

/* ============================================
   SHARED INPUT FIELD
================================================ */

function FormField({ label, type = "text", placeholder = "" }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <label style={{ fontSize: 13, fontWeight: 500 }}>{label}</label>
      <input
        type={type}
        placeholder={placeholder}
        style={{
          padding: "10px 12px",
          borderRadius: 8,
          border: "1px solid var(--border)",
          background: "var(--page-bg)",
        }}
      />
    </div>
  );
}
