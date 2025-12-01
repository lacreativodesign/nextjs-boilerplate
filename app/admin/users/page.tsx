"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type UserRecord = {
  uid: string;
  name?: string;
  email?: string;
  phone?: string;
  role?: string;
  department?: string;
  salary?: number | string;
  joiningDate?: string;
  designation?: string;
  monthlyTarget?: number | string;
  commission?: number | string;
  status?: string;
  createdAt?: string;
  updatedAt?: string;
  cnic?: string;
  dob?: string;
  [key: string]: any;
};

type SortKey = "name" | "email" | "phone" | "role" | "department" | "createdAt";
type SortDir = "asc" | "desc";

export default function UsersPage() {
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>("");
  const [search, setSearch] = useState<string>("");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [expandedUid, setExpandedUid] = useState<string | null>(null);
  const [deletingUid, setDeletingUid] = useState<string | null>(null);

  const router = useRouter();

  useEffect(() => {
    let isMounted = true;

    async function loadUsers() {
      try {
        setLoading(true);
        setError("");

        const res = await fetch("/api/admin/users/list");
        if (!res.ok) throw new Error("Failed to load users");

        const data = await res.json();
        if (isMounted && Array.isArray(data)) {
          setUsers(data);
        }
      } catch (err: any) {
        if (isMounted) setError(err.message || "Unexpected error occurred.");
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadUsers();

    return () => {
      isMounted = false;
    };
  }, []);

  /** DELETE USER */
  const handleDelete = async (uid: string) => {
    const confirmDelete = window.confirm(
      "Are you sure you want to permanently delete this user? This action cannot be undone."
    );
    if (!confirmDelete) return;

    try {
      setDeletingUid(uid);

      const res = await fetch("/api/admin/users/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid }),
      });

      if (!res.ok) {
        const msg = await res.text();
        alert(msg || "Failed to delete user");
        return;
      }

      setUsers(prev => prev.filter(u => u.uid !== uid));
      setExpandedUid(prev => (prev === uid ? null : prev));
    } catch (e) {
      console.error("Delete error:", e);
      alert("Error deleting user");
    } finally {
      setDeletingUid(null);
    }
  };

  /** SORTING */
  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(prev => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const getSortValue = (u: UserRecord, key: SortKey) => {
    if (key === "createdAt") {
      const d = u.createdAt ? new Date(u.createdAt) : null;
      return d && !isNaN(d.getTime()) ? d.getTime() : 0;
    }

    const field =
      key === "name"
        ? u.name
        : key === "email"
        ? u.email
        : key === "phone"
        ? u.phone
        : key === "role"
        ? u.role
        : key === "department"
        ? u.department
        : "";

    return (field || "").toString().toLowerCase();
  };

  /** FILTER */
  const filtered = users.filter(u => {
    if (!search.trim()) return true;
    const term = search.trim().toLowerCase();
    return [u.name, u.email, u.phone, u.role, u.department]
      .filter(Boolean)
      .some(v => v!.toString().toLowerCase().includes(term));
  });

  /** SORT */
  const sorted = [...filtered].sort((a, b) => {
    const aVal = getSortValue(a, sortKey);
    const bVal = getSortValue(b, sortKey);
    if (aVal < bVal) return sortDir === "asc" ? -1 : 1;
    if (aVal > bVal) return sortDir === "asc" ? 1 : -1;
    return 0;
  });

  const toggleExpand = (uid: string) => {
    setExpandedUid(prev => (prev === uid ? null : uid));
  };

  /** STYLES */
  const headerStyle: React.CSSProperties = {
    padding: "10px",
    textAlign: "left",
    fontWeight: 600,
    fontSize: 13,
    cursor: "pointer",
    userSelect: "none",
    whiteSpace: "nowrap",
    color: "var(--text)",
  };

  const cellStyle: React.CSSProperties = {
    padding: "10px",
    fontSize: 13,
    verticalAlign: "middle",
    color: "var(--text)",
  };

  return (
    <div>
      <h2 style={{ fontSize: 26, fontWeight: 700, marginBottom: 10, color: "var(--text)" }}>
        All Users
      </h2>

      <p style={{ fontSize: 14, color: "var(--text-muted)", marginBottom: 16 }}>
        View all users, search, sort, and manage user details.
      </p>

      {/* SEARCH BAR */}
      <div style={{ marginBottom: 14 }}>
        <input
          className="input"
          placeholder="Search by name, email, phone, role or department..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ maxWidth: 420 }}
        />
      </div>

      {/* MAIN CARD */}
      <div className="card" style={{ padding: 16 }}>
        {loading ? (
          <p style={{ color: "var(--text-muted)" }}>Loading users...</p>
        ) : error ? (
          <p style={{ color: "var(--danger)" }}>{error}</p>
        ) : sorted.length === 0 ? (
          <p style={{ color: "var(--text-muted)" }}>No users found.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                background: "var(--card-inner)",
                borderRadius: 10,
              }}
            >
              <thead>
                <tr style={{ borderBottom: "1px dashed var(--border)" }}>
                  <th style={headerStyle} onClick={() => handleSort("name")}>
                    Full Name {sortKey === "name" ? (sortDir === "asc" ? "▲" : "▼") : ""}
                  </th>
                  <th style={headerStyle} onClick={() => handleSort("email")}>
                    Email {sortKey === "email" ? (sortDir === "asc" ? "▲" : "▼") : ""}
                  </th>
                  <th style={headerStyle} onClick={() => handleSort("phone")}>
                    Phone {sortKey === "phone" ? (sortDir === "asc" ? "▲" : "▼") : ""}
                  </th>
                  <th style={headerStyle} onClick={() => handleSort("role")}>
                    Role {sortKey === "role" ? (sortDir === "asc" ? "▲" : "▼") : ""}
                  </th>
                  <th style={headerStyle} onClick={() => handleSort("department")}>
                    Department {sortKey === "department" ? (sortDir === "asc" ? "▲" : "▼") : ""}
                  </th>
                  <th style={headerStyle} onClick={() => handleSort("createdAt")}>
                    Joining Date {sortKey === "createdAt" ? (sortDir === "asc" ? "▲" : "▼") : ""}
                  </th>
                  <th style={{ ...headerStyle, textAlign: "right" }}>Action</th>
                </tr>
              </thead>

              <tbody>
                {sorted.map(u => {
                  const expanded = expandedUid === u.uid;

                  return (
                    <>
                      <tr key={u.uid} style={{ borderBottom: "1px dashed var(--border)" }}>
                        <td style={cellStyle}>{u.name || "-"}</td>
                        <td style={cellStyle}>{u.email || "-"}</td>
                        <td style={cellStyle}>{u.phone || "-"}</td>
                        <td style={cellStyle}>{u.role || "-"}</td>
                        <td style={cellStyle}>{u.department || "-"}</td>
                        <td style={cellStyle}>
                          {u.createdAt
                            ? new Date(u.createdAt).toLocaleDateString()
                            : "-"}
                        </td>

                        <td style={{ ...cellStyle, textAlign: "right" }}>
                          <button
                            className="btn ghost"
                            type="button"
                            onClick={() => toggleExpand(u.uid)}
                          >
                            {expanded ? "Hide" : "View"}
                          </button>
                        </td>
                      </tr>

                      {expanded && (
                        <tr key={`${u.uid}-details`}>
                          <td colSpan={7} style={{ padding: 0 }}>
                            <div
                              className="card"
                              style={{
                                marginTop: 10,
                                padding: 16,
                                background: "var(--card-bg)",
                              }}
                            >
                              <UserDetails
                                user={u}
                                deleting={deletingUid === u.uid}
                                onDelete={handleDelete}
                                onEdit={() => router.push(`/admin/users/${u.uid}/edit`)}
                              />
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

/* -----------------------------------------------------------
   USER DETAILS PANEL (DRAWER CONTENT)
------------------------------------------------------------ */

function UserDetails({
  user,
  deleting,
  onDelete,
  onEdit,
}: {
  user: UserRecord;
  deleting: boolean;
  onDelete: (uid: string) => void;
  onEdit: (uid: string) => void;
}) {
  const safe = (v: any) =>
    v === null || v === undefined || v === "" ? "-" : String(v);

  const formatPKR = (v: any) => {
    const num = Number(v);
    return isNaN(num) ? "-" : `Rs. ${num.toLocaleString("en-PK")}`;
  };

  return (
    <div
      className="card"
      style={{
        padding: 16,
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
        gap: 16,
        background: "var(--card-bg)",
      }}
    >
      <Detail label="Designation" value={safe(user.designation)} />
      <Detail label="Role" value={safe(user.role)} />
      <Detail label="Department" value={safe(user.department)} />
      <Detail label="Monthly Salary" value={formatPKR(user.salary)} />
      <Detail label="Joining Date" value={safe(user.joiningDate)} />
      <Detail label="Monthly Target" value={safe(user.monthlyTarget)} />
      <Detail label="Commission (%)" value={safe(user.commission)} />
      <Detail label="Status" value={safe(user.status)} />

      {/* ACTION BUTTONS */}
      <div
        style={{
          gridColumn: "1 / -1",
          display: "flex",
          justifyContent: "flex-end",
          gap: 8,
          marginTop: 8,
        }}
      >
        <button
          className="btn-danger"
          disabled={deleting}
          onClick={() => onDelete(user.uid)}
        >
          {deleting ? "Deleting..." : "Delete User"}
        </button>

        <button className="btn" onClick={onEdit}>
          Edit User
        </button>
      </div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span
        style={{
          fontSize: 12,
          textTransform: "uppercase",
          fontWeight: 500,
          color: "var(--text-muted)",
        }}
      >
        {label}
      </span>

      <span
        style={{
          fontSize: 15,
          color: "var(--text)",
          fontWeight: 500,
        }}
      >
        {value}
      </span>
    </div>
  );
}
