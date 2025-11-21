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

      {/* HORIZONTAL TABS */}
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

      {/* TAB CONTENT AREA */}
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

/* =============== TAB SECTIONS =============== */

function AllUsersSection() {
  return (
    <div>
      <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>
        All Users
      </h3>
      <p style={{ fontSize: 14, color: "var(--sidebar-text)", marginBottom: 16 }}>
        This table will show every user in the system with role, status and
        quick actions.
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
              <th style={{ padding: "8px 4px" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {/* Dummy row for now – later we’ll connect Firebase data here */}
            <tr style={{ borderBottom: "1px solid var(--border)" }}>
              <td style={{ padding: "8px 4px" }}>John Doe</td>
              <td style={{ padding: "8px 4px" }}>john@example.com</td>
              <td style={{ padding: "8px 4px" }}>Sales</td>
              <td style={{ padding: "8px 4px" }}>Active</td>
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

function CreateUserSection() {
  return (
    <div>
      <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>
        Create New User
      </h3>
      <p style={{ fontSize: 14, color: "var(--sidebar-text)", marginBottom: 16 }}>
        Fill in the details below to create a new ERP user account.
      </p>

      <form
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: 16,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={{ fontSize: 13, fontWeight: 500 }}>Full Name</label>
          <input
            type="text"
            placeholder="e.g. Sarah Khan"
            style={{
              padding: "8px 10px",
              borderRadius: 8,
              border: "1px solid var(--border)",
              background: "var(--page-bg)",
            }}
          />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={{ fontSize: 13, fontWeight: 500 }}>Email</label>
          <input
            type="email"
            placeholder="name@company.com"
            style={{
              padding: "8px 10px",
              borderRadius: 8,
              border: "1px solid var(--border)",
              background: "var(--page-bg)",
            }}
          />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={{ fontSize: 13, fontWeight: 500 }}>Password</label>
          <input
            type="password"
            placeholder="Temporary password"
            style={{
              padding: "8px 10px",
              borderRadius: 8,
              border: "1px solid var(--border)",
              background: "var(--page-bg)",
            }}
          />
        </div>

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

      <div style={{ marginTop: 20 }}>
        <button
          type="button"
          style={{
            padding: "10px 18px",
            borderRadius: 8,
            border: "none",
            background: "#2563eb",
            color: "#ffffff",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Save User (wire to API later)
        </button>
      </div>
    </div>
  );
}

function ViewUserSection() {
  return (
    <div>
      <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>
        View User Details
      </h3>
      <p style={{ fontSize: 14, color: "var(--sidebar-text)", marginBottom: 16 }}>
        This section will be used to view and edit a specific user’s profile,
        roles and status.
      </p>

      <p style={{ fontSize: 14 }}>We’ll hook this up after All Users + Create are live.</p>
    </div>
  );
}

function ActivityLogSection() {
  return (
    <div>
      <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>
        User Activity Log
      </h3>
      <p style={{ fontSize: 14, color: "var(--sidebar-text)", marginBottom: 16 }}>
        This will show who created/edited users, logins, role changes, and
        security-sensitive actions.
      </p>

      <ul style={{ fontSize: 14, lineHeight: 1.6 }}>
        <li>• Track who created new users</li>
        <li>• Track who changed roles or disabled accounts</li>
        <li>• Track suspicious access for security audits</li>
      </ul>
    </div>
  );
        }
