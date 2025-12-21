"use client";

import { useEffect, useMemo, useState } from "react";
import type React from "react";

type UserRole =
  | "super_admin"
  | "admin"
  | "sales_manager"
  | "sales"
  | "account_manager"
  | "production"
  | "hr"
  | "finance"
  | "client";

type UserRecord = {
  id: string;
  name?: string;
  email?: string;
  role?: UserRole | string;

  designation?: string;
  department?: string;
  joiningDate?: string;

  monthlySalaryPkr?: number;
  monthlyTargetUsd?: number;
  commissionPct?: number;

  status?: string;
  cnic?: string;
  dateOfBirth?: string;

  createdAt?: string | null;
  updatedAt?: string | null;
};

type SortKey =
  | "name"
  | "email"
  | "role"
  | "designation"
  | "department"
  | "joiningDate"
  | "monthlySalaryPkr"
  | "monthlyTargetUsd"
  | "commissionPct"
  | "status"
  | "createdAt";

type SortDir = "asc" | "desc";

function fmtDate(v?: string | null) {
  if (!v) return "-";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("en-US");
}

function fmtNum(v: any) {
  const n = Number(v);
  if (Number.isNaN(n)) return "-";
  return n.toLocaleString("en-US");
}

export default function UsersPage() {
  const [isDark, setIsDark] = useState(false);

  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("createdAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);

  // Stop page-level horizontal scroll
  useEffect(() => {
    const prev = document.body.style.overflowX;
    document.body.style.overflowX = "hidden";
    return () => {
      document.body.style.overflowX = prev;
    };
  }, []);

  // Theme: follow OS/browser
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

  // Dummy data (replace with API later)
  const users: UserRecord[] = useMemo(
    () => [
      {
        id: "u_001",
        name: "Untitled User",
        email: "support@lacreativo.com",
        role: "admin",
        designation: "-",
        department: "-",
        joiningDate: "-",
        monthlySalaryPkr: undefined,
        monthlyTargetUsd: undefined,
        commissionPct: undefined,
        status: "-",
        cnic: "-",
        dateOfBirth: "-",
        createdAt: "2025-11-16",
        updatedAt: null,
      },
    ],
    []
  );

  const filtered = useMemo(() => {
    if (!search.trim()) return users;
    const term = search.trim().toLowerCase();

    return users.filter((u) => {
      const hay = [
        u.name,
        u.email,
        u.role,
        u.designation,
        u.department,
        u.status,
        u.cnic,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return hay.includes(term);
    });
  }, [users, search]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((p) => (p === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const sorted = useMemo(() => {
    const getVal = (u: UserRecord, key: SortKey) => {
      switch (key) {
        case "name":
          return (u.name || "").toLowerCase();
        case "email":
          return (u.email || "").toLowerCase();
        case "role":
          return (u.role || "").toLowerCase();
        case "designation":
          return (u.designation || "").toLowerCase();
        case "department":
          return (u.department || "").toLowerCase();
        case "joiningDate":
          return u.joiningDate || "";
        case "monthlySalaryPkr":
          return Number(u.monthlySalaryPkr || 0);
        case "monthlyTargetUsd":
          return Number(u.monthlyTargetUsd || 0);
        case "commissionPct":
          return Number(u.commissionPct || 0);
        case "status":
          return (u.status || "").toLowerCase();
        case "createdAt":
          return u.createdAt || "";
        default:
          return "";
      }
    };

    return [...filtered].sort((a, b) => {
      const av: any = getVal(a, sortKey);
      const bv: any = getVal(b, sortKey);

      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
  }, [filtered, sortKey, sortDir]);

  const activeUser = useMemo(
    () => (expandedId ? users.find((u) => u.id === expandedId) || null : null),
    [expandedId, users]
  );

  const toggleDrawer = (id: string) => setExpandedId((p) => (p === id ? null : id));

  const lightShell = "#F8FAFC";
  const darkShell = "rgba(255,255,255,0.055)";

  const tableShellStyle: React.CSSProperties = {
    borderRadius: 20,
    background: isDark ? darkShell : lightShell,
    border: isDark ? "1px solid rgba(255,255,255,0.08)" : "1px solid rgba(15,23,42,0.08)",
    padding: 16,
    boxShadow: isDark ? "0 18px 55px rgba(0,0,0,0.55)" : "0 14px 40px rgba(15,23,42,0.06)",
    maxWidth: "100%",
    overflow: "hidden",
  };

  const headerCellStyle: React.CSSProperties = {
    padding: "10px 12px",
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.08,
    color: isDark ? "rgba(255,255,255,0.80)" : "rgba(15,23,42,0.70)",
    fontWeight: 800,
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
    fontWeight: 400, // keep table values regular (not bold)
  };

  // Drawer styling (MASTER: Key Accounts standard)
  const drawerPanelStyle: React.CSSProperties = {
    position: "absolute",
    top: 0,
    right: 0,
    width: "min(460px, 92vw)",
    height: "100%",
    padding: 18,
    background: isDark ? "rgba(18,18,18,0.96)" : "rgba(255,255,255,0.96)",
    borderLeft: isDark ? "1px solid rgba(255,255,255,0.10)" : "1px solid rgba(15,23,42,0.10)",
    overflowY: "auto",
    animation: "slideInDrawer 220ms ease-out",
  };

  return (
    <div style={{ width: "100%", maxWidth: "100%", overflowX: "hidden" }}>
      <h2 style={{ fontSize: 26, fontWeight: 800, marginBottom: 10 }}>All Users</h2>
      <p style={{ fontSize: 14, color: "var(--mut, #94A3B8)", marginBottom: 16 }}>
        Manage your team members, roles, targets, and operational access.
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
        <div style={{ width: "100%", overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14, minWidth: 980 }}>
            <thead>
              <tr>
                <th style={headerCellStyle} onClick={() => handleSort("name")}>
                  Name {sortKey === "name" ? (sortDir === "asc" ? "▲" : "▼") : ""}
                </th>
                <th style={headerCellStyle} onClick={() => handleSort("email")}>
                  Email {sortKey === "email" ? (sortDir === "asc" ? "▲" : "▼") : ""}
                </th>
                <th style={headerCellStyle} onClick={() => handleSort("role")}>
                  Role {sortKey === "role" ? (sortDir === "asc" ? "▲" : "▼") : ""}
                </th>
                <th style={headerCellStyle} onClick={() => handleSort("department")}>
                  Department {sortKey === "department" ? (sortDir === "asc" ? "▲" : "▼") : ""}
                </th>
                <th style={headerCellStyle} onClick={() => handleSort("createdAt")}>
                  Created {sortKey === "createdAt" ? (sortDir === "asc" ? "▲" : "▼") : ""}
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
                    <td style={bodyCellStyle}>{u.name || "-"}</td>
                    <td style={bodyCellStyle}>{u.email || "-"}</td>
                    <td style={bodyCellStyle}>{u.role || "-"}</td>
                    <td style={bodyCellStyle}>{u.department || "-"}</td>
                    <td style={bodyCellStyle}>{fmtDate(u.createdAt)}</td>
                    <td style={{ ...bodyCellStyle, textAlign: "right" }}>
                      <button
                        type="button"
                        onClick={() => toggleDrawer(u.id)}
                        className="btn ghost"
                        style={{
                          padding: "8px 14px",
                          borderRadius: 999,
                          fontSize: 13,
                          fontWeight: 800,
                        }}
                      >
                        {expandedId === u.id ? "Close" : "View"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Drawer (MASTER: Key Accounts standard) */}
      {activeUser && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 50,
            background: isDark ? "rgba(0,0,0,0.55)" : "rgba(15,23,42,0.35)",
            backdropFilter: "blur(6px)",
            WebkitBackdropFilter: "blur(6px)",
          }}
          onClick={() => setExpandedId(null)}
        >
          <div onClick={(e) => e.stopPropagation()} style={drawerPanelStyle}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
              <div>
                <div style={{ fontSize: 20, fontWeight: 900, color: isDark ? "#fff" : "#0f172a" }}>
                  {activeUser.name || "Untitled User"}
                </div>
                <div
                  style={{
                    opacity: 0.75,
                    fontSize: 12,
                    color: isDark ? "rgba(255,255,255,0.75)" : "#334155",
                    marginTop: 2,
                  }}
                >
                  {activeUser.email || "-"} · {activeUser.role || "-"}
                </div>
              </div>

              <button
                className="btn ghost"
                onClick={() => setExpandedId(null)}
                style={{ height: 34, borderRadius: 999 }}
              >
                Close
              </button>
            </div>

            <div style={{ height: 14 }} />

            <UserDrawerContent user={activeUser} isDark={isDark} />

            <div style={{ height: 14 }} />

            {/* Drawer Actions */}
            <div
              style={{
                position: "sticky",
                bottom: 0,
                background: isDark ? "rgba(18,18,18,0.96)" : "rgba(255,255,255,0.96)",
                paddingTop: 12,
                borderTop: isDark ? "1px solid rgba(255,255,255,0.10)" : "1px solid rgba(15,23,42,0.10)",
                display: "flex",
                gap: 10,
              }}
            >
              <button
                className="btn"
                onClick={() => setIsEditOpen(true)}
                style={{ flex: 1, borderRadius: 12, fontWeight: 800 }}
              >
                Edit User
              </button>

              <button
                className="btn"
                onClick={() => setIsDeleteOpen(true)}
                style={{
                  flex: 1,
                  borderRadius: 12,
                  fontWeight: 800,
                  background: "rgba(239,68,68,0.12)",
                  border: "1px solid rgba(239,68,68,0.35)",
                  color: isDark ? "rgba(255,255,255,0.92)" : "rgba(15,23,42,0.86)",
                }}
              >
                Delete User
              </button>
            </div>

            <style jsx global>{`
              @keyframes slideInDrawer {
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
          </div>
        </div>
      )}

      {/* Edit Modal (existing logic in your file/project) */}
      {isEditOpen ? null : null}

      {/* Delete Modal (existing logic in your file/project) */}
      {isDeleteOpen ? null : null}
    </div>
  );
}

function UserDrawerContent({ user, isDark }: { user: UserRecord; isDark: boolean }) {
  const sectionCard: React.CSSProperties = {
    padding: 14,
    borderRadius: 14,
    border: isDark ? "1px solid rgba(255,255,255,0.10)" : "1px solid rgba(15,23,42,0.10)",
    background: isDark ? "rgba(255,255,255,0.02)" : "rgba(15,23,42,0.02)",
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 11,
    opacity: 0.7,
    fontWeight: 900,
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    color: isDark ? "rgba(255,255,255,0.75)" : "rgba(15,23,42,0.70)",
  };

  const valueStyle: React.CSSProperties = {
    fontWeight: 800,
    textAlign: "right",
    color: isDark ? "rgba(255,255,255,0.92)" : "rgba(15,23,42,0.88)",
  };

  const rowStyle: React.CSSProperties = {
    padding: 12,
    borderRadius: 12,
    border: isDark ? "1px solid rgba(255,255,255,0.10)" : "1px solid rgba(15,23,42,0.10)",
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
  };

  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div style={sectionCard}>
      <div style={labelStyle}>{title}</div>
      <div style={{ marginTop: 10, display: "grid", gap: 10 }}>{children}</div>
    </div>
  );

  const Row = ({ label, value }: { label: string; value: string }) => (
    <div style={rowStyle}>
      <div style={labelStyle}>{label}</div>
      <div style={valueStyle}>{value}</div>
    </div>
  );

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <Section title="Identity">
        <Row label="Designation" value={user.designation || "-"} />
        <Row label="Role" value={String(user.role || "-")} />
        <Row label="Department" value={user.department || "-"} />
      </Section>

      <Section title="Employment">
        <Row label="Joining Date" value={user.joiningDate || "-"} />
        <Row label="Monthly Salary (PKR)" value={user.monthlySalaryPkr ? fmtNum(user.monthlySalaryPkr) : "-"} />
        <Row label="Monthly Target (USD $)" value={user.monthlyTargetUsd ? fmtNum(user.monthlyTargetUsd) : "-"} />
        <Row label="Commission (%)" value={user.commissionPct ? fmtNum(user.commissionPct) : "-"} />
        <Row label="Status" value={user.status || "-"} />
      </Section>

      <Section title="Compliance">
        <Row label="CNIC" value={user.cnic || "-"} />
        <Row label="Date of Birth" value={user.dateOfBirth || "-"} />
      </Section>

      <Section title="System">
        <Row label="Created At" value={fmtDate(user.createdAt)} />
        <Row label="Updated At" value={fmtDate(user.updatedAt)} />
      </Section>
    </div>
  );
}
