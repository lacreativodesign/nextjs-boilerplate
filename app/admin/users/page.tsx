"use client";

import { useMemo, useState } from "react";

type TabKey = "all" | "create" | "view" | "activity";

type UserRow = {
  id: string;
  name: string;
  email: string;
  role: string;
  status: "Active" | "Inactive";
  joiningDate: string; // ISO or readable
  phone?: string;
  cnic?: string;
  address?: string;
  dob?: string;
  department?: string;
  salaryRs?: number;
  monthlyTargetUsd?: number;
  notes?: string;
};

type SortKey = "name" | "email" | "role" | "status" | "joiningDate";
type SortDir = "asc" | "desc";

export default function UsersPage() {
  const [activeTab, setActiveTab] = useState<TabKey>("all");

  // ---- SORT STATE
  const [sortKey, setSortKey] = useState<SortKey>("joiningDate");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // ---- EXPAND ROW STATE
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // ---- DUMMY USERS (replace with Firebase later)
  const users: UserRow[] = [
    {
      id: "u1",
      name: "John Doe",
      email: "john@example.com",
      role: "SALES",
      status: "Active",
      joiningDate: "2025-10-01",
      phone: "+92 300 0000000",
      cnic: "42101-1234567-1",
      address: "Karachi, Pakistan",
      dob: "1992-05-12",
      department: "Sales",
      salaryRs: 180000,
      monthlyTargetUsd: 2500,
      notes: "Top performer.",
    },
    {
      id: "u2",
      name: "Sarah Khan",
      email: "sarah@lacreativo.com",
      role: "ACCOUNT_MANAGER",
      status: "Active",
      joiningDate: "2025-08-15",
      phone: "+92 333 1111111",
      cnic: "42201-7654321-0",
      address: "Lahore, Pakistan",
      dob: "1995-02-20",
      department: "Account Management",
      salaryRs: 220000,
      monthlyTargetUsd: 0,
      notes: "Handles key accounts.",
    },
  ];

  const tabs: { key: TabKey; label: string }[] = [
    { key: "all", label: "All Users" },
    { key: "create", label: "Create User" },
    { key: "view", label: "View User Details" },
    { key: "activity", label: "Activity Log" },
  ];

  const sortedUsers = useMemo(() => {
    const copy = [...users];
    copy.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];

      // string compare fallback
      const aStr = (av ?? "").toString().toLowerCase();
      const bStr = (bv ?? "").toString().toLowerCase();

      if (aStr < bStr) return sortDir === "asc" ? -1 : 1;
      if (aStr > bStr) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return copy;
  }, [users, sortKey, sortDir]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const SortArrow = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) {
      return <span style={{ opacity: 0.4, marginLeft: 6 }}>↕</span>;
    }
    return (
      <span style={{ marginLeft: 6 }}>
        {sortDir === "asc" ? "↑" : "↓"}
      </span>
    );
  };

  return (
    <div>
      {/* PAGE TITLE */}
      <h2 style={{ fontSize: 26, fontWeight: 700, marginBottom: 8 }}>
        User Management
      </h2>

      {/* HORIZONTAL TABS (LOCKED STYLE) */}
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
        {activeTab === "all" && (
          <AllUsersSection
            users={sortedUsers}
            expandedId={expandedId}
            onToggleExpand={(id) =>
              setExpandedId((prev) => (prev === id ? null : id))
            }
            onSort={handleSort}
            SortArrow={SortArrow}
          />
        )}

        {activeTab === "create" && <CreateUserSection />}
        {activeTab === "view" && <ViewUserSection />}
        {activeTab === "activity" && <ActivityLogSection />}
      </div>
    </div>
  );
}

/* =============== TAB SECTIONS =============== */

