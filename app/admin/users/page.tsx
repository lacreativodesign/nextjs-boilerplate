"use client";

import { useEffect, useMemo, useState } from "react";

type UserRecord = {
  uid?: string;
  id?: string;

  name?: string;
  fullName?: string;
  displayName?: string;
  firstName?: string;
  lastName?: string;

  email?: string;
  phone?: string;

  role?: string;
  department?: string;

  designation?: string;
  status?: string;

  cnic?: string;
  dob?: string;

  monthlySalaryPkr?: number;
  monthlyTargetUsd?: number;
  commissionPct?: number;

  createdAt?: string | null;
  updatedAt?: string | null;
};

type SortKey = "name" | "email" | "phone" | "role" | "department" | "createdAt";
type SortDir = "asc" | "desc";

function fmtDate(iso?: string | null) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("en-US");
}

function pickName(u: UserRecord) {
  const direct =
    (u.name || "").trim() ||
    (u.fullName || "").trim() ||
    (u.displayName || "").trim();

  if (direct) return direct;

  const fn = (u.firstName || "").trim();
  const ln = (u.lastName || "").trim();
  const combined = `${fn} ${ln}`.trim();
  if (combined) return combined;

  const email = (u.email || "").trim();
  if (email && email.includes("@")) return email.split("@")[0];

  return "-";
}

function normalizeRole(v?: string) {
  return String(v || "").toLowerCase() || "-";
}

function normalizeDept(v?: string) {
  return String(v || "").toLowerCase() || "-";
}

