// app/admin/users/page.tsx
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

type SortKey = "name" | "email" | "phone" | "department" | "createdAt" | "role";
type SortDir = "asc" | "desc";

const getRowId = (u: any) =>
  (u?.uid ||
    u?.id ||
    u?.docId ||
    u?.userId ||
    u?.firebaseUid ||
    u?.email ||
    "") as string;

export default function UsersPage() {
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>("");
  const [search, setSearch] = useState<string>("");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [expandedUid, setExpandedUid] = useState<string | null>(null);
  const [deletingUid, setDeletingUid] = useState<string | null>(null);

  // Follow OS theme (no toggle here)
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setIsDark(!!mql.matches);
    onChange();
    // Safari < 14 fallback
    // @ts-expect-error older browsers
    mql.addEventListener ? mql.addEventListener("change", onChange) : mql.addListener(onChange);
    return () => {
      // @ts-expect-error older browsers
      mql.removeEventListener ? mql.removeEventListener("change", onChange) : mql.removeListener(onChange);
    };
  }, []);

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
        headers: { "Content-Type": "application/json" },
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

  /** Safe date render (kills "Invalid Date") */
  const renderDate = (v?: string) => {
    if (!v) return "-";
    const d = new Date(v);
    return isNaN(d.getTime()) ? "-" : d.toLocaleDateString();
  };

  /** FILTER */
  const filtered = users.filter((u) => {
    if (!search.trim()) return true;
    const term = search.trim().toLowerCase();
    return [u.name, u.email, u.phone, u.role, u.department]
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

  /** Which user is active in the drawer */
  const activeUser =
    expandedUid && users.length ? users.find((u) => u.uid === expandedUid) || null : null;

  const toggleExpand = (uid: string) => {
    setExpandedUid((prev) => (prev === uid ? null : prev));
  };

  // === TABLE STYLES (final: neutral enterprise surfaces) ===

  // Light: soft slate surface (less “white sheet”)
  const lightShell = "#F8FAFC"; // slate-50
  const lightInset = "0 0 0 1px rgba(15,23,42,0.06) inset";

  // Dark: neutral charcoal (NOT navy/blue)
  const darkShell = "rgba(255,255,255,0.055)"; // matches input-grey vibe
  const darkInset = "0 0 0 1px rgba(255,255,255,0.06) inset";

  const tableShellStyle: React.CSSProperties = {
    borderRadius: 20,
    background: isDark ? darkShell : lightShell,
    border: isDark ? "1px solid rgba(255,255,255,0.08)" : "1px solid rgba(15,23,42,0.08)",
    padding: 16,
    boxShadow: isDark ? "0 18px 55px rgba(0,0,0,0.55)" : "0 14px 40px rgba(15,23,42,0.06)",
    ...(isDark ? { boxShadow: "0 18px 55px rgba(0,0,0,0.55)", } : {}),
  };

  const headerCellStyle: React.CSSProperties = {
    padding: "10px 12px",
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.08,
    color: isDark ? "rgba(255,255,255,0.80)" : "rgba(15,23,42,0.70)",
    fontWeight: 700,
    borderBottom: isDark ? "1px solid rgba(255,255,255,0.10)" : "1px solid rgba(15,23,42,0.10)",
    whiteSpace: "nowrap",
    textAlign: "left",
    cursor: "pointer",
    userSelect: "none",
  };

  const bodyCellStyle: React.CSSProperties = {
    padding: "10px 12px",
    fontSize: 14,
    color: isDark ? "rgba(255,255,255,0.88)" : "rgba(15,23,42,0.86)",
    borderBottom: isDark ? "1px dashed rgba(255,255,255,0.10)" : "1px dashed rgba(15,23,42,0.10)",
    verticalAlign: "middle",
    whiteSpace: "nowrap",
  };

  return (
    <div>
      <h2 style={{ fontSize: 26, fontWeight: 700, marginBottom: 10 }}>All Users</h2>
      <p style={{ fontSize: 14, color: "var(--mut, #94A3B8)", marginBottom: 16 }}>
        Manage all internal users in one place. Search, sort, and open full HR details in a clean right-side drawer.
      </p>

      {/* Search input */}
      <div style={{ marginBottom: 16, maxWidth: 360 }}>
        <input
          className="input"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search keyword"
        />
      </div>

      {/* Table Shell */}
      <div style={tableShellStyle}>
        {loading ? (
          <p style={{ fontSize: 14, color: isDark ? "rgba(255,255,255,0.85)" : "rgba(15,23,42,0.70)" }}>
            Loading users...
          </p>
        ) : error ? (
          <p style={{ fontSize: 14, color: "#FCA5A5" }}>{error}</p>
        ) : sorted.length === 0 ? (
          <p style={{ fontSize: 14, color: isDark ? "rgba(255,255,255,0.85)" : "rgba(15,23,42,0.70)" }}>
            No users found.
          </p>
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
                  const expanded = expandedUid === u.uid;

                  // subtle row surface (keeps the table from feeling like a single slab)
                  const rowBg = isDark
                    ? idx % 2 === 0
                      ? "rgba(255,255,255,0.02)"
                      : "rgba(255,255,255,0.00)"
                    : idx % 2 === 0
                    ? "rgba(15,23,42,0.015)"
                    : "rgba(15,23,42,0.00)";

                  return (
                    <tr
                      key={u.uid}
                      style={{
                        background: rowBg,
                        transition: "background 120ms ease",
                      }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLTableRowElement).style.background = isDark
                          ? "rgba(255,255,255,0.04)"
                          : "rgba(15,23,42,0.03)";
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLTableRowElement).style.background = rowBg;
                      }}
                    >
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
                          onClick={() => toggleExpand(u.uid)}
                          className="btn ghost"
                          style={{
                            padding: "6px 14px",
                            borderRadius: 999,
                            fontSize: 13,
                            fontWeight: 600,
                            borderColor: isDark ? "rgba(255,255,255,0.28)" : "rgba(15,23,42,0.18)",
                            color: isDark ? "rgba(255,255,255,0.92)" : "rgba(15,23,42,0.85)",
                            background: isDark ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.55)",
                          }}
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

      {/* RIGHT-SIDE DRAWER */}
      {activeUser && (
        <>
          {/* Backdrop */}
          <div
            onClick={() => setExpandedUid(null)}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(15,23,42,0.55)",
              backdropFilter: "blur(6px)",
              WebkitBackdropFilter: "blur(6px)",
              zIndex: 40,
            }}
          />

          {/* Drawer */}
          <aside
            style={{
              position: "fixed",
              top: 0,
              right: 0,
              height: "100vh",
              width: "min(420px, 100%)",
              background:
                "radial-gradient(circle at top left, rgba(56,189,248,0.16), transparent 55%), var(--card-bg, #020617)",
              borderLeft: "1px solid rgba(148,163,184,0.55)",
              boxShadow: "-32px 0 80px rgba(15,23,42,0.95)",
              padding: 20,
              display: "flex",
              flexDirection: "column",
              gap: 16,
              zIndex: 50,
              animation: "slideInUsersDrawer 220ms ease-out",
            }}
          >
            {/* Drawer header */}
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 700, color: "#F9FAFB" }}>
                  {activeUser.name || "Untitled User"}
                </div>
                <div style={{ fontSize: 13, color: "var(--mut, #9CA3AF)", marginTop: 2 }}>
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

            {/* Drawer content */}
            <div style={{ flex: 1, overflowY: "auto", paddingRight: 2 }}>
              <UserDetailsPanel
                user={activeUser}
                deleting={deletingUid === activeUser.uid}
                onDelete={handleDelete}
                onEdit={(uid) => router.push(`/admin/users/${uid}/edit`)}
              />
            </div>
          </aside>

          <style jsx global>{`
            @keyframes slideInUsersDrawer {
              from {
                transform: translateX(100%);
                opacity: 0;
              }
              to {
                transform: translateX(0);
                opacity: 1;
              }
            }
          `}</style>
        </>
      )}
    </div>
  );
}

/* -------------------------------------------------
   DRAWER PANEL (tinted card, grid layout)
--------------------------------------------------*/

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
        background: "var(--card-bg, #020617)",
        color: "#FFFFFF",
        padding: 16,
        border: "1px solid rgba(148,163,184,0.5)",
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
      <DetailItem label="Monthly Target (Amount)" value={formatAmount(user.monthlyTarget)} />
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
            onClick={() => onDelete(user.uid)}
            disabled={deleting}
            className="btn btn-danger"
            style={{ opacity: deleting ? 0.7 : 1, cursor: deleting ? "not-allowed" : "pointer" }}
          >
            {deleting ? "Deleting..." : "Delete User"}
          </button>
        )}

        {onEdit && (
          <button type="button" onClick={() => onEdit(user.uid)} className="btn">
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
      <span style={{ fontSize: 14, fontWeight: 500, color: "#FFFFFF" }}>{value}</span>
    </div>
  );
}
