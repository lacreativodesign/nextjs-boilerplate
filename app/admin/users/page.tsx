"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type SortKey = "name" | "email" | "phone" | "role" | "department" | "createdAt";
type SortDir = "asc" | "desc";

type UserRecord = {
  id: string;
  fullName?: string;
  email?: string;
  phone?: string;
  role?: string;
  department?: string;
  designation?: string;

  joiningDate?: string | null;
  monthlySalaryPkr?: number | null;
  monthlyTargetUsd?: number | null;
  commissionPercent?: number | null;

  status?: string;
  cnic?: string;
  dateOfBirth?: string | null;

  createdAt?: string | null;
  updatedAt?: string | null;
};

function fmtDate(iso?: string | null) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("en-US");
}

function safeText(v: any) {
  const s = String(v ?? "").trim();
  return s ? s : "-";
}

function useOsDarkModeOnly() {
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

export default function AdminUsersPage() {
  const router = useRouter();
  const isDark = useOsDarkModeOnly();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<UserRecord[]>([]);

  const [sortKey, setSortKey] = useState<SortKey>("createdAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selected, setSelected] = useState<UserRecord | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Stop page-level horizontal scroll (prevents sidebar/layout weirdness)
  useEffect(() => {
    const prev = document.body.style.overflowX;
    document.body.style.overflowX = "hidden";
    return () => {
      document.body.style.overflowX = prev;
    };
  }, []);

  // Load users
  useEffect(() => {
    let alive = true;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const res = await fetch("/api/admin/users/list", {
          method: "GET",
          cache: "no-store",
          credentials: "include",
        });

        const json = await res.json().catch(() => null);

        if (!res.ok) {
          const msg =
            (json && (json.error || json.message)) ||
            res.statusText ||
            "Failed to load users";
          throw new Error(msg);
        }

        const list: UserRecord[] = Array.isArray(json) ? json : Array.isArray(json?.users) ? json.users : [];
        if (!alive) return;

        setRows(list);
      } catch (e: any) {
        if (!alive) return;
        setError(e?.message || "Forbidden");
        setRows([]);
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    }

    load();
    return () => {
      alive = false;
    };
  }, []);

  // Filter
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows || [];

    return (rows || []).filter((u) => {
      const hay = [
        u.fullName,
        u.email,
        u.phone,
        u.role,
        u.department,
        u.designation,
        u.status,
        u.cnic,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return hay.includes(q);
    });
  }, [rows, query]);

  // Sort
  const sorted = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;

    const getVal = (u: UserRecord) => {
      switch (sortKey) {
        case "name":
          return (u.fullName || "").toLowerCase();
        case "email":
          return (u.email || "").toLowerCase();
        case "phone":
          return (u.phone || "").toLowerCase();
        case "role":
          return (u.role || "").toLowerCase();
        case "department":
          return (u.department || "").toLowerCase();
        case "createdAt":
          return u.createdAt || "";
        default:
          return "";
      }
    };

    const arr = [...(filtered || [])];
    arr.sort((a, b) => String(getVal(a)).localeCompare(String(getVal(b))) * dir);
    return arr;
  }, [filtered, sortKey, sortDir]);

  function toggleSort(k: SortKey) {
    if (k === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(k);
      setSortDir(k === "createdAt" ? "desc" : "asc");
    }
  }

  const sortBadge = (k: SortKey) => (k !== sortKey ? "" : sortDir === "asc" ? " ▲" : " ▼");

  function openDrawer(u: UserRecord) {
    setSelected(u);
    setDrawerOpen(true);
  }

  function closeDrawer() {
    setDrawerOpen(false);
    setSelected(null);
  }

  async function handleDeleteUser(uid: string) {
    if (!uid) return;
    const ok = window.confirm("Delete this user? This cannot be undone.");
    if (!ok) return;

    try {
      setDeletingId(uid);

      const res = await fetch(`/api/admin/users/${uid}`, {
        method: "DELETE",
        credentials: "include",
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || res.statusText || "Failed to delete user");
      }

      setRows((prev) => (prev || []).filter((u) => u.id !== uid));
      if (selected?.id === uid) closeDrawer();
    } catch (e: any) {
      alert(e?.message || "Failed to delete user");
    } finally {
      setDeletingId(null);
    }
  }

  // ====== KEY-ACCOUNTS MASTER STYLES (TABLE + DRAWER) ======
  const tableShellStyle: React.CSSProperties = {
    borderRadius: 20,
    padding: 12,
    border: isDark ? "1px solid rgba(148,163,184,0.28)" : "1px solid rgba(15,23,42,0.10)",
    background: isDark ? "rgba(38,38,38,0.55)" : "rgba(255,255,255,0.85)",
    boxShadow: isDark ? "0 20px 60px rgba(0,0,0,0.55)" : "0 18px 55px rgba(15,23,42,0.10)",
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
    fontWeight: 800,
  };

  const cellStyle: React.CSSProperties = {
    padding: "12px 14px",
    borderBottom: isDark ? "1px dashed rgba(148,163,184,0.22)" : "1px dashed rgba(15,23,42,0.10)",
    color: isDark ? "rgba(226,232,240,0.88)" : "rgba(15,23,42,0.85)",
    whiteSpace: "nowrap",
    fontWeight: 500, // IMPORTANT: regular-ish (not bold) for table content
  };

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

      <div style={{ marginBottom: 16, maxWidth: 520, display: "flex", alignItems: "center", gap: 12 }}>
        <input
          className="input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search keyword"
        />

        <div style={{ fontSize: 12, color: isDark ? "rgba(226,232,240,0.75)" : "rgba(15,23,42,0.65)" }}>
          {loading ? "Loading..." : `${sorted.length} user(s)`}
        </div>

        <div style={{ marginLeft: "auto", display: "flex", gap: 10 }}>
          <button className="btn" onClick={() => router.push("/admin/users/create")} style={{ borderRadius: 12, fontWeight: 800 }}>
            Add User
          </button>
        </div>
      </div>

      <div style={tableShellStyle}>
        {loading ? (
          <p style={{ fontSize: 14, color: isDark ? "rgba(255,255,255,0.85)" : "rgba(15,23,42,0.70)" }}>
            Loading users...
          </p>
        ) : error ? (
          <p style={{ fontSize: 14, color: "#FCA5A5" }}>
            {error}
          </p>
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
                    Name{sortBadge("name")}
                  </th>
                  <th style={headerCellStyle} onClick={() => toggleSort("email")}>
                    Email{sortBadge("email")}
                  </th>
                  <th style={headerCellStyle} onClick={() => toggleSort("phone")}>
                    Phone{sortBadge("phone")}
                  </th>
                  <th style={headerCellStyle} onClick={() => toggleSort("role")}>
                    Role{sortBadge("role")}
                  </th>
                  <th style={headerCellStyle} onClick={() => toggleSort("department")}>
                    Department{sortBadge("department")}
                  </th>
                  <th style={headerCellStyle} onClick={() => toggleSort("createdAt")}>
                    Created{sortBadge("createdAt")}
                  </th>
                  <th style={{ ...headerCellStyle, textAlign: "right", cursor: "default" }}>Action</th>
                </tr>
              </thead>

              <tbody>
                {sorted.map((u, idx) => {
                  const rowBg = isDark
                    ? idx % 2 === 0
                      ? "rgba(255,255,255,0.02)"
                      : "rgba(255,255,255,0.00)"
                    : idx % 2 === 0
                      ? "rgba(15,23,42,0.015)"
                      : "rgba(15,23,42,0.00)";

                  return (
                    <tr key={u.id} style={{ background: rowBg, transition: "background 120ms ease" }}>
                      <td style={cellStyle}>{safeText(u.fullName)}</td>
                      <td style={cellStyle}>{safeText(u.email)}</td>
                      <td style={cellStyle}>{safeText(u.phone)}</td>
                      <td style={cellStyle}>{safeText(u.role)}</td>
                      <td style={cellStyle}>{safeText(u.department)}</td>
                      <td style={cellStyle}>{fmtDate(u.createdAt)}</td>
                      <td style={{ ...cellStyle, textAlign: "right" }}>
                        <button
                          onClick={() => openDrawer(u)}
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

      {/* ====== KEY-ACCOUNTS MASTER DRAWER ====== */}
      {drawerOpen && selected && (
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
                  {safeText(selected.fullName)}
                </div>
                <div style={{ opacity: 0.75, fontSize: 12, color: isDark ? "rgba(255,255,255,0.75)" : "#334155" }}>
                  {safeText(selected.email)} · {safeText(selected.role)}
                </div>
              </div>

              <button className="btn ghost" onClick={closeDrawer} style={{ height: 34, borderRadius: 999 }}>
                Close
              </button>
            </div>

            <div style={{ height: 14 }} />

            <Section title="Profile" isDark={isDark}>
              <Row label="Name" value={safeText(selected.fullName)} isDark={isDark} />
              <Row label="Email" value={safeText(selected.email)} isDark={isDark} />
              <Row label="Phone" value={safeText(selected.phone)} isDark={isDark} />
              <Row label="CNIC" value={safeText(selected.cnic)} isDark={isDark} />
              <Row label="Date of Birth" value={fmtDate(selected.dateOfBirth)} isDark={isDark} />
              <Row label="Status" value={safeText(selected.status)} isDark={isDark} />
            </Section>

            <div style={{ height: 12 }} />

            <Section title="Work" isDark={isDark}>
              <Row label="Designation" value={safeText(selected.designation)} isDark={isDark} />
              <Row label="Department" value={safeText(selected.department)} isDark={isDark} />
              <Row label="Role" value={safeText(selected.role)} isDark={isDark} />
              <Row label="Joining Date" value={fmtDate(selected.joiningDate)} isDark={isDark} />
            </Section>

            <div style={{ height: 12 }} />

            <Section title="Targets & Pay" isDark={isDark}>
              <Row
                label="Monthly Salary (PKR)"
                value={selected.monthlySalaryPkr != null ? String(selected.monthlySalaryPkr) : "-"}
                isDark={isDark}
              />
              <Row
                label="Monthly Target (USD)"
                value={selected.monthlyTargetUsd != null ? String(selected.monthlyTargetUsd) : "-"}
                isDark={isDark}
              />
              <Row
                label="Commission (%)"
                value={selected.commissionPercent != null ? String(selected.commissionPercent) : "-"}
                isDark={isDark}
              />
            </Section>

            <div style={{ height: 12 }} />

            <Section title="System" isDark={isDark}>
              <Row label="Created" value={fmtDate(selected.createdAt)} isDark={isDark} />
              <Row label="Updated" value={fmtDate(selected.updatedAt)} isDark={isDark} />
            </Section>

            <div style={{ height: 16 }} />

            {/* Drawer actions */}
            <div style={{ display: "flex", gap: 10 }}>
              <button
                className="btn"
                style={{ flex: 1, borderRadius: 12, fontWeight: 800 }}
                onClick={() => router.push(`/admin/users/${selected.id}/edit`)}
              >
                Edit User
              </button>

              <button
                className="btn"
                style={{
                  flex: 1,
                  borderRadius: 12,
                  fontWeight: 800,
                  background: "rgba(239,68,68,0.12)",
                  border: "1px solid rgba(239,68,68,0.35)",
                  color: isDark ? "rgba(255,255,255,0.92)" : "rgba(15,23,42,0.86)",
                }}
                onClick={() => handleDeleteUser(selected.id)}
                disabled={deletingId === selected.id}
                title={deletingId === selected.id ? "Deleting..." : "Delete user"}
              >
                {deletingId === selected.id ? "Deleting..." : "Delete User"}
              </button>
            </div>
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
