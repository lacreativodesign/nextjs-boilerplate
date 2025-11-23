"use client";

import { useEffect, useMemo, useState } from "react";

type TabKey = "all" | "create" | "view" | "activity";

type UserRecord = {
  uid: string;
  name?: string;
  email: string;
  role: string;
  disabled?: boolean;
  status?: string;

  // extra data (max fields)
  phone?: string;
  cnic?: string;
  address?: string;
  city?: string;
  country?: string;
  dob?: string; // ISO date
  joiningDate?: string; // ISO date
  salary?: number;
  targetMonthly?: number;
  department?: string;

  createdAt?: string; // ISO
  lastLoginAt?: string;
};

type SortKey =
  | "name"
  | "email"
  | "role"
  | "status"
  | "joiningDate"
  | "dob"
  | "createdAt";

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
        {activeTab === "all" && <AllUsersSection />}
        {activeTab === "create" && <CreateUserSection />}
        {activeTab === "view" && <ViewUserSection />}
        {activeTab === "activity" && <ActivityLogSection />}
      </div>
    </div>
  );
}

/* ===================== ALL USERS (REAL DATA) ===================== */

function AllUsersSection() {
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedUid, setExpandedUid] = useState<string | null>(null);

  const [sortKey, setSortKey] = useState<SortKey>("createdAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/admin/users/list", {
          method: "GET",
          credentials: "include",
        });
        if (!res.ok) throw new Error("Failed to fetch users");
        const data = await res.json();
        setUsers(data.users || []);
      } catch (e) {
        console.error(e);
        setUsers([]);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const sortedUsers = useMemo(() => {
    const copy = [...users];

    const getVal = (u: UserRecord, k: SortKey) => {
      const v = (u as any)[k];
      if (v === undefined || v === null) return "";
      return v;
    };

    copy.sort((a, b) => {
      const av = getVal(a, sortKey);
      const bv = getVal(b, sortKey);

      // number compare
      if (typeof av === "number" && typeof bv === "number") {
        return sortDir === "asc" ? av - bv : bv - av;
      }

      // date/string compare
      const as = String(av).toLowerCase();
      const bs = String(bv).toLowerCase();
      if (as < bs) return sortDir === "asc" ? -1 : 1;
      if (as > bs) return sortDir === "asc" ? 1 : -1;
      return 0;
    });

    return copy;
  }, [users, sortKey, sortDir]);

  return (
    <div>
      <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>
        All Users
      </h3>
      <p style={{ fontSize: 14, color: "var(--sidebar-text)", marginBottom: 16 }}>
        Full employee list with sorting + expandable details row.
      </p>

      {loading ? (
        <p style={{ fontSize: 14 }}>Loading users...</p>
      ) : (
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
                <SortableTh label="Name" onClick={() => toggleSort("name")} activeKey={sortKey} thKey="name" dir={sortDir} />
                <SortableTh label="Email" onClick={() => toggleSort("email")} activeKey={sortKey} thKey="email" dir={sortDir} />
                <SortableTh label="Role" onClick={() => toggleSort("role")} activeKey={sortKey} thKey="role" dir={sortDir} />
                <SortableTh label="Status" onClick={() => toggleSort("status")} activeKey={sortKey} thKey="status" dir={sortDir} />
                <SortableTh label="Joining Date" onClick={() => toggleSort("joiningDate")} activeKey={sortKey} thKey="joiningDate" dir={sortDir} />
                <SortableTh label="DOB" onClick={() => toggleSort("dob")} activeKey={sortKey} thKey="dob" dir={sortDir} />
                <th style={{ padding: "8px 4px" }}>Actions</th>
              </tr>
            </thead>

            <tbody>
              {sortedUsers.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ padding: 12, fontSize: 14 }}>
                    No users found yet.
                  </td>
                </tr>
              )}

              {sortedUsers.map((u) => {
                const isOpen = expandedUid === u.uid;
                const statusText =
                  u.disabled === true ? "Disabled" : u.status || "Active";

                return (
                  <>
                    {/* MAIN ROW */}
                    <tr key={u.uid} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td style={{ padding: "8px 4px" }}>{u.name || "-"}</td>
                      <td style={{ padding: "8px 4px" }}>{u.email}</td>
                      <td style={{ padding: "8px 4px" }}>{u.role}</td>
                      <td style={{ padding: "8px 4px" }}>{statusText}</td>
                      <td style={{ padding: "8px 4px" }}>
                        {u.joiningDate ? formatDate(u.joiningDate) : "-"}
                      </td>
                      <td style={{ padding: "8px 4px" }}>
                        {u.dob ? formatDate(u.dob) : "-"}
                      </td>
                      <td style={{ padding: "8px 4px" }}>
                        <button
                          onClick={() =>
                            setExpandedUid(isOpen ? null : u.uid)
                          }
                          style={{
                            padding: "4px 10px",
                            fontSize: 12,
                            borderRadius: 6,
                            border: "1px solid var(--border)",
                            background: "#f3f4f6",
                            cursor: "pointer",
                          }}
                        >
                          {isOpen ? "Hide" : "View More"}
                        </button>
                      </td>
                    </tr>

                    {/* EXPANDED DRAWER ROW (UNDER TABLE) */}
                    {isOpen && (
                      <tr style={{ borderBottom: "1px solid var(--border)" }}>
                        <td colSpan={7} style={{ padding: 14, background: "var(--page-bg)" }}>
                          <ExpandedUserRow user={u} />
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ===================== EXPANDED INFO ===================== */

function ExpandedUserRow({ user }: { user: UserRecord }) {
  const info = [
    { label: "Phone", value: user.phone },
    { label: "CNIC", value: user.cnic },
    { label: "Address", value: user.address },
    { label: "City", value: user.city },
    { label: "Country", value: user.country },
    { label: "Department", value: user.department },
    { label: "Salary", value: user.salary != null ? `Rs. ${user.salary}` : undefined },
    { label: "Monthly Target", value: user.targetMonthly != null ? `Rs. ${user.targetMonthly}` : undefined },
    { label: "Joining Date", value: user.joiningDate ? formatDate(user.joiningDate) : undefined },
    { label: "DOB", value: user.dob ? formatDate(user.dob) : undefined },
    { label: "Created At", value: user.createdAt ? formatDate(user.createdAt) : undefined },
    { label: "Last Login", value: user.lastLoginAt ? formatDate(user.lastLoginAt) : undefined },
  ];

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
        gap: 12,
        fontSize: 14,
      }}
    >
      {info.map((i) => (
        <div
          key={i.label}
          style={{
            border: "1px solid var(--border)",
            borderRadius: 8,
            padding: 10,
            background: "var(--card-bg)",
          }}
        >
          <div style={{ fontSize: 12, color: "var(--sidebar-text)" }}>
            {i.label}
          </div>
          <div style={{ fontWeight: 600 }}>
            {i.value || "-"}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ===================== CREATE USER (PLACEHOLDER FOR NOW) ===================== */

function CreateUserSection() {
  return (
    <div>
      <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>
        Create New User
      </h3>
      <p style={{ fontSize: 14, color: "var(--sidebar-text)", marginBottom: 16 }}>
        Form will be wired to create-user API in next step.
      </p>

      {/* Keep placeholder here for now — next step we add full horizontal form */}
      <p style={{ fontSize: 14 }}>
        Waiting for next step.
      </p>
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
        Later: deep profile edit screen + history.
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
      <p style={{ fontSize: 14, color: "var(--sidebar-text)", marginBottom: 16 }}>
        Later: security + audit trail (role changes, logins, unlocks).
      </p>
    </div>
  );
}

/* ===================== HELPERS ===================== */

function formatDate(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString();
  } catch {
    return iso;
  }
}

function SortableTh({
  label,
  onClick,
  activeKey,
  thKey,
  dir,
}: {
  label: string;
  onClick: () => void;
  activeKey: SortKey;
  thKey: SortKey;
  dir: "asc" | "desc";
}) {
  const isActive = activeKey === thKey;
  return (
    <th
      onClick={onClick}
      style={{
        padding: "8px 4px",
        cursor: "pointer",
        userSelect: "none",
        color: isActive ? "#111827" : "var(--sidebar-text)",
        fontWeight: isActive ? 700 : 600,
      }}
    >
      {label} {isActive ? (dir === "asc" ? "▲" : "▼") : ""}
    </th>
  );
}
