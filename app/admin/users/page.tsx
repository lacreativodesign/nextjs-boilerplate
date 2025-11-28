"use client";

import { useEffect, useState } from "react";

type UserRecord = {
  uid: string;
  name?: string;
  email?: string;
  role?: string;
  department?: string;
  salary?: number | string;
  joiningDate?: string;
  phone?: string;
  designation?: string;
  monthlyTarget?: number | string;
  commission?: number | string;
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

        const res = await fetch("/api/admin/users/list");
        if (!res.ok) throw new Error("Failed to load users");

        const data = await res.json();
        if (isMounted && Array.isArray(data)) setUsers(data);
      } catch (err: any) {
        if (isMounted) setError(err.message || "Unexpected error occurred.");
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadUsers();
    return () => { isMounted = false; };
  }, []);

  /** SORTING LOGIC */
  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const getSortValue = (u: UserRecord, key: SortKey) => {
    if (key === "salary") return Number(u.salary) || 0;
    if (key === "joiningDate") {
      const d = u.joiningDate ? new Date(u.joiningDate) : null;
      return d && !isNaN(d.getTime()) ? d.getTime() : 0;
    }
    const f =
      key === "name"
        ? u.name
        : key === "email"
        ? u.email
        : key === "role"
        ? u.role
        : key === "department"
        ? u.department
        : "";
    return (f || "").toString().toLowerCase();
  };

  /** FILTER */
  const filtered = users.filter((u) => {
    if (!search.trim()) return true;
    const term = search.trim().toLowerCase();
    return [
      u.name,
      u.email,
      u.phone,
      u.role,
      u.department,
    ]
      .filter(Boolean)
      .some((v) => v!.toString().toLowerCase().includes(term));
  });

  /** SORT */
  const sorted = [...filtered].sort((a, b) => {
    const aVal = getSortValue(a, sortKey);
    const bVal = getSortValue(b, sortKey);
    if (aVal < bVal) return sortDir === "asc" ? -1 : 1;
    if (aVal > bVal) return sortDir === "asc" ? 1 : -1;
    return 0;
  });

  const toggleExpand = (uid: string) =>
    setExpandedUid((prev) => (prev === uid ? null : uid));

  /** UI HELPERS */
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

  return (
    <div>
      <h2 style={{ fontSize: 26, fontWeight: 700, marginBottom: 10 }}>All Users</h2>
      <p style={{ fontSize: 14, color: "var(--sidebar-text)", marginBottom: 16 }}>
        View all users, search, sort, and expand to view full details.
      </p>

      {/* SEARCH BAR */}
      <div style={{ marginBottom: 14 }}>
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
          <p style={{ fontSize: 14, color: "var(--sidebar-text)" }}>Loading users...</p>
        ) : error ? (
          <p style={{ fontSize: 14, color: "var(--danger)" }}>{error}</p>
        ) : sorted.length === 0 ? (
          <p style={{ fontSize: 14, color: "var(--sidebar-text)" }}>No users found.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)", background: "var(--table-header-bg)" }}>
                  <th style={headerCellStyle} onClick={() => handleSort("name")}>Name</th>
                  <th style={headerCellStyle} onClick={() => handleSort("email")}>Email</th>
                  <th style={headerCellStyle} onClick={() => handleSort("role")}>Role</th>
                  <th style={headerCellStyle} onClick={() => handleSort("department")}>Department</th>
                  <th style={headerCellStyle} onClick={() => handleSort("salary")}>Salary</th>
                  <th style={headerCellStyle} onClick={() => handleSort("joiningDate")}>Joining Date</th>
                  <th style={{ ...headerCellStyle, textAlign: "right" }}>Action</th>
                </tr>
              </thead>

              <tbody>
                {sorted.map((u) => {
                  const expanded = expandedUid === u.uid;
                  return (
                    <>
                      <tr key={u.uid} style={{ borderBottom: "1px solid var(--border)" }}>
                        <td style={bodyCellStyle}>{u.name || "-"}</td>
                        <td style={bodyCellStyle}>{u.email || "-"}</td>
                        <td style={bodyCellStyle}>{u.role || "-"}</td>
                        <td style={bodyCellStyle}>{u.department || "-"}</td>
                        <td style={bodyCellStyle}>Rs. {Number(u.salary || 0).toLocaleString()}</td>
                        <td style={bodyCellStyle}>
                          {u.joiningDate ? new Date(u.joiningDate).toLocaleDateString() : "-"}
                        </td>
                        <td style={{ ...bodyCellStyle, textAlign: "right" }}>
                          <button
                            onClick={() => toggleExpand(u.uid)}
                            style={{
                              padding: "6px 14px",
                              borderRadius: 999,
                              border: "1px solid var(--border)",
                              background: expanded ? "var(--primary)" : "var(--input-bg)",
                              color: expanded ? "#fff" : "var(--text)",
                              fontSize: 13,
                              fontWeight: 500,
                              cursor: "pointer",
                            }}
                          >
                            {expanded ? "Hide" : "View"}
                          </button>
                        </td>
                      </tr>

                      {expanded && (
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

/* -------------------------------------------------
   SAFE DETAILS PANEL (NO RUNTIME ERRORS POSSIBLE)
--------------------------------------------------*/

function UserDetailsPanel({ user }: { user: UserRecord }) {
  const safe = (v: any) => (v === null || v === undefined || v === "" ? "-" : String(v));

  const formatPKR = (v: any) => {
    const num = Number(v);
    return isNaN(num) ? "-" : `Rs. ${num.toLocaleString("en-PK")}`;
  };

  const formatUSD = (v: any) => {
    const num = Number(v);
    return isNaN(num) ? "-" : `$${num.toLocaleString("en-US")}`;
  };

  const formatDate = (v: any) => {
    if (!v) return "-";
    const d = new Date(v);
    return isNaN(d.getTime()) ? "-" : d.toLocaleDateString();
  };

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
      <DetailItem label="Full Name" value={safe(user.name)} />
      <DetailItem label="Email" value={safe(user.email)} />
      <DetailItem label="Phone" value={safe(user.phone)} />
      <DetailItem label="Role" value={safe(user.role)} />
      <DetailItem label="Department" value={safe(user.department)} />
      <DetailItem label="Designation" value={safe(user.designation)} />

      <DetailItem label="Monthly Salary (PKR)" value={formatPKR(user.salary)} />
      <DetailItem label="Monthly Target (USD)" value={formatUSD(user.monthlyTarget)} />
      <DetailItem label="Commission (%)" value={safe(user.commission ? `${user.commission}%` : "-")} />
      <DetailItem label="Joining Date" value={formatDate(user.joiningDate)} />

      {user.uid && (
        <div style={{ gridColumn: "1 / -1", textAlign: "right", marginTop: 10 }}>
          <a
            href={`/admin/users/${user.uid}/edit`}
            style={{
              padding: "8px 16px",
              background: "var(--primary)",
              color: "#fff",
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            Edit User
          </a>
        </div>
      )}
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
