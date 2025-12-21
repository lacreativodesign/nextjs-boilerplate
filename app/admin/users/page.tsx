"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type React from "react";

type UserRecord = {
  uid?: string;
  id?: string;
  docId?: string;
  userId?: string;
  firebaseUid?: string;

  name?: string;
  fullName?: string;
  displayName?: string;
  firstName?: string;
  lastName?: string;

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

type SortKey = "name" | "email" | "phone" | "role" | "department" | "createdAt";
type SortDir = "asc" | "desc";

const safeLower = (v: any) => String(v ?? "").toLowerCase();

/** IMPORTANT:
 *  - NEVER fallback to email as UID.
 *  - UID must be a Firestore doc id / real uid.
 */
const getRowUid = (u: any) =>
  (u?.uid || u?.id || u?.docId || u?.userId || u?.firebaseUid || "") as string;

function pickDisplayName(u: UserRecord) {
  const direct =
    u.name ||
    u.fullName ||
    u.displayName ||
    [u.firstName, u.lastName].filter(Boolean).join(" ").trim();

  if (direct) return direct;

  // Fallback for UI only (NOT for IDs)
  const email = u.email || "";
  if (email.includes("@")) return email.split("@")[0];
  return "-";
}

function fmtDate(iso?: string) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("en-US");
}