function AllUsersSection({
  users,
  expandedId,
  onToggleExpand,
  onSort,
  SortArrow,
}: {
  users: UserRow[];
  expandedId: string | null;
  onToggleExpand: (id: string) => void;
  onSort: (k: SortKey) => void;
  SortArrow: ({ col }: { col: SortKey }) => JSX.Element;
}) {
  return (
    <div>
      <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>
        All Users
      </h3>
      <p style={{ fontSize: 14, color: "var(--sidebar-text)", marginBottom: 16 }}>
        Master list of every ERP user. Click headers to sort. “View More” expands details below the row.
      </p>

      <div style={{ overflowX: "auto" }}>
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: 14,
            tableLayout: "fixed",
          }}
        >
          <thead>
            <tr
              style={{
                textAlign: "left",
                borderBottom: "1px solid var(--border)",
              }}
            >
              <th
                style={{ padding: "10px 6px", cursor: "pointer", width: "20%" }}
                onClick={() => onSort("name")}
              >
                Name <SortArrow col="name" />
              </th>
              <th
                style={{ padding: "10px 6px", cursor: "pointer", width: "25%" }}
                onClick={() => onSort("email")}
              >
                Email <SortArrow col="email" />
              </th>
              <th
                style={{ padding: "10px 6px", cursor: "pointer", width: "15%" }}
                onClick={() => onSort("role")}
              >
                Role <SortArrow col="role" />
              </th>
              <th
                style={{ padding: "10px 6px", cursor: "pointer", width: "10%" }}
                onClick={() => onSort("status")}
              >
                Status <SortArrow col="status" />
              </th>
              <th
                style={{ padding: "10px 6px", cursor: "pointer", width: "15%" }}
                onClick={() => onSort("joiningDate")}
              >
                Joining Date <SortArrow col="joiningDate" />
              </th>
              <th style={{ padding: "10px 6px", width: "15%" }}>Action</th>
            </tr>
          </thead>

          <tbody>
            {users.map((u) => {
              const expanded = expandedId === u.id;
              return (
                <>
                  <tr
                    key={u.id}
                    style={{ borderBottom: "1px solid var(--border)" }}
                  >
                    <td style={{ padding: "10px 6px", fontWeight: 600 }}>
                      {u.name}
                    </td>
                    <td style={{ padding: "10px 6px" }}>{u.email}</td>
                    <td style={{ padding: "10px 6px" }}>{u.role}</td>
                    <td style={{ padding: "10px 6px" }}>{u.status}</td>
                    <td style={{ padding: "10px 6px" }}>
                      {formatDate(u.joiningDate)}
                    </td>
                    <td style={{ padding: "10px 6px" }}>
                      <button
                        onClick={() => onToggleExpand(u.id)}
                        style={{
                          padding: "6px 12px",
                          fontSize: 12,
                          borderRadius: 6,
                          border: "1px solid var(--border)",
                          background: expanded ? "#e5e7eb" : "#f3f4f6",
                          cursor: "pointer",
                          fontWeight: 600,
                        }}
                      >
                        {expanded ? "Hide" : "View More"}
                      </button>
                    </td>
                  </tr>

                  {expanded && (
                    <tr style={{ borderBottom: "1px solid var(--border)" }}>
                      <td colSpan={6} style={{ padding: "12px 6px" }}>
                        <div
                          style={{
                            background: "var(--page-bg)",
                            border: "1px solid var(--border)",
                            borderRadius: 10,
                            padding: 14,
                            display: "grid",
                            gridTemplateColumns:
                              "repeat(auto-fit, minmax(220px, 1fr))",
                            gap: 12,
                          }}
                        >
                          <Detail label="Phone" value={u.phone} />
                          <Detail label="CNIC" value={u.cnic} />
                          <Detail label="Address" value={u.address} />
                          <Detail label="Date of Birth" value={formatDate(u.dob)} />
                          <Detail label="Department" value={u.department} />
                          <Detail
                            label="Salary (Rs.)"
                            value={u.salaryRs ? u.salaryRs.toLocaleString() : "-"}
                          />
                          <Detail
                            label="Monthly Target (USD$)"
                            value={
                              u.monthlyTargetUsd != null
                                ? u.monthlyTargetUsd.toLocaleString()
                                : "-"
                            }
                          />
                          <Detail label="Notes" value={u.notes} />
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CreateUserSection() {
  // Placeholder only; wire to API later.
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    cnic: "",
    address: "",
    dob: "",
    joiningDate: "",
    department: "",
    role: "",
    salaryRs: "",
    monthlyTargetUsd: "",
  });

  const onChange = (k: keyof typeof form, v: string) =>
    setForm((f) => ({ ...f, [k]: v }));

  return (
    <div>
      <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>
        Create New User
      </h3>
      <p style={{ fontSize: 14, color: "var(--sidebar-text)", marginBottom: 16 }}>
        Grid (horizontal) form. We’ll connect this to Firebase + email later.
      </p>

      <form
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: 14,
        }}
        onSubmit={(e) => {
          e.preventDefault();
          alert("Placeholder: user will be created via API later.");
        }}
      >
        <Input label="Full Name" value={form.name} onChange={(v) => onChange("name", v)} />
        <Input label="Email" type="email" value={form.email} onChange={(v) => onChange("email", v)} />
        <Input label="Phone" value={form.phone} onChange={(v) => onChange("phone", v)} />
        <Input label="CNIC" value={form.cnic} onChange={(v) => onChange("cnic", v)} />
        <Input label="Address" value={form.address} onChange={(v) => onChange("address", v)} />
        <Input label="Date of Birth" type="date" value={form.dob} onChange={(v) => onChange("dob", v)} />
        <Input label="Joining Date" type="date" value={form.joiningDate} onChange={(v) => onChange("joiningDate", v)} />
        <Input label="Department" value={form.department} onChange={(v) => onChange("department", v)} />

        <Select
          label="Role"
          value={form.role}
          onChange={(v) => onChange("role", v)}
          options={[
            "SUPER_ADMIN",
            "ADMIN",
            "SALES_MANAGER",
            "SALES",
            "ACCOUNT_MANAGER",
            "PRODUCTION",
            "HR",
            "FINANCE",
            "CLIENT",
          ]}
        />

        <Input
          label="Salary (Rs.)"
          type="number"
          value={form.salaryRs}
          onChange={(v) => onChange("salaryRs", v)}
        />
        <Input
          label="Monthly Target (USD$)"
          type="number"
          value={form.monthlyTargetUsd}
          onChange={(v) => onChange("monthlyTargetUsd", v)}
        />

        <div style={{ gridColumn: "1 / -1", marginTop: 6 }}>
          <button
            type="submit"
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
      </form>
    </div>
  );
}

function ViewUserSection() {
  return (
    <div>
      <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>
        View User Details
      </h3>
      <p style={{ fontSize: 14, color: "var(--sidebar-text)" }}>
        Placeholder. Later this will open a dedicated profile edit screen.
      </p>
    </div>
  );
}

function ActivityLogSection() {
  return (
    <div>
      <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>
        User Activity Log
      </h3>
      <p style={{ fontSize: 14, color: "var(--sidebar-text)", marginBottom: 10 }}>
        Placeholder. Later we’ll show admin actions + logins for audits.
      </p>
      <ul style={{ fontSize: 14, lineHeight: 1.7 }}>
        <li>• Track user creation / role changes</li>
        <li>• Track logins + suspicious attempts</li>
        <li>• Track critical finance / project edits done by users</li>
      </ul>
    </div>
  );
}

/* =============== SMALL COMPONENTS =============== */

function Input({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <label style={{ fontSize: 13, fontWeight: 600 }}>{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={label}
        style={{
          padding: "9px 10px",
          borderRadius: 8,
          border: "1px solid var(--border)",
          background: "var(--page-bg)",
          outline: "none",
        }}
      />
    </div>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <label style={{ fontSize: 13, fontWeight: 600 }}>{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          padding: "9px 10px",
          borderRadius: 8,
          border: "1px solid var(--border)",
          background: "var(--page-bg)",
          outline: "none",
        }}
      >
        <option value="">Select role</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </div>
  );
}

function Detail({ label, value }: { label: string; value?: string }) {
  return (
    <div>
      <div style={{ fontSize: 12, color: "var(--sidebar-text)", marginBottom: 2 }}>
        {label}
      </div>
      <div style={{ fontSize: 14, fontWeight: 600 }}>{value || "-"}</div>
    </div>
  );
}

function formatDate(d?: string) {
  if (!d) return "-";
  try {
    const dt = new Date(d);
    if (Number.isNaN(dt.getTime())) return d;
    return dt.toLocaleDateString();
  } catch {
    return d;
  }
}
