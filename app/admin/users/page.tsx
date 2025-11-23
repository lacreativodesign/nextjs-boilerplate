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

      {/* CONTENT WRAPPER */}
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
                      ALL USERS TABLE
   ======================================================= */

function AllUsersSection() {
  return (
    <div>
      <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>
        All Users
      </h3>

      <p style={{ fontSize: 14, color: "var(--sidebar-text)", marginBottom: 16 }}>
        Below is the complete list of users in the ERP.
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
              <th style={{ padding: "8px 4px" }}>Joining Date</th>
              <th style={{ padding: "8px 4px" }}>Actions</th>
            </tr>
          </thead>

          <tbody>
            <tr style={{ borderBottom: "1px solid var(--border)" }}>
              <td style={{ padding: "8px 4px" }}>John Doe</td>
              <td style={{ padding: "8px 4px" }}>john@example.com</td>
              <td style={{ padding: "8px 4px" }}>Sales</td>
              <td style={{ padding: "8px 4px" }}>Active</td>
              <td style={{ padding: "8px 4px" }}>2024-01-10</td>
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

/* =======================================================
                   CREATE USER - GRID FORM
   ======================================================= */

function CreateUserSection() {
  return (
    <div>
      <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>
        Create New User
      </h3>

      <p
        style={{
          fontSize: 14,
          color: "var(--sidebar-text)",
          marginBottom: 20,
        }}
      >
        Fill in the details below to create a new ERP user account.
      </p>

      {/* GRID FORM */}
      <form
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
          gap: "22px",
        }}
      >
        {/* NAME */}
        <Input label="Full Name" placeholder="e.g. Sarah Khan" />

        {/* EMAIL */}
        <Input label="Email" placeholder="name@company.com" type="email" />

        {/* PASSWORD */}
        <Input label="Password" placeholder="Temporary password" type="password" />

        {/* ROLE */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={{ fontSize: 13, fontWeight: 600 }}>Role</label>
          <select
            style={{
              padding: "10px 12px",
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

        {/* PHONE */}
        <Input label="Phone" placeholder="+92 XXX XXXXXXX" />

        {/* CNIC */}
        <Input label="CNIC" placeholder="42101-XXXXXXX-X" />

        {/* ADDRESS (full width) */}
        <div
          style={{
            gridColumn: "1 / -1",
            display: "flex",
            flexDirection: "column",
            gap: 6,
          }}
        >
          <label style={{ fontSize: 13, fontWeight: 600 }}>Address</label>
          <input
            type="text"
            placeholder="House / Street / City"
            style={{
              padding: "10px 12px",
              borderRadius: 8,
              border: "1px solid var(--border)",
              background: "var(--page-bg)",
            }}
          />
        </div>

        {/* JOINING DATE */}
        <Input label="Joining Date" type="date" />

        {/* DOB */}
        <Input label="Date of Birth" type="date" />

        {/* SALARY */}
        <Input label="Salary (PKR)" placeholder="50000" type="number" />

        {/* MONTHLY TARGET */}
        <Input label="Monthly Target (USD)" placeholder="2000" type="number" />
      </form>

      {/* SUBMIT */}
      <div style={{ marginTop: 28 }}>
        <button
          type="button"
          style={{
            padding: "12px 20px",
            borderRadius: 8,
            border: "none",
            background: "#2563eb",
            color: "#ffffff",
            fontWeight: 600,
            cursor: "pointer",
            fontSize: 15,
          }}
        >
          Save User (Wire to API later)
        </button>
      </div>
    </div>
  );
}

/* =======================================================
                VIEW USER DETAILS (PLACEHOLDER)
   ======================================================= */

function ViewUserSection() {
  return (
    <div>
      <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>
        View User Details
      </h3>
      <p style={{ fontSize: 14, color: "var(--sidebar-text)" }}>
        Select a user from the table to load details here.
      </p>
    </div>
  );
}

/* =======================================================
                   ACTIVITY LOG (PLACEHOLDER)
   ======================================================= */

function ActivityLogSection() {
  return (
    <div>
      <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>
        User Activity Log
      </h3>

      <ul style={{ fontSize: 14, lineHeight: 1.6 }}>
        <li>• User creation and updates</li>
        <li>• Role changes</li>
        <li>• Login / logout history</li>
        <li>• Suspicious or blocked access attempts</li>
      </ul>
    </div>
  );
}

/* =======================================================
                   INPUT COMPONENT
   ======================================================= */

function Input({
  label,
  placeholder,
  type = "text",
}: {
  label: string;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <label style={{ fontSize: 13, fontWeight: 600 }}>{label}</label>
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
