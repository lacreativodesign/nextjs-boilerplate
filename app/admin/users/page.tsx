"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

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
  mfaEnabled?: boolean;
  cnic?: string;
  dob?: string;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: any;
};

type SortKey = "name" | "email" | "phone" | "department" | "status";
type SortDir = "asc" | "desc";

/** Always get a usable ID no matter what your API returns */
const getRowId = (u: any) =>
  (u?.uid || u?.id || u?.docId || u?.userId || u?.firebaseUid || u?.email || "") as string;

/** OS/Browser theme only */
function useIsSystemDark() {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const read = () => setIsDark(!!mql.matches);
    read();
    // @ts-expect-error older browsers
    mql.addEventListener ? mql.addEventListener("change", read) : mql.addListener(read);
    return () => {
      // @ts-expect-error older browsers
      mql.removeEventListener ? mql.removeEventListener("change", read) : mql.removeListener(read);
    };
  }, []);

  return isDark;
}

export default function UsersPage() {
  const isDark = useIsSystemDark();

  const [users, setUsers] = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>("");

  const [search, setSearch] = useState<string>("");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  const [deletingUid, setDeletingUid] = useState<string | null>(null);
  const [resettingMfaUid, setResettingMfaUid] = useState<string | null>(null);

  const router = useRouter();

  useEffect(() => {
    let alive = true;

    async function loadUsers() {
      try {
        setLoading(true);
        setError("");

        const res = await fetch("/api/admin/users/list", {
          method: "GET",
          cache: "no-store",
          credentials: "include",
        });

        const json = await res.json().catch(() => null);

        if (!res.ok) {
          throw new Error((json as any)?.error || "Failed to load users");
        }

        // Supports BOTH:
        // 1) API returns array: [...]
        // 2) API returns object: { ok: true, users: [...] }
        const list: any[] = Array.isArray(json) ? json : Array.isArray((json as any)?.users) ? (json as any).users : [];

        if (!alive) return;
        setUsers(list as UserRecord[]);
      } catch (err: any) {
        if (!alive) return;
        setError(err?.message || "Unexpected error occurred.");
        setUsers([]);
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    }

    loadUsers();
    return () => {
      alive = false;
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
        credentials: "include",
      });

      if (!res.ok) {
        const msg = await res.text().catch(() => "");
        alert(msg || "Failed to delete user");
        return;
      }

      setUsers((prev) => prev.filter((u) => getRowId(u) !== uid));
      if (selectedUid === uid) {
        setSelectedUid(null);
        setDrawerOpen(false);
      }
    } catch (e) {
      console.error("Error deleting user:", e);
      alert("Error deleting user");
    } finally {
      setDeletingUid((prev) => (prev === uid ? null : prev));
    }
  };

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const normalizeStatus = (value?: string) => {
    const raw = (value || "").trim().toLowerCase();
    if (!raw) return "Active";
    if (raw === "inactive" || raw === "disabled") return "Inactive";
    return "Active";
  };

  const getSortValue = (u: UserRecord, key: SortKey) => {
    const field =
      key === "name"
        ? u.name
        : key === "email"
        ? u.email
        : key === "phone"
        ? u.phone
        : key === "department"
        ? u.department
        : key === "status"
        ? normalizeStatus(u.status)
        : "";

    return (field || "").toString().toLowerCase();
  };

  const filtered = useMemo(() => {
    if (!search.trim()) return users;
    const term = search.trim().toLowerCase();
    return users.filter((u) =>
      [u.name, u.email, u.phone, u.department, normalizeStatus(u.status)]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(term))
    );
  }, [users, search]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      const aVal: any = getSortValue(a, sortKey);
      const bVal: any = getSortValue(b, sortKey);

      if (aVal < bVal) return sortDir === "asc" ? -1 : 1;
      if (aVal > bVal) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  const selectedUser =
    drawerOpen && selectedUid ? users.find((u) => getRowId(u) === selectedUid) || null : null;

  const openDrawer = (uid: string) => {
    if (!uid) return;
    setSelectedUid(uid);
    setDrawerOpen(true);
  };

  const closeDrawer = () => {
    setDrawerOpen(false);
    setSelectedUid(null);
  };

  const handleResetMfa = async (uid: string) => {
    const confirmReset = window.confirm(
      "Reset MFA for this user? They will need to re-enroll with an authenticator app."
    );
    if (!confirmReset) return;

    try {
      setResettingMfaUid(uid);
      const res = await fetch(`/api/admin/users/${uid}/mfa`, { method: "DELETE", credentials: "include" });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error || "Failed to reset MFA.");
      }

      setUsers((prev) =>
        prev.map((user) => (getRowId(user) === uid ? { ...user, mfaEnabled: false } : user))
      );
    } catch (err: any) {
      alert(err?.message || "Failed to reset MFA.");
    } finally {
      setResettingMfaUid((prev) => (prev === uid ? null : prev));
    }
  };

  const tableShellStyle: React.CSSProperties = {
    borderRadius: 20,
    padding: 14,
    border: isDark ? "1px solid rgba(255,255,255,0.08)" : "1px solid rgba(15,23,42,0.10)",
    background: isDark ? "rgba(20,20,20,0.92)" : "rgba(255,255,255,0.85)",
    boxShadow: isDark ? "0 18px 40px rgba(0,0,0,0.45)" : "0 18px 55px rgba(15,23,42,0.10)",
  };

  const headerCellStyle: React.CSSProperties = {
    padding: "12px 14px",
    fontSize: 11,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: isDark ? "rgba(226,232,240,0.66)" : "rgba(15,23,42,0.55)",
    borderBottom: isDark ? "1px solid rgba(255,255,255,0.08)" : "1px solid rgba(15,23,42,0.10)",
    cursor: "pointer",
    userSelect: "none",
    whiteSpace: "nowrap",
    textAlign: "left",
  };

  // Regular body text (not bold)
  const cellStyle: React.CSSProperties = {
    padding: "12px 14px",
    borderBottom: isDark ? "1px solid rgba(255,255,255,0.06)" : "1px dashed rgba(15,23,42,0.10)",
    color: isDark ? "rgba(226,232,240,0.86)" : "rgba(15,23,42,0.85)",
    whiteSpace: "nowrap",
    fontWeight: 400,
  };

  // Stable header label: reserve slot for sort arrow so layout never shifts
  const headerLabel = (label: string, active?: boolean, dir?: SortDir) => (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <span>{label}</span>
      <span style={{ width: 14, display: "inline-block", textAlign: "center", opacity: active ? 1 : 0.35 }}>
        {active ? (dir === "asc" ? "▲" : "▼") : "•"}
      </span>
    </span>
  );

  return (
    <div style={{ width: "100%" }}>
      <div className="page-header">
        <div>
          <h1 className="page-title">All Users</h1>

          <div className="page-subtitle" style={{ marginBottom: 18 }}>
            Manage all internal users. Search, sort, and open full HR details in the right-side drawer.
          </div>
        </div>

        <button
          type="button"
          className="btn"
          onClick={() => router.push("/admin/users/add")}
          style={{ borderRadius: 999, padding: "10px 20px", fontWeight: 600 }}
        >
          + Create User
        </button>
      </div>

      <div
        className="card"
        style={{
          marginBottom: 16,
          padding: 14,
          borderRadius: 16,
          background: isDark ? "rgba(24,24,24,0.9)" : "rgba(255,255,255,0.85)",
          border: isDark ? "1px solid rgba(255,255,255,0.08)" : "1px solid rgba(15,23,42,0.08)",
          boxShadow: isDark ? "0 14px 28px rgba(0,0,0,0.32)" : "0 12px 24px rgba(15,23,42,0.06)",
          display: "grid",
          gridTemplateColumns: "minmax(220px, 1.3fr) repeat(auto-fit, minmax(160px, 1fr))",
          gap: 12,
          alignItems: "center",
        }}
      >
        <input className="input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search keyword" />
        <div style={{ fontSize: 12, color: isDark ? "rgba(226,232,240,0.75)" : "rgba(15,23,42,0.65)" }}>
          {loading ? "Loading..." : `${sorted.length} user(s)`}
        </div>
      </div>

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
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14, minWidth: 980 }}>
              <thead>
                <tr>
                  <th style={headerCellStyle} onClick={() => handleSort("name")}>
                    {headerLabel("Name", sortKey === "name", sortDir)}
                  </th>
                  <th style={headerCellStyle} onClick={() => handleSort("email")}>
                    {headerLabel("Email", sortKey === "email", sortDir)}
                  </th>
                  <th style={headerCellStyle} onClick={() => handleSort("phone")}>
                    {headerLabel("Phone", sortKey === "phone", sortDir)}
                  </th>
                  <th style={headerCellStyle} onClick={() => handleSort("department")}>
                    {headerLabel("Department", sortKey === "department", sortDir)}
                  </th>
                  <th style={headerCellStyle} onClick={() => handleSort("status")}>
                    {headerLabel("Status", sortKey === "status", sortDir)}
                  </th>
                  <th style={{ ...headerCellStyle, cursor: "default" }}>MFA</th>
                  <th style={{ ...headerCellStyle, textAlign: "center", cursor: "default" }}>
                    {headerLabel("Action")}
                  </th>
                </tr>
              </thead>

              <tbody>
                {sorted.map((u, idx) => {
                  const rowId = getRowId(u);

                  const rowBg = isDark
                    ? idx % 2 === 0
                      ? "rgba(255,255,255,0.015)"
                      : "rgba(255,255,255,0.00)"
                    : idx % 2 === 0
                    ? "rgba(15,23,42,0.015)"
                    : "rgba(15,23,42,0.00)";

                  const hoverBg = isDark ? "rgba(255,255,255,0.05)" : "rgba(15,23,42,0.03)";

                  return (
                    <tr
                      key={rowId || `${idx}`}
                      style={{ background: rowBg, transition: "background 120ms ease", cursor: "pointer" }}
                      onMouseEnter={(e) => ((e.currentTarget as HTMLTableRowElement).style.background = hoverBg)}
                      onMouseLeave={(e) => ((e.currentTarget as HTMLTableRowElement).style.background = rowBg)}
                      onClick={() => openDrawer(rowId)}
                      title="View details"
                    >
                      <td style={cellStyle}>{u.name || "-"}</td>
                      <td style={cellStyle}>{u.email || "-"}</td>
                      <td style={cellStyle}>{u.phone || "-"}</td>
                      <td style={cellStyle}>{u.department || "-"}</td>
                      <td style={cellStyle}>{normalizeStatus(u.status)}</td>
                      <td style={cellStyle}>
                        <span
                          style={{
                            padding: "4px 10px",
                            borderRadius: 999,
                            fontSize: 11,
                            fontWeight: 600,
                            textTransform: "uppercase",
                            background: u.mfaEnabled ? "rgba(16,185,129,0.15)" : "rgba(148,163,184,0.2)",
                            color: u.mfaEnabled ? "#10b981" : isDark ? "#cbd5f5" : "#475569",
                          }}
                        >
                          {u.mfaEnabled ? "Enabled" : "Disabled"}
                        </span>
                      </td>
                      <td style={{ ...cellStyle, textAlign: "center" }}>
                        <div style={{ display: "flex", justifyContent: "center" }}>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              openDrawer(rowId);
                            }}
                            className="btn ghost"
                            style={{ padding: "8px 14px", borderRadius: 999, fontWeight: 500 }}
                          >
                            View
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {drawerOpen && selectedUser && (
        <div className="drawer-overlay" onClick={closeDrawer}>
          <div className="drawer-panel drawer-panel--sm" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
              <div>
                <div style={{ fontSize: 20, fontWeight: 900, color: isDark ? "#fff" : "#0f172a" }}>
                  {selectedUser.name || "Untitled User"}
                </div>
                <div style={{ opacity: 0.75, fontSize: 12, color: isDark ? "rgba(255,255,255,0.75)" : "#334155" }}>
                  {selectedUser.email || "No email"} · {(selectedUser.role || "No role").toString()}
                </div>
              </div>

              <button className="btn ghost" onClick={closeDrawer} style={{ height: 34, borderRadius: 999 }}>
                Close
              </button>
            </div>

            <div style={{ height: 14 }} />

            <UserDrawerContent
              user={selectedUser}
              isDark={isDark}
              deleting={deletingUid === getRowId(selectedUser)}
              onDelete={(id) => handleDelete(id)}
              onEdit={(id) => router.push(`/admin/users/${id}/edit`)}
              onResetMfa={(id) => handleResetMfa(id)}
              resettingMfa={resettingMfaUid === getRowId(selectedUser)}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function UserDrawerContent({
  user,
  isDark,
  deleting,
  onDelete,
  onEdit,
  onResetMfa,
  resettingMfa,
}: {
  user: UserRecord;
  isDark: boolean;
  deleting: boolean;
  onDelete: (uid: string) => void;
  onEdit: (uid: string) => void;
  onResetMfa: (uid: string) => void;
  resettingMfa: boolean;
}) {
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
    return isNaN(d.getTime()) ? "-" : d.toLocaleDateString("en-US");
  };

  const uid = getRowId(user);

  return (
    <>
      <Section title="Profile" isDark={isDark}>
        <Row label="Designation" value={safe(user.designation)} isDark={isDark} />
        <Row label="Role" value={safe(user.role)} isDark={isDark} />
        <Row label="Department" value={safe(user.department)} isDark={isDark} />
        <Row label="Joining Date" value={formatDate(user.joiningDate)} isDark={isDark} />
        <Row label="Status" value={safe(user.status)} isDark={isDark} />
      </Section>

      <div style={{ height: 12 }} />

      <Section title="Compensation" isDark={isDark}>
        <Row label="Monthly Salary (PKR)" value={formatPKR(user.salary)} isDark={isDark} />
        <Row label="Monthly Target (USD)" value={formatUSD(user.monthlyTarget)} isDark={isDark} />
        <Row
          label="Commission (%)"
          value={user.commission !== undefined && user.commission !== null && user.commission !== "" ? `${user.commission}%` : "-"}
          isDark={isDark}
        />
      </Section>

      <div style={{ height: 12 }} />

      <Section title="Identity" isDark={isDark}>
        <Row label="CNIC" value={safe(user.cnic)} isDark={isDark} />
        <Row label="Date of Birth" value={formatDate(user.dob)} isDark={isDark} />
      </Section>

      <div style={{ height: 12 }} />

      <Section title="System" isDark={isDark}>
        <Row label="Created At" value={formatDate(user.createdAt)} isDark={isDark} />
        <Row label="Updated At" value={formatDate(user.updatedAt)} isDark={isDark} />
        <Row label="User ID" value={uid || "-"} isDark={isDark} />
      </Section>

      <div style={{ height: 12 }} />

      <Section title="Security" isDark={isDark}>
        <Row label="MFA Status" value={user.mfaEnabled ? "Enabled" : "Disabled"} isDark={isDark} />
      </Section>

      <div style={{ height: 12 }} />

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <button
          type="button"
          className="btn"
          onClick={() => onResetMfa(uid)}
          disabled={resettingMfa}
          style={{
            borderRadius: 12,
            fontWeight: 500,
            background: "rgba(59,130,246,0.1)",
            border: "1px solid rgba(59,130,246,0.35)",
            opacity: resettingMfa ? 0.7 : 1,
          }}
        >
          {resettingMfa ? "Resetting MFA..." : "Reset MFA"}
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => onEdit(uid)}
          style={{ borderRadius: 12, fontWeight: 500 }}
        >
          Edit User
        </button>

        <button
          type="button"
          className="btn"
          onClick={() => onDelete(uid)}
          disabled={deleting}
          style={{
            borderRadius: 12,
            fontWeight: 500,
            background: "rgba(239,68,68,0.12)",
            border: "1px solid rgba(239,68,68,0.35)",
            opacity: deleting ? 0.7 : 1,
            cursor: deleting ? "not-allowed" : "pointer",
            color: isDark ? "rgba(255,255,255,0.92)" : "rgba(15,23,42,0.86)",
          }}
        >
          {deleting ? "Deleting..." : "Delete User"}
        </button>
      </div>
    </>
  );
}

function Section({
  title,
  children,
  isDark,
}: {
  title: string;
  children: React.ReactNode;
  isDark: boolean;
}) {
  return (
    <div
      className="card"
      style={{
        padding: 14,
        borderRadius: 14,
        background: isDark ? "rgba(255,255,255,0.02)" : "rgba(15,23,42,0.02)",
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: "0.06em", opacity: 0.75 }}>{title}</div>
      <div style={{ marginTop: 10, display: "grid", gap: 10 }}>{children}</div>
    </div>
  );
}

function Row({ label, value, isDark }: { label: string; value: string; isDark: boolean }) {
  return (
    <div
      style={{
        padding: 12,
        borderRadius: 12,
        border: isDark ? "1px solid rgba(255,255,255,0.10)" : "1px solid rgba(15,23,42,0.10)",
        display: "flex",
        justifyContent: "space-between",
        gap: 12,
      }}
    >
      <div style={{ fontSize: 11, opacity: 0.7, fontWeight: 500 }}>{label}</div>
      <div style={{ fontWeight: 500, textAlign: "right" }}>{value}</div>
    </div>
  );
}
