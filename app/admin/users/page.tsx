"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type React from "react";

type UserRecord = {
  uid?: string;
  id?: string;
  docId?: string;
  userId?: string;
  firebaseUid?: string;

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
  cnic?: string;
  dob?: string;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: any;
};

type SortKey = "name" | "email" | "phone" | "department" | "createdAt" | "role";
type SortDir = "asc" | "desc";

/** Always get a usable ID no matter what your API returns */
const getRowId = (u: any) =>
  (u?.uid || u?.id || u?.docId || u?.userId || u?.firebaseUid || u?.email || "") as string;

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
        if (isMounted) setError(err?.message || "Unexpected error occurred.");
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadUsers();

    return () => {
      isMounted = false;
    };
  }, []);

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

      setUsers((prev) => prev.filter((u) => getRowId(u) !== uid));
      setExpandedUid((prev) => (prev === uid ? null : prev));
    } catch (e) {
      console.error("Error deleting user:", e);
      alert("Error deleting user");
    } finally {
      setDeletingUid((prev) => (prev === uid ? null : prev));
    }
  };

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
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

  const renderDate = (v?: string) => {
    if (!v) return "-";
    const d = new Date(v);
    return isNaN(d.getTime()) ? "-" : d.toLocaleDateString();
  };

  const filtered = users.filter((u) => {
    if (!search.trim()) return true;
    const term = search.trim().toLowerCase();
    return [u.name, u.email, u.phone, u.role, u.department]
      .filter(Boolean)
      .some((v) => v!.toString().toLowerCase().includes(term));
  });

  const sorted = [...filtered].sort((a, b) => {
    const aVal = getSortValue(a, sortKey);
    const bVal = getSortValue(b, sortKey);

    if (aVal < bVal) return sortDir === "asc" ? -1 : 1;
    if (aVal > bVal) return sortDir === "asc" ? 1 : -1;
    return 0;
  });

  const activeUser =
    expandedUid && users.length ? users.find((u) => getRowId(u) === expandedUid) || null : null;

  const toggleExpand = (uid: string) => {
    if (!uid) return;
    setExpandedUid((prev) => (prev === uid ? null : uid));
  };

  const tableShellStyle: React.CSSProperties = {
    borderRadius: 20,
    background: "var(--surface)",
    border: "1px solid var(--border)",
    padding: 16,
    boxShadow: "none",
  };

  const headerCellStyle: React.CSSProperties = {
    padding: "10px 12px",
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.08,
    color: "var(--table-head)",
    fontWeight: 700,
    borderBottom: "1px solid var(--table-row-border)",
    whiteSpace: "nowrap",
    textAlign: "left",
    cursor: "pointer",
    userSelect: "none",
  };

  const bodyCellStyle: React.CSSProperties = {
    padding: "10px 12px",
    fontSize: 14,
    color: "var(--table-text)",
    borderBottom: "1px dashed var(--table-row-border)",
    verticalAlign: "middle",
    whiteSpace: "nowrap",
  };

  return (
    <div>
      <h2 style={{ fontSize: 26, fontWeight: 700, marginBottom: 10 }}>All Users</h2>
      <p style={{ fontSize: 14, color: "var(--muted)", marginBottom: 16 }}>
        Manage all internal users in one place. Search, sort, and open full HR details in a clean right-side drawer.
      </p>

      <div style={{ marginBottom: 16, maxWidth: 360 }}>
        <input
          className="input"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search keyword"
        />
      </div>

      <div style={tableShellStyle}>
        {loading ? (
          <p style={{ fontSize: 14, color: "var(--muted)" }}>Loading users...</p>
        ) : error ? (
          <p style={{ fontSize: 14, color: "#FCA5A5" }}>{error}</p>
        ) : sorted.length === 0 ? (
          <p style={{ fontSize: 14, color: "var(--muted)" }}>No users found.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead>
                <tr>
                  <th style={headerCellStyle} onClick={() => handleSort("name")}>
                    Name {sortKey === "name" ? (sortDir === "asc" ? "▲" : "▼") : ""}
                  </th>
                  <th style={headerCellStyle} onClick={() => handleSort("email")}>
                    Email {sortKey === "email" ? (sortDir === "asc" ? "▲" : "▼") : ""}
                  </th>
                  <th style={headerCellStyle} onClick={() => handleSort("phone")}>
                    Phone {sortKey === "phone" ? (sortDir === "asc" ? "▲" : "▼") : ""}
                  </th>
                  <th style={headerCellStyle} onClick={() => handleSort("department")}>
                    Department {sortKey === "department" ? (sortDir === "asc" ? "▲" : "▼") : ""}
                  </th>
                  <th style={headerCellStyle} onClick={() => handleSort("createdAt")}>
                    Joining / Created {sortKey === "createdAt" ? (sortDir === "asc" ? "▲" : "▼") : ""}
                  </th>
                  <th style={{ ...headerCellStyle, textAlign: "right", cursor: "default" }}>Action</th>
                </tr>
              </thead>

              <tbody>
                {sorted.map((u, idx) => {
                  const rowId = getRowId(u);
                  const expanded = expandedUid === rowId;
                  const rowBg = idx % 2 === 0 ? "var(--surface-2)" : "transparent";

                  return (
                    <tr key={rowId} style={{ background: rowBg, transition: "background 120ms ease" }}>
                      <td style={bodyCellStyle}>{u.name || "-"}</td>
                      <td style={bodyCellStyle}>{u.email || "-"}</td>
                      <td style={bodyCellStyle}>{u.phone || "-"}</td>
                      <td style={bodyCellStyle}>{u.department || "-"}</td>
                      <td style={bodyCellStyle}>
                        {u.joiningDate ? renderDate(u.joiningDate) : u.createdAt ? renderDate(u.createdAt) : "-"}
                      </td>
                      <td style={{ ...bodyCellStyle, textAlign: "right" }}>
                        <button
                          type="button"
                          onClick={() => toggleExpand(rowId)}
                          className="btn ghost"
                          style={{ padding: "6px 14px", borderRadius: 999, fontSize: 13, fontWeight: 600 }}
                        >
                          {expanded ? "Close" : "View"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {activeUser && (
        <>
          <div className="drawerOverlay" onClick={() => setExpandedUid(null)} />

          <aside className="drawerShell">
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 800, color: "var(--text)" }}>
                  {activeUser.name || "Untitled User"}
                </div>
                <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 2 }}>
                  {activeUser.email || "No email"} · {(activeUser.role || "No role").toString()}
                </div>
              </div>

              <button
                type="button"
                onClick={() => setExpandedUid(null)}
                className="btn ghost"
                style={{ padding: "4px 10px", borderRadius: 999, fontSize: 12 }}
              >
                Close
              </button>
            </div>

            <div className="drawerPanel" style={{ flex: 1, overflowY: "auto" }}>
              <div style={{ padding: 14 }}>
                <UserDetailsPanel
                  user={activeUser}
                  deleting={deletingUid === getRowId(activeUser)}
                  onDelete={(id) => handleDelete(id)}
                  onEdit={(id) => router.push(`/admin/users/${id}/edit`)}
                />
              </div>
            </div>
          </aside>
        </>
      )}
    </div>
  );
}

type UserDetailsProps = {
  user: UserRecord;
  onDelete?: (uid: string) => void;
  onEdit?: (uid: string) => void;
  deleting?: boolean;
};

function UserDetailsPanel({ user, onDelete, onEdit, deleting }: UserDetailsProps) {
  const safe = (v: any) => (v === null || v === undefined || v === "" ? "-" : String(v));

  const formatPKR = (v: any) => {
    const num = Number(v);
    return isNaN(num) ? "-" : `Rs. ${num.toLocaleString("en-PK")}`;
  };

  const formatUSD = (v: any) => {
    const num = Number(v);
    return isNaN(num) ? "-" : `$ ${num.toLocaleString("en-US")}`;
  };

  const formatDate = (v: any) => {
    if (!v) return "-";
    const d = new Date(v);
    return isNaN(d.getTime()) ? "-" : d.toLocaleDateString();
  };

  return (
    <div
      style={{
        borderRadius: 20,
        padding: 16,
        border: "1px solid var(--border)",
        background: "var(--surface)",
        boxShadow: "var(--shadow-card)",
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
        gap: 16,
      }}
    >
      <DetailItem label="Designation" value={safe(user.designation)} />
      <DetailItem label="Role" value={safe(user.role)} />
      <DetailItem label="Department" value={safe(user.department)} />
      <DetailItem label="Joining Date" value={formatDate(user.joiningDate)} />

      <DetailItem label="Monthly Salary (PKR)" value={formatPKR(user.salary)} />
      <DetailItem label="Monthly Target (USD $)" value={formatUSD(user.monthlyTarget)} />

      <DetailItem
        label="Commission (%)"
        value={user.commission !== undefined && user.commission !== null ? `${user.commission}%` : "-"}
      />
      <DetailItem label="Status" value={safe(user.status)} />

      <DetailItem label="CNIC" value={safe(user.cnic)} />
      <DetailItem label="Date of Birth" value={formatDate(user.dob)} />
      <DetailItem label="Created At" value={formatDate(user.createdAt)} />
      <DetailItem label="Updated At" value={formatDate(user.updatedAt)} />

      <div style={{ gridColumn: "1 / -1", display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 10 }}>
        {onDelete && (
          <button
            type="button"
            onClick={() => onDelete(getRowId(user))}
            disabled={deleting}
            className="btn btn-danger"
            style={{ opacity: deleting ? 0.7 : 1, cursor: deleting ? "not-allowed" : "pointer" }}
          >
            {deleting ? "Deleting..." : "Delete User"}
          </button>
        )}

        {onEdit && (
          <button type="button" onClick={() => onEdit(getRowId(user))} className="btn">
            Edit User
          </button>
        )}
      </div>
    </div>
  );
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span
        style={{
          fontSize: 11,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: 0.45,
          color: "var(--muted)",
        }}
      >
        {label}
      </span>
      <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text)" }}>{value}</span>
    </div>
  );
}
