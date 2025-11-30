"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type React from "react";

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
  cnic?: string;
  dob?: string;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: any;
};

type SortKey = "name" | "email" | "phone" | "department" | "createdAt";
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

  /** HARD DELETE (AUTH + FIRESTORE) */
  const handleDelete = async (uid: string) => {
    const confirmDelete = window.confirm(
      "Are you sure you want to permanently delete this user? This action cannot be undone."
    );
    if (!confirmDelete) return;

    try {
      setDeletingUid(uid);

      const res = await fetch("/api/admin/users/delete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ uid }),
      });

      if (!res.ok) {
        const msg = await res.text();
        alert(msg || "Failed to delete user");
        return;
      }

      setUsers((prev) => prev.filter((u) => u.uid !== uid));
      setExpandedUid((prev) => (prev === uid ? null : prev));
    } catch (e) {
      console.error("Error deleting user:", e);
      alert("Error deleting user");
    } finally {
      setDeletingUid((prev) => (prev === uid ? null : prev));
    }
  };

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
    if (key === "createdAt") {
      const d = u.createdAt ? new Date(u.createdAt) : null;
      return d && !isNaN(d.getTime()) ? d.getTime() : 0;
    }

    const f =
      key === "name"
        ? u.name
        : key === "email"
        ? u.email
        : key === "phone"
        ? u.phone
        : key === "department"
        ? u.department
        : "";

    return (f || "").toString().toLowerCase();
  };

  /** FILTER */
  const filtered = users.filter((u) => {
    if (!search.trim()) return true;
    const term = search.trim().toLowerCase();
    return [u.name, u.email, u.phone, u.department]
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

  const toggleExpand = (uid: string) => {
    setExpandedUid((prev) => (prev === uid ? null : uid));
  };

  /** UI STYLES FOR THIS PAGE ONLY (no global card dependency) */
  const tableShellStyle: React.CSSProperties = {
    background: "#3C3C3C", // flat grey in BOTH themes
    color: "#FFFFFF",
    borderRadius: 24,
    padding: 16,
    border: "1px solid rgba(148,163,184,0.4)",
    boxShadow: "none",
  };

  const headerCellStyle: React.CSSProperties = {
    padding: 10,
    textAlign: "left",
    fontWeight: 600,
    fontSize: 13,
    cursor: "pointer",
    userSelect: "none",
    whiteSpace: "nowrap",
    color: "#FFFFFF",
  };

  const bodyCellStyle: React.CSSProperties = {
    padding: 10,
    fontSize: 13,
    verticalAlign: "middle",
    color: "#FFFFFF",
  };

  return (
    <div>
      <h2 style={{ fontSize: 26, fontWeight: 700, marginBottom: 10 }}>
        All Users
      </h2>
      <p
        style={{
          fontSize: 14,
          color: "var(--mut, #94A3B8)",
          marginBottom: 16,
        }}
      >
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
            maxWidth: 420,
            padding: "8px 12px",
            borderRadius: 999,
            border: "1px solid rgba(148,163,184,.5)",
            background: "transparent",
            color: "inherit",
            fontSize: 14,
          }}
        />
      </div>

      {/* MAIN TABLE – GREY BACKGROUND, WHITE TEXT */}
      <div style={tableShellStyle}>
        {loading ? (
          <p style={{ fontSize: 14, color: "#E5E7EB" }}>Loading users...</p>
        ) : error ? (
          <p style={{ fontSize: 14, color: "#FCA5A5" }}>{error}</p>
        ) : sorted.length === 0 ? (
          <p style={{ fontSize: 14, color: "#E5E7EB" }}>No users found.</p>
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
                    borderBottom: "1px dashed rgba(148,163,184,.5)",
                  }}
                >
                  <th style={headerCellStyle} onClick={() => handleSort("name")}>
                    Full Name{" "}
                    {sortKey === "name" ? (sortDir === "asc" ? "▲" : "▼") : ""}
                  </th>
                  <th
                    style={headerCellStyle}
                    onClick={() => handleSort("email")}
                  >
                    Email{" "}
                    {sortKey === "email" ? (sortDir === "asc" ? "▲" : "▼") : ""}
                  </th>
                  <th
                    style={headerCellStyle}
                    onClick={() => handleSort("phone")}
                  >
                    Phone{" "}
                    {sortKey === "phone" ? (sortDir === "asc" ? "▲" : "▼") : ""}
                  </th>
                  <th
                    style={headerCellStyle}
                    onClick={() => handleSort("department")}
                  >
                    Department{" "}
                    {sortKey === "department"
                      ? sortDir === "asc"
                        ? "▲"
                        : "▼"
                      : ""}
                  </th>
                  <th
                    style={headerCellStyle}
                    onClick={() => handleSort("createdAt")}
                  >
                    Joining Date{" "}
                    {sortKey === "createdAt"
                      ? sortDir === "asc"
                        ? "▲"
                        : "▼"
                      : ""}
                  </th>
                  <th
                    style={{
                      ...headerCellStyle,
                      textAlign: "right",
                      cursor: "default",
                    }}
                  >
                    Action
                  </th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((u) => {
                  const expanded = expandedUid === u.uid;
                  return (
                    <>
                      <tr
                        key={u.uid}
                        style={{
                          borderBottom:
                            "1px dashed rgba(148,163,184,.35)",
                        }}
                      >
                        <td style={bodyCellStyle}>{u.name || "-"}</td>
                        <td style={bodyCellStyle}>{u.email || "-"}</td>
                        <td style={bodyCellStyle}>{u.phone || "-"}</td>
                        <td style={bodyCellStyle}>{u.department || "-"}</td>
                        <td style={bodyCellStyle}>
                          {u.joiningDate
                            ? new Date(u.joiningDate).toLocaleDateString()
                            : u.createdAt
                            ? new Date(u.createdAt).toLocaleDateString()
                            : "-"}
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
                            className="btn ghost"
                            style={{
                              padding: "6px 14px",
                              borderRadius: 999,
                              fontSize: 13,
                              fontWeight: 600,
                              borderColor: "rgba(148,163,184,.7)",
                              color: "#FFFFFF",
                            }}
                          >
                            {expanded ? "Hide" : "View"}
                          </button>
                        </td>
                      </tr>

                      {expanded && (
                        <tr key={`${u.uid}-details`}>
                          <td colSpan={6} style={{ paddingTop: 12 }}>
                            <UserDetailsPanel
                              user={u}
                              deleting={deletingUid === u.uid}
                              onDelete={handleDelete}
                              onEdit={(uid) =>
                                router.push(`/admin/users/${uid}/edit`)
                              }
                            />
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

type UserDetailsProps = {
  user: UserRecord;
  onDelete?: (uid: string) => void;
  onEdit?: (uid: string) => void;
  deleting?: boolean;
};

/* -------------------------------------------------
   DRAWER PANEL – ALSO GREY, WHITE TEXT
--------------------------------------------------*/

function UserDetailsPanel({
  user,
  onDelete,
  onEdit,
  deleting,
}: UserDetailsProps) {
  const safe = (v: any) =>
    v === null || v === undefined || v === "" ? "-" : String(v);

  const formatPKR = (v: any) => {
    const num = Number(v);
    return isNaN(num) ? "-" : `Rs. ${num.toLocaleString("en-PK")}`;
  };

  const formatAmount = (v: any) => {
    const num = Number(v);
    return isNaN(num) ? "-" : num.toLocaleString();
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
        background: "#2A2A2A",
        color: "#FFFFFF",
        padding: 16,
        border: "1px solid rgba(148,163,184,0.5)",
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
        gap: 16,
      }}
    >
      {/* You wanted these fields in the drawer */}
      <DetailItem label="Designation" value={safe(user.designation)} />
      <DetailItem label="Role" value={safe(user.role)} />
      <DetailItem label="Department" value={safe(user.department)} />
      <DetailItem label="Joining Date" value={formatDate(user.joiningDate)} />
      <DetailItem label="Monthly Salary (PKR)" value={formatPKR(user.salary)} />
      <DetailItem
        label="Monthly Target (Amount)"
        value={formatAmount(user.monthlyTarget)}
      />
      <DetailItem
        label="Commission (%)"
        value={
          user.commission !== undefined && user.commission !== null
            ? `${user.commission}%`
            : "-"
        }
      />
      <DetailItem label="Status" value={safe(user.status)} />

      {/* Extra context */}
      <DetailItem label="CNIC" value={safe(user.cnic)} />
      <DetailItem label="Date of Birth" value={formatDate(user.dob)} />
      <DetailItem label="Created At" value={formatDate(user.createdAt)} />
      <DetailItem label="Updated At" value={formatDate(user.updatedAt)} />

      {/* Actions (you said Delete & Edit styles are already good in your code) */}
      <div
        style={{
          gridColumn: "1 / -1",
          display: "flex",
          justifyContent: "flex-end",
          gap: 8,
          marginTop: 10,
        }}
      >
        {onDelete && (
          <button
            type="button"
            onClick={() => onDelete(user.uid)}
            disabled={deleting}
            className="btn btn-danger"
            style={{
              opacity: deleting ? 0.7 : 1,
              cursor: deleting ? "not-allowed" : "pointer",
            }}
          >
            {deleting ? "Deleting..." : "Delete User"}
          </button>
        )}

        {onEdit && (
          <button
            type="button"
            onClick={() => onEdit(user.uid)}
            className="btn"
          >
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
          fontWeight: 600,
          color: "#E5E7EB",
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
          color: "#FFFFFF",
        }}
      >
        {value}
      </span>
    </div>
  );
}
