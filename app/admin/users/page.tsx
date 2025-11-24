"use client";

import { useState } from "react";
import { ChevronUp, ChevronDown } from "lucide-react";

type User = {
  name: string;
  email: string;
  role: string;
  status: string;
  joiningDate: string;
};

export default function UsersPage() {
  const [activeTab, setActiveTab] = useState<"all" | "create" | "view" | "activity">("all");
  const [sortField, setSortField] = useState<keyof User | null>(null);
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");

  const tabs = [
    { key: "all", label: "All Users" },
    { key: "create", label: "Create User" },
    { key: "view", label: "View User Details" },
    { key: "activity", label: "Activity Log" },
  ];

  // Dummy data — replace with Firestore later
  let users: User[] = [
    {
      name: "John Doe",
      email: "john@example.com",
      role: "Sales",
      status: "Active",
      joiningDate: "2024-03-10",
    },
    {
      name: "Sarah Khan",
      email: "sarah@example.com",
      role: "Admin",
      status: "Active",
      joiningDate: "2023-12-02",
    },
  ];

  // Sorting logic
  if (sortField) {
    users.sort((a: any, b: any) => {
      const valA = a[sortField];
      const valB = b[sortField];

      if (valA < valB) return sortOrder === "asc" ? -1 : 1;
      if (valA > valB) return sortOrder === "asc" ? 1 : -1;
      return 0;
    });
  }

  const toggleSort = (field: keyof User) => {
    if (sortField === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortOrder("asc");
    }
  };

  return (
    <div>
      {/* PAGE TITLE (NO DUPLICATION ANYMORE) */}
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
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              background: "transparent",
              border: "none",
              padding: "10px 0",
              cursor: "pointer",
              fontSize: 15,
              fontWeight: activeTab === tab.key ? 700 : 500,
              borderBottom:
                activeTab === tab.key
                  ? "3px solid #2563eb"
                  : "3px solid transparent",
              color: activeTab === tab.key ? "#111827" : "var(--sidebar-text)",
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* CONTENT CARD */}
      <div
        style={{
          padding: 20,
          borderRadius: 12,
          background: "var(--card-bg)",
          border: "1px solid var(--border)",
        }}
      >
        {activeTab === "all" && (
          <AllUsersSection
            users={users}
            toggleSort={toggleSort}
            sortField={sortField}
            sortOrder={sortOrder}
          />
        )}

        {activeTab === "create" && <CreateUserSection />}

        {activeTab === "view" && <ViewUserSection />}

        {activeTab === "activity" && <ActivityLogSection />}
      </div>
    </div>
  );
}

/* =====================================================
                    ALL USERS TABLE
===================================================== */

function AllUsersSection({
  users,
  toggleSort,
  sortField,
  sortOrder,
}: {
  users: any[];
  toggleSort: any;
  sortField: keyof User | null;
  sortOrder: "asc" | "desc";
}) {
  const renderSortIcon = (field: keyof User) => {
    if (sortField !== field) return <ChevronUp size={16} opacity={0.2} />;
    return sortOrder === "asc" ? (
      <ChevronUp size={16} />
    ) : (
      <ChevronDown size={16} />
    );
  };

  return (
    <div>
      <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>
        All Users
      </h3>

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid var(--border)" }}>
              {[
                { key: "name", label: "Name" },
                { key: "email", label: "Email" },
                { key: "role", label: "Role" },
                { key: "status", label: "Status" },
                { key: "joiningDate", label: "Joining Date" },
              ].map((col) => (
                <th
                  key={col.key}
                  style={{
                    padding: "8px 4px",
                    cursor: "pointer",
                    userSelect: "none",
                    whiteSpace: "nowrap",
                  }}
                  onClick={() => toggleSort(col.key as keyof User)}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {col.label}
                    {renderSortIcon(col.key as keyof User)}
                  </div>
                </th>
              ))}

              <th style={{ padding: "8px 4px" }}>Actions</th>
            </tr>
          </thead>

          <tbody>
            {users.map((u, i) => (
              <tr key={i} style={{ borderBottom: "1px solid var(--border)" }}>
                <td style={{ padding: "8px 4px" }}>{u.name}</td>
                <td style={{ padding: "8px 4px" }}>{u.email}</td>
                <td style={{ padding: "8px 4px" }}>{u.role}</td>
                <td style={{ padding: "8px 4px" }}>{u.status}</td>
                <td style={{ padding: "8px 4px" }}>{u.joiningDate}</td>

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
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* =====================================================
                OTHER TABS (UNCHANGED)
===================================================== */

function CreateUserSection() {
  return (
    <div>
      <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>
        Create New User
      </h3>
      <p style={{ fontSize: 14, marginBottom: 16, color: "var(--sidebar-text)" }}>
        Fill in the details below to create a new ERP user account.
      </p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 16,
        }}
      >
        <Input label="Full Name" placeholder="e.g. Sarah Khan" />
        <Input label="Email" placeholder="email@company.com" />
        <Input label="Password" placeholder="Temporary password" type="password" />
        <Input label="Role" placeholder="Admin / Sales / AM" />
        <Input label="Phone" placeholder="+123456789" />
        <Input label="Salary (Rs.)" placeholder="50000" />
        <Input label="Monthly Target (USD$)" placeholder="2000" />
        <Input label="Address" placeholder="Street, City, Country" />
      </div>

      <button
        style={{
          marginTop: 20,
          padding: "10px 18px",
          background: "#2563eb",
          color: "#fff",
          borderRadius: 8,
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

function ViewUserSection() {
  return <p style={{ fontSize: 14 }}>User detail view coming soon.</p>;
}

function ActivityLogSection() {
  return <p style={{ fontSize: 14 }}>User activity logs will appear here.</p>;
}

/* REUSABLE INPUT */
function Input({
  label,
  placeholder,
  type = "text",
}: {
  label: string;
  placeholder: string;
  type?: string;
}) {
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