export default function UsersPage() {
  const router = useRouter();

  const [isDark, setIsDark] = useState(false);

  const [users, setUsers] = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>("");

  const [search, setSearch] = useState<string>("");

  const [sortKey, setSortKey] = useState<SortKey>("createdAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const [expandedUid, setExpandedUid] = useState<string | null>(null);

  // This is what the drawer displays (FULL record from /api/admin/users/[uid])
  const [drawerUser, setDrawerUser] = useState<UserRecord | null>(null);
  const [drawerLoading, setDrawerLoading] = useState(false);

  const [deletingUid, setDeletingUid] = useState<string | null>(null);

  const detailsAbortRef = useRef<AbortController | null>(null);

  // Follow OS theme
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setIsDark(!!mql.matches);
    onChange();
    // @ts-expect-error older browsers
    mql.addEventListener ? mql.addEventListener("change", onChange) : mql.addListener(onChange);
    return () => {
      // @ts-expect-error older browsers
      mql.removeEventListener ? mql.removeEventListener("change", onChange) : mql.removeListener(onChange);
    };
  }, []);

  // Load list
  useEffect(() => {
    let alive = true;

    async function loadUsers() {
      setLoading(true);
      setError("");

      try {
        const res = await fetch("/api/admin/users/list", {
          method: "GET",
          cache: "no-store",
          credentials: "include",
        });

        const json = await res.json().catch(() => ({}));

        if (!res.ok) throw new Error(json?.error || res.statusText || "Failed to load users");

        const data: UserRecord[] = Array.isArray(json?.users) ? json.users : Array.isArray(json) ? json : [];
        const normalized = (data || [])
          .map((u) => {
            const uid = getRowUid(u);
            return { ...u, uid };
          })
          .filter((u) => !!u.uid); // ONLY keep rows that have a real uid/docId

        if (!alive) return;
        setUsers(normalized);
      } catch (e: any) {
        if (!alive) return;
        setError(e?.message || "Failed to load users");
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

  // Search
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return users;

    return users.filter((u) => {
      const hay = [
        pickDisplayName(u),
        u.email,
        u.phone,
        u.role,
        u.department,
        fmtDate(u.createdAt),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return hay.includes(term);
    });
  }, [users, search]);

  // Sort
  const sorted = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    const arr = [...filtered];

    const getVal = (u: UserRecord) => {
      switch (sortKey) {
        case "name":
          return safeLower(pickDisplayName(u));
        case "email":
          return safeLower(u.email);
        case "phone":
          return safeLower(u.phone);
        case "role":
          return safeLower(u.role);
        case "department":
          return safeLower(u.department);
        case "createdAt": {
          const d = new Date(u.createdAt || "");
          return Number.isNaN(d.getTime()) ? 0 : d.getTime();
        }
        default:
          return "";
      }
    };

    arr.sort((a, b) => {
      const av: any = getVal(a);
      const bv: any = getVal(b);

      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    });

    return arr;
  }, [filtered, sortKey, sortDir]);

  function toggleSort(k: SortKey) {
    if (k === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(k);
      // createdAt default desc, rest asc
      setSortDir(k === "createdAt" ? "desc" : "asc");
    }
  }

  // Key-Accounts-style shell
  const tableShellStyle: React.CSSProperties = {
    borderRadius: 20,
    padding: 12,
    border: isDark ? "1px solid rgba(148,163,184,0.28)" : "1px solid rgba(15,23,42,0.10)",
    background: isDark ? "rgba(38,38,38,0.55)" : "rgba(255,255,255,0.85)",
    boxShadow: isDark ? "0 20px 60px rgba(0,0,0,0.55)" : "0 18px 55px rgba(15,23,42,0.10)",
    overflow: "hidden",
  };

  const headerCellStyle: React.CSSProperties = {
    padding: "12px 14px",
    fontSize: 11,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: isDark ? "rgba(226,232,240,0.70)" : "rgba(15,23,42,0.55)",
    borderBottom: isDark ? "1px solid rgba(148,163,184,0.25)" : "1px solid rgba(15,23,42,0.10)",
    cursor: "pointer",
    userSelect: "none",
    whiteSpace: "nowrap",
  };

  const cellStyle: React.CSSProperties = {
    padding: "12px 14px",
    borderBottom: isDark ? "1px dashed rgba(148,163,184,0.22)" : "1px dashed rgba(15,23,42,0.10)",
    color: isDark ? "rgba(226,232,240,0.88)" : "rgba(15,23,42,0.85)",
    whiteSpace: "nowrap",
    fontWeight: 500, // <-- regular font inside table (as you requested)
  };

  const SortArrow = ({ k }: { k: SortKey }) => {
    const active = k === sortKey;
    const arrow = sortDir === "asc" ? "▲" : "▼";
    return (
      <span
        style={{
          display: "inline-block",
          width: 14, // fixed so layout never shifts
          marginLeft: 6,
          opacity: active ? 1 : 0,
          transform: "translateY(-0.5px)",
        }}
      >
        {arrow}
      </span>
    );
  };

  // Open drawer: fetch FULL user record using your existing /api/admin/users/[uid]
  async function openDrawerFromRow(row: UserRecord) {
    const uid = getRowUid(row);
    if (!uid) return;

    setExpandedUid(uid);
    setDrawerUser(null);
    setDrawerLoading(true);

    try {
      if (detailsAbortRef.current) detailsAbortRef.current.abort();
      const controller = new AbortController();
      detailsAbortRef.current = controller;

      const res = await fetch(`/api/admin/users/${encodeURIComponent(uid)}`, {
        method: "GET",
        cache: "no-store",
        credentials: "include",
        signal: controller.signal,
      });

      if (!res.ok) {
        const t = await res.text().catch(() => "");
        throw new Error(t || "Failed to fetch user details");
      }

      const json = await res.json().catch(() => ({}));
      // Your route returns: { uid: requestedUid, ...data }
      const full: UserRecord = { ...json, uid: json?.uid || uid };

      setDrawerUser(full);
    } catch (e: any) {
      // Keep drawer open but show error state
      setDrawerUser({ uid, email: row.email, role: row.role, department: row.department, name: pickDisplayName(row) });
      setError(e?.message || "Failed to fetch user details");
    } finally {
      setDrawerLoading(false);
    }
  }

  function closeDrawer() {
    setExpandedUid(null);
    setDrawerUser(null);
    setDrawerLoading(false);
  }

  async function deleteUser(uid: string) {
    if (!uid) return;

    try {
      setDeletingUid(uid);

      const res = await fetch(`/api/admin/users/${encodeURIComponent(uid)}/delete`, {
        method: "DELETE",
        credentials: "include",
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Delete failed");

      setUsers((prev) => prev.filter((u) => getRowUid(u) !== uid));
      closeDrawer();
    } catch (e: any) {
      alert(e?.message || "Delete failed");
    } finally {
      setDeletingUid(null);
    }
  }

  // Rows
  const countText = loading ? "Loading..." : `${sorted.length} user(s)`;

  return (
    <div style={{ width: "100%" }}>
      <h1
        style={{
          fontSize: 34,
          fontWeight: 900,
          marginBottom: 8,
          color: isDark ? "rgba(255,255,255,0.95)" : "rgba(15,23,42,0.95)",
        }}
      >
        Users
      </h1>

      <div style={{ marginBottom: 18, color: isDark ? "rgba(255,255,255,0.75)" : "rgba(15,23,42,0.65)" }}>
        Manage team members, roles, departments and performance attributes — in one control panel.
      </div>

      {/* Search + Count + Add (Icon Only) */}
      <div style={{ marginBottom: 16, maxWidth: 520, display: "flex", alignItems: "center", gap: 12 }}>
        <input className="input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search keyword" />
        <div style={{ fontSize: 12, color: isDark ? "rgba(226,232,240,0.75)" : "rgba(15,23,42,0.65)" }}>{countText}</div>
        
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
                  <th style={headerCellStyle} onClick={() => toggleSort("name")}>
                    Name <SortArrow k="name" />
                  </th>
                  <th style={headerCellStyle} onClick={() => toggleSort("email")}>
                    Email <SortArrow k="email" />
                  </th>
                  <th style={headerCellStyle} onClick={() => toggleSort("phone")}>
                    Phone <SortArrow k="phone" />
                  </th>
                  <th style={headerCellStyle} onClick={() => toggleSort("role")}>
                    Role <SortArrow k="role" />
                  </th>
                  <th style={headerCellStyle} onClick={() => toggleSort("department")}>
                    Department <SortArrow k="department" />
                  </th>
                  <th style={headerCellStyle} onClick={() => toggleSort("createdAt")}>
                    Created <SortArrow k="createdAt" />
                  </th>
                  <th style={{ ...headerCellStyle, textAlign: "right", cursor: "default" }}>Action</th>
                </tr>
              </thead>

              <tbody>
                {sorted.map((u, idx) => {
                  const uid = getRowUid(u);
                  const rowBg = isDark
                    ? idx % 2 === 0
                      ? "rgba(255,255,255,0.02)"
                      : "rgba(255,255,255,0.00)"
                    : idx % 2 === 0
                    ? "rgba(15,23,42,0.015)"
                    : "rgba(15,23,42,0.00)";

                  return (
                    <tr key={uid} style={{ background: rowBg, transition: "background 120ms ease" }}>
                      <td style={cellStyle}>{pickDisplayName(u)}</td>
                      <td style={cellStyle}>{u.email || "-"}</td>
                      <td style={cellStyle}>{u.phone || "-"}</td>
                      <td style={cellStyle}>{u.role || "-"}</td>
                      <td style={cellStyle}>{u.department || "-"}</td>
                      <td style={cellStyle}>{fmtDate(u.createdAt)}</td>
                      <td style={{ ...cellStyle, textAlign: "right" }}>
                        <button
                          onClick={() => openDrawerFromRow(u)}
                          className="btn ghost"
                          style={{ padding: "8px 14px", borderRadius: 999, fontWeight: 800 }}
                        >
                          View
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

      {/* Drawer (Key-Accounts master style) */}
      {expandedUid && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 50,
            background: isDark ? "rgba(0,0,0,0.55)" : "rgba(15,23,42,0.35)",
            backdropFilter: "blur(6px)",
            WebkitBackdropFilter: "blur(6px)",
          }}
          onClick={closeDrawer}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "absolute",
              top: 0,
              right: 0,
              width: "min(460px, 92vw)",
              height: "100%",
              padding: 18,
              background: isDark ? "rgba(18,18,18,0.96)" : "rgba(255,255,255,0.96)",
              borderLeft: isDark ? "1px solid rgba(255,255,255,0.10)" : "1px solid rgba(15,23,42,0.10)",
              overflowY: "auto",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
              <div>
                <div style={{ fontSize: 20, fontWeight: 900, color: isDark ? "#fff" : "#0f172a" }}>
                  {drawerUser ? pickDisplayName(drawerUser) : "User"}
                </div>
                <div style={{ opacity: 0.75, fontSize: 12, color: isDark ? "rgba(255,255,255,0.75)" : "#334155" }}>
                  {drawerUser?.email || "-"} · {drawerUser?.role || "-"}
                </div>
              </div>

              <button className="btn ghost" onClick={closeDrawer} style={{ height: 34, borderRadius: 999 }}>
                Close
              </button>
            </div>

            <div style={{ height: 14 }} />

            {drawerLoading ? (
              <div style={{ fontSize: 14, color: isDark ? "rgba(255,255,255,0.80)" : "rgba(15,23,42,0.70)" }}>
                Loading user details...
              </div>
            ) : (
              <>
                <Section title="Profile" isDark={isDark}>
                  <Row label="Name" value={drawerUser ? pickDisplayName(drawerUser) : "-"} isDark={isDark} />
                  <Row label="Email" value={drawerUser?.email || "-"} isDark={isDark} />
                  <Row label="Phone" value={drawerUser?.phone || "-"} isDark={isDark} />
                  <Row label="CNIC" value={drawerUser?.cnic || "-"} isDark={isDark} />
                  <Row label="Date of Birth" value={fmtDate(drawerUser?.dob)} isDark={isDark} />
                  <Row label="Status" value={drawerUser?.status || "-"} isDark={isDark} />
                </Section>

                <div style={{ height: 12 }} />

                <Section title="Work" isDark={isDark}>
                  <Row label="Designation" value={drawerUser?.designation || "-"} isDark={isDark} />
                  <Row label="Department" value={drawerUser?.department || "-"} isDark={isDark} />
                  <Row label="Role" value={drawerUser?.role || "-"} isDark={isDark} />
                  <Row label="Joining Date" value={fmtDate(drawerUser?.joiningDate)} isDark={isDark} />
                </Section>

                <div style={{ height: 12 }} />

                <Section title="Targets & Pay" isDark={isDark}>
                  <Row label="Monthly Salary (PKR)" value={String(drawerUser?.salary ?? "-")} isDark={isDark} />
                  <Row label="Monthly Target (USD)" value={String(drawerUser?.monthlyTarget ?? "-")} isDark={isDark} />
                  <Row label="Commission (%)" value={String(drawerUser?.commission ?? "-")} isDark={isDark} />
                </Section>

                <div style={{ height: 12 }} />

                <Section title="System" isDark={isDark}>
                  <Row label="Created" value={fmtDate(drawerUser?.createdAt)} isDark={isDark} />
                  <Row label="Updated" value={fmtDate(drawerUser?.updatedAt)} isDark={isDark} />
                </Section>

                <div style={{ height: 14 }} />

                {/* Actions */}
                <div style={{ display: "flex", gap: 10 }}>
                  <button
                    className="btn"
                    style={{ flex: 1, borderRadius: 12, fontWeight: 900 }}
                    onClick={() => {
                      // This will now work because expandedUid is guaranteed to be a real uid/docId
                      router.push(`/admin/users/${encodeURIComponent(expandedUid)}/edit`);
                    }}
                  >
                    Edit User
                  </button>

                  <button
                    className="btn"
                    style={{
                      flex: 1,
                      borderRadius: 12,
                      fontWeight: 900,
                      background: "rgba(239,68,68,0.12)",
                      border: "1px solid rgba(239,68,68,0.35)",
                      color: isDark ? "rgba(255,255,255,0.92)" : "rgba(15,23,42,0.86)",
                      opacity: deletingUid === expandedUid ? 0.7 : 1,
                    }}
                    disabled={deletingUid === expandedUid}
                    onClick={() => deleteUser(expandedUid)}
                  >
                    {deletingUid === expandedUid ? "Deleting..." : "Delete User"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
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
      <div style={{ fontSize: 11, opacity: 0.7, fontWeight: 900 }}>{label}</div>
      <div style={{ fontWeight: 800, textAlign: "right" }}>{value}</div>
    </div>
  );
}
