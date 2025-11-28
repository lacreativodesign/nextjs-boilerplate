"use client";

import { useEffect, useState } from "react";

type UserRecord = {
  uid: string;
  name?: string;
  email?: string;
  role?: string;
  department?: string;
  salary?: number;
  joiningDate?: string;
  phone?: string;
  designation?: string;
  monthlyTarget?: number;
  commission?: number;
  status?: string;
  [key: string]: any;
};

type SortKey = "name" | "email" | "role" | "department" | "salary" | "joiningDate";
type SortDir = "asc" | "desc";

export default function UsersPage() {
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>("");

  const [search, setSearch] = useState<string>("");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [expandedUid, setExpandedUid] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadUsers() {
      try {
        setLoading(true);
        setError("");

        const res = await fetch("/api/admin/users/list", {
          method: "GET",
        });

        if (!res.ok) {
          throw new Error("Failed to load users");
        }

        const data = await res.json();
        if (isMounted && Array.isArray(data)) {
          setUsers(data);
        }
      } catch (err: any) {
        if (isMounted) {
          setError(err?.message || "Something went wrong while loading users.");
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    loadUsers();

    return () => {
      isMounted = false;
    };
  }, []);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const getSortValue = (user: UserRecord, key: SortKey) => {
    if (key === "salary") {
      const val = user.salary;
      return typeof val === "number" ? val : 0;
    }

    if (key === "joiningDate") {
      const d = user.joiningDate ? new Date(user.joiningDate) : null;
      return d && !isNaN(d.getTime()) ? d.getTime() : 0;
    }

    const field =
      key === "name"
        ? user.name
        : key === "email"
        ? user.email
        : key === "role"
        ? user.role
        : key === "department"
        ? user.department
        : "";
    return (field || "").toString().toLowerCase();
  };

  const normalizedUsers = users.map((u) => ({
    ...u,
    role: u.role ? String(u.role).toLowerCase() : "",
    status: u.status ? String(u.status).toLowerCase() : "",
  }));

  const filteredUsers = normalizedUsers.filter((u) => {
    if (!search.trim()) return true;
    const term = search.trim().toLowerCase();

    const fields = [
      u.name || "",
      u.email || "",
      u.phone || "",
      u.role || "",
      u.department || "",
    ];

    return fields.some((val) =>
      val.toString().toLowerCase().includes(term)
    );
  });

  const sortedUsers = [...filteredUsers].sort((a, b) => {
    const aVal = getSortValue(a, sortKey);
    const bVal = getSortValue(b, sortKey);

    if (aVal < bVal) return sortDir === "asc" ? -1 : 1;
    if (aVal > bVal) return sortDir === "asc" ? 1 : -1;
    return 0;
  });

  const toggleExpand = (uid: string) => {
    setExpandedUid((prev) => (prev === uid ? null : uid));
  };

  const formatDate = (value?: string) => {
    if (!value) return "-";
    const d = new Date(value);
    if (isNaN(d.getTime())) return value;
    return d.toLocaleDateString();
  };

  const formatCurrency = (value?: number) => {
    if (typeof value !== "number") return "-";
    try {
      return value.toLocaleString("en-PK", {
        maximumFractionDigits: 0,
      });
    } catch {
      return String(value);
    }
  };

  const renderSortLabel = (label: string, key: SortKey) => {
    const isActive = sortKey === key;
    const arrow = !isActive ? "" : sortDir === "asc" ? " ▲" : " ▼";
    return label + arrow;
  };

  return (
    <div>
      {/* PAGE TITLE */}
      <h2 style={{ fontSize: 26, fontWeight: 700, marginBottom: 10 }}>
        All Users
      </h2>

      <p
        style={{
          fontSize: 14,
          color: "var(--sidebar-text)",
          marginBottom: 16,
        }}
      >
        View every user in the ERP, filter by name, email or department, and inspect
        full details via the View panel.
      </p>

      {/* TOP BAR: SEARCH */}
      <div
        style={{
          marginBottom: 14,
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div style={{ flex: 1, minWidth: 220 }}>
          <input
            placeholder="Search by name, email, phone, role or department..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: "100%",
              padding: "9px 12px",
              borderRadius: 8,
              border: "1px solid var(--border)",
              background: "var(--input-bg)",
              color: "var(--text)",
              fontSize: 14,
            }}
          />
        </div>
      </div>

      {/* MAIN CARD */}
      <div
        style={{
          background: "var(--card-bg)",
          borderRadius: 10,
          border: "1px solid var(--border)",
          padding: 16,
        }}
      >
        {loading ? (
          <p
            style={{
              fontSize: 14,
              color: "var(--sidebar-text)",
            }}
          >
            Loading users...
          </p>
        ) : error ? (
          <p
            style={{
              fontSize: 14,
              color: "var(--danger)",
            }}
          >
            {error}
          </p>
        ) : sortedUsers.length === 0 ? (
          <p
            style={{
              fontSize: 14,
              color: "var(--sidebar-text)",
            }}
          >
            No users found.
          </p>
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
                    borderBottom: "1px solid var(--border)",
                    background: "var(--table-header-bg)",
                  }}
                >
                  <th
                    style={headerCellStyle}
                    onClick={() => handleSort("name")}
                  >
                    {renderSortLabel("Name", "name")}
                  </th>
                  <th
                    style={headerCellStyle}
                    onClick={() => handleSort("email")}
                  >
                    {renderSortLabel("Email", "email")}
                  </th>
                  <th
                    style={headerCellStyle}
                    onClick={() => handleSort("role")}
                  >
                    {renderSortLabel("Role", "role")}
                  </th>
                  <th
                    style={headerCellStyle}
                    onClick={() => handleSort("department")}
                  >
                    {renderSortLabel("Department", "department")}
                  </th>
                  <th
                    style={headerCellStyle}
                    onClick={() => handleSort("salary")}
                  >
                    {renderSortLabel("Salary", "salary")}
                  </th>
                  <th
                    style={headerCellStyle}
                    onClick={() => handleSort("joiningDate")}
                  >
                    {renderSortLabel("Joining Date", "joiningDate")}
                  </th>
                  <th
                    style={{
                      ...headerCellStyle,
                      textAlign: "right",
                    }}
                  >
                    Action
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedUsers.map((u) => {
                  const isExpanded = expandedUid === u.uid;
                  return (
                    <>
                      <tr
                        key={u.uid}
                        style={{
                          borderBottom: "1px solid var(--border)",
                        }}
                      >
                        <td style={bodyCellStyle}>{u.name || "-"}</td>
                        <td style={bodyCellStyle}>{u.email || "-"}</td>
                        <td style={bodyCellStyle}>
                          {u.role ? u.role.toString() : "-"}
                        </td>
                        <td style={bodyCellStyle}>{u.department || "-"}</td>
                        <td style={bodyCellStyle}>{formatCurrency(u.salary)}</td>
                        <td style={bodyCellStyle}>
                          {formatDate(u.joiningDate)}
                        </td>
                        <td
                          style={{
                            ...bodyCellStyle,
                            textAlign: "right",
                          }}
                        >
                          <button
                            type="button"
                            onClick={() => toggleExpand(u.uid)}
                            style={{
                              padding: "6px 14px",
                              borderRadius: 999,
                              border: "1px solid var(--border)",
                              background: isExpanded
                                ? "var(--primary)"
                                : "var(--input-bg)",
                              color: isExpanded ? "#fff" : "var(--text)",
                              fontSize: 13,
                              fontWeight: 500,
                              cursor: "pointer",
                            }}
                          >
                            {isExpanded ? "Hide" : "View"}
                          </button>
                        </td>
                      </tr>

                      {isExpanded && (
                        <tr key={`${u.uid}-details`}>
                          <td colSpan={7} style={{ padding: 0 }}>
                            <div
                              style={{
                                padding: 16,
                                background: "var(--card-bg-alt)",
                                borderTop: "1px solid var(--border)",
                              }}
                            >
                              <UserDetailsPanel user={u} />
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
        )}
      </div>
    </div>
  );
}

const headerCellStyle: React.CSSProperties = {
  padding: 10,
  textAlign: "left",
  fontWeight: 600,
  fontSize: 13,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const bodyCellStyle: React.CSSProperties = {
  padding: 10,
  fontSize: 13,
  verticalAlign: "middle",
};

function UserDetailsPanel({ user }: { user: UserRecord }) {
  return (
    <div
      style={{
        borderRadius: 10,
        border: "1px solid var(--border)",
        background: "var(--card-bg)",
        padding: 16,
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
        gap: 16,
      }}
    >
      <DetailItem label="Full Name" value={user.name || "-"} />
      <DetailItem label="Email" value={user.email || "-"} />
      <DetailItem label="Phone" value={user.phone || "-"} />
      <DetailItem
        label="Role"
        value={user.role ? user.role.toString() : "-"}
      />
      <DetailItem label="Department" value={user.department || "-"} />
      <DetailItem label="Designation" value={user.designation || "-"} />
      <DetailItem
  label="Monthly Salary (PKR)"
  value={
    user.salary
      ? `Rs. ${Number(user.salary).toLocaleString("en-PK")}`
      : "-"
  }
/>

<DetailItem
  label="Monthly Target (USD)"
  value={
    user.monthlyTarget
      ? `$${Number(user.monthlyTarget).toLocaleString("en-US")}`
      : "-"
  }
/>

<DetailItem
  label="Commission (%)"
  value={
    user.commission
      ? `${Number(user.commission)}%`
      : "-"
  }
/>
<DetailItem
  label="Joining Date"
  value={
    user.joiningDate
      ? new Date(user.joiningDate).toLocaleDateString()
      : "-"
  }
/>
    </div>
  );
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span
        style={{
          fontSize: 12,
          fontWeight: 500,
          color: "var(--sidebar-text)",
          textTransform: "uppercase",
          letterSpacing: 0.4,
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: 14,
          fontWeight: 500,
          color: "var(--text)",
        }}
      >
        {value}
      </span>
    </div>
  );
    }