/** OS-level only: uses prefers-color-scheme */
function useIsDarkOS() {
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
  const isDark = useIsDarkOS();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [users, setUsers] = useState<UserRecord[]>([]);

  const [sortKey, setSortKey] = useState<SortKey>("createdAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selected, setSelected] = useState<UserRecord | null>(null);

  // Key-Accounts style shell
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
  };

  const cellStyle: React.CSSProperties = {
    padding: "12px 14px",
    borderBottom: isDark ? "1px dashed rgba(148,163,184,0.22)" : "1px dashed rgba(15,23,42,0.10)",
    color: isDark ? "rgba(226,232,240,0.88)" : "rgba(15,23,42,0.85)",
    whiteSpace: "nowrap",
    fontWeight: 500, // 👈 table text regular (not bold)
  };

  // Stable sort badge (keeps header width stable)
  const sortBadge = (k: SortKey) => {
    if (k !== sortKey) return <span style={{ display: "inline-block", width: 18 }} />;
    return (
      <span style={{ display: "inline-block", width: 18, textAlign: "right" }}>
        {sortDir === "asc" ? "▲" : "▼"}
      </span>
    );
  };

  function toggleSort(k: SortKey) {
    if (k === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(k);
      setSortDir(k === "createdAt" ? "desc" : "asc");
    }
  }

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
            (typeof json === "object" && json && "error" in json && (json as any).error) ||
            res.statusText ||
            "Failed to load users";
          throw new Error(String(msg));
        }

        // ✅ Accept ALL common shapes:
        // 1) [ ...users ]
        // 2) { users: [...] }
        // 3) { ok: true, users: [...] }
        let list: any[] = [];
        if (Array.isArray(json)) list = json;
        else if (json && Array.isArray((json as any).users)) list = (json as any).users;
        else if (json && Array.isArray((json as any).data)) list = (json as any).data;

        if (!alive) return;
        setUsers(list as UserRecord[]);
      } catch (e: any) {
        if (!alive) return;
        setError(e?.message || "Forbidden");
        setUsers([]);
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

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users || [];

    return (users || []).filter((u) => {
      const hay = [
        pickName(u),
        u.email,
        u.phone,
        normalizeRole(u.role),
        normalizeDept(u.department),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return hay.includes(q);
    });
  }, [users, query]);

  const sorted = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;

    const getVal = (u: UserRecord) => {
      switch (sortKey) {
        case "name":
          return pickName(u).toLowerCase();
        case "email":
          return String(u.email || "").toLowerCase();
        case "phone":
          return String(u.phone || "").toLowerCase();
        case "role":
          return normalizeRole(u.role);
        case "department":
          return normalizeDept(u.department);
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

  function openDrawer(u: UserRecord) {
    setSelected(u);
    setDrawerOpen(true);
  }
  function closeDrawer() {
    setDrawerOpen(false);
    setSelected(null);
  }

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
        Manage internal team members, roles, departments, and access.
      </div>

      <div style={{ marginBottom: 16, maxWidth: 420, display: "flex", alignItems: "center", gap: 12 }}>
        <input className="input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search keyword" />
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
                  <th style={{ ...headerCellStyle, width: 220 }} onClick={() => toggleSort("name")}>
                    Name{sortBadge("name")}
                  </th>
                  <th style={{ ...headerCellStyle, width: 260 }} onClick={() => toggleSort("email")}>
                    Email{sortBadge("email")}
                  </th>
                  <th style={{ ...headerCellStyle, width: 160 }} onClick={() => toggleSort("phone")}>
                    Phone{sortBadge("phone")}
                  </th>
                  <th style={{ ...headerCellStyle, width: 140 }} onClick={() => toggleSort("role")}>
                    Role{sortBadge("role")}
                  </th>
                  <th style={{ ...headerCellStyle, width: 160 }} onClick={() => toggleSort("department")}>
                    Department{sortBadge("department")}
                  </th>
                  <th style={{ ...headerCellStyle, width: 140 }} onClick={() => toggleSort("createdAt")}>
                    Created{sortBadge("createdAt")}
                  </th>
                  <th style={{ ...headerCellStyle, textAlign: "right", cursor: "default", width: 120 }}>Action</th>
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
                    <tr key={(u.uid || u.id || `${u.email}-${idx}`) as string} style={{ background: rowBg, transition: "background 120ms ease" }}>
                      <td style={cellStyle}>{pickName(u)}</td>
                      <td style={cellStyle}>{u.email || "-"}</td>
                      <td style={cellStyle}>{u.phone || "-"}</td>
                      <td style={cellStyle}>{normalizeRole(u.role)}</td>
                      <td style={cellStyle}>{normalizeDept(u.department)}</td>
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

      {/* Drawer */}
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
                  {pickName(selected)}
                </div>
                <div style={{ opacity: 0.75, fontSize: 12, color: isDark ? "rgba(255,255,255,0.75)" : "#334155" }}>
                  {selected.email || "-"} · {normalizeRole(selected.role)}
                </div>
              </div>

              <button className="btn ghost" onClick={closeDrawer} style={{ height: 34, borderRadius: 999 }}>
                Close
              </button>
            </div>

            <div style={{ height: 14 }} />

            <Section title="Profile" isDark={isDark}>
              <Row label="Name" value={pickName(selected)} isDark={isDark} />
              <Row label="Email" value={selected.email || "-"} isDark={isDark} />
              <Row label="Phone" value={selected.phone || "-"} isDark={isDark} />
              <Row label="CNIC" value={selected.cnic || "-"} isDark={isDark} />
              <Row label="Date of Birth" value={selected.dob || "-"} isDark={isDark} />
              <Row label="Status" value={selected.status || "-"} isDark={isDark} />
            </Section>

            <div style={{ height: 12 }} />

            <Section title="Work" isDark={isDark}>
              <Row label="Designation" value={selected.designation || "-"} isDark={isDark} />
              <Row label="Department" value={normalizeDept(selected.department)} isDark={isDark} />
              <Row label="Role" value={normalizeRole(selected.role)} isDark={isDark} />
            </Section>

            <div style={{ height: 12 }} />

            <Section title="Targets & Pay" isDark={isDark}>
              <Row label="Monthly Salary (PKR)" value={String(selected.monthlySalaryPkr ?? "-")} isDark={isDark} />
              <Row label="Monthly Target (USD)" value={String(selected.monthlyTargetUsd ?? "-")} isDark={isDark} />
              <Row label="Commission (%)" value={String(selected.commissionPct ?? "-")} isDark={isDark} />
            </Section>

            <div style={{ height: 12 }} />

            <Section title="System" isDark={isDark}>
              <Row label="Created" value={fmtDate(selected.createdAt)} isDark={isDark} />
              <Row label="Updated" value={fmtDate(selected.updatedAt)} isDark={isDark} />
            </Section>

            <div style={{ height: 14 }} />

            <div style={{ display: "flex", gap: 10 }}>
              <a
                className="btn"
                style={{ flex: 1, borderRadius: 12, fontWeight: 800, textAlign: "center" }}
                href={`/admin/users/${encodeURIComponent(String(selected.uid || selected.id || ""))}/edit`}
              >
                Edit User
              </a>
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
                type="button"
                onClick={() => {
                  // keep your existing delete flow wherever it is wired
                  alert("Delete flow is handled in your existing module.");
                }}
              >
                Delete User
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
