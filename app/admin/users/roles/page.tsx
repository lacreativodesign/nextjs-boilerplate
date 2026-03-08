"use client";

import { useEffect, useMemo, useState } from "react";

/* -----------------------------
   ROLE DEFINITIONS (HIERARCHY)
------------------------------*/

type RoleLevel = "top" | "head" | "team";

type RoleMeta = {
  id: string;
  label: string;
  level: RoleLevel;
  description: string;
  accent: string;
};

const ROLE_DEFINITIONS: RoleMeta[] = [
  // LEVEL 1 — TOP LEADERSHIP
  {
    id: "super_admin",
    label: "Super Admin",
    level: "top",
    description: "Full control over the entire ERP system.",
    accent: "#2563eb",
  },
  {
    id: "admin",
    label: "Admin",
    level: "top",
    description: "Manages departments, users and core operations.",
    accent: "#1d4ed8",
  },

  // LEVEL 2 — DEPARTMENT HEADS
  {
    id: "sales_manager",
    label: "Sales Manager",
    level: "head",
    description: "Leads sales team & pipeline.",
    accent: "#7c3aed",
  },
  {
    id: "production_manager",
    label: "Production Manager",
    level: "head",
    description: "Oversees production workload and approvals.",
    accent: "#6d28d9",
  },
  {
    id: "am_manager",
    label: "AM Manager",
    level: "head",
    description: "Guides account health and client escalations.",
    accent: "#8b5cf6",
  },
  {
    id: "am",
    label: "Account Manager",
    level: "head",
    description: "Manages client relationships & delivery.",
    accent: "#8b5cf6",
  },
  {
    id: "hr",
    label: "HR",
    level: "head",
    description: "Oversees attendance, staff and HR operations.",
    accent: "#6d28d9",
  },
  {
    id: "finance",
    label: "Finance",
    level: "head",
    description: "Handles invoices, payments & financial reporting.",
    accent: "#5b21b6",
  },
  {
    id: "production",
    label: "Production",
    level: "head",
    description: "Manages the production team and workflow.",
    accent: "#4c1d95",
  },

  // LEVEL 3 — TEAM ROLES
  {
    id: "sales",
    label: "Sales",
    level: "team",
    description: "Carries out outreach, follow-ups and closing.",
    accent: "#4b5563",
  },
  {
    id: "client",
    label: "Client",
    level: "team",
    description: "External client login with restricted access.",
    accent: "#374151",
  },
];

/* -----------------------------
   PAGE COMPONENT
------------------------------*/

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

export default function UserRolesPage() {
  const isDark = useIsSystemDark();
  const [users, setUsers] = useState<{ role: string }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/admin/users/list");
        const data = await res.json();
        setUsers(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error("Failed to load users:", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const counts = useMemo(() => {
    const tally: Record<string, number> = {};
    ROLE_DEFINITIONS.forEach((r) => (tally[r.id] = 0));

    users.forEach((u) => {
      const role = (u.role || "").toLowerCase();
      if (tally[role] !== undefined) tally[role] += 1;
    });

    return tally;
  }, [users]);

  const top = ROLE_DEFINITIONS.filter((r) => r.level === "top");
  const heads = ROLE_DEFINITIONS.filter((r) => r.level === "head");
  const teams = ROLE_DEFINITIONS.filter((r) => r.level === "team");

  const headerStyle: React.CSSProperties = {
    fontSize: 34,
    fontWeight: 900,
    margin: "0 0 8px 0",
    color: isDark ? "rgba(255,255,255,0.95)" : "rgba(15,23,42,0.95)",
  };

  const subStyle: React.CSSProperties = {
    margin: "0 0 18px 0",
    color: isDark ? "rgba(255,255,255,0.65)" : "rgba(15,23,42,0.65)",
    fontSize: 14,
  };

  const shellStyle: React.CSSProperties = {
    borderRadius: 20,
    padding: 14,
    border: isDark ? "1px solid rgba(148,163,184,0.28)" : "1px solid rgba(15,23,42,0.10)",
    background: isDark ? "rgba(38,38,38,0.55)" : "rgba(255,255,255,0.85)",
    boxShadow: isDark ? "0 20px 60px rgba(0,0,0,0.55)" : "0 18px 55px rgba(15,23,42,0.10)",
  };

  return (
    <div className="w-full">
      <h1 style={headerStyle}>User Roles & Hierarchy</h1>
      <p style={subStyle}>Overview of system roles, hierarchy and permissions inside the ERP.</p>

      {loading && (
        <p style={{ fontSize: 13, color: isDark ? "rgba(255,255,255,0.65)" : "rgba(15,23,42,0.60)", marginBottom: 16 }}>
          Loading data...
        </p>
      )}

      <div style={shellStyle}>
        <RoleSection title="Top Leadership" roles={top} counts={counts} isDark={isDark} />
        <RoleSection title="Department Heads" roles={heads} counts={counts} isDark={isDark} />
        <RoleSection title="Team Roles" roles={teams} counts={counts} isDark={isDark} />
      </div>

      <div style={{ height: 16 }} />

      <div style={shellStyle}>
        <PermissionsMatrix isDark={isDark} />
      </div>
    </div>
  );
}

/* -----------------------------
   HIERARCHY GRID COMPONENT
------------------------------*/

function RoleSection({
  title,
  roles,
  counts,
  isDark,
}: {
  title: string;
  roles: RoleMeta[];
  counts: Record<string, number>;
  isDark: boolean;
}) {
  if (!roles.length) return null;

  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase", opacity: 0.7, marginBottom: 8 }}>
        {title}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
        {roles.map((r) => (
          <div
            key={r.id}
            style={{
              borderRadius: 16,
              border: isDark ? "1px solid rgba(148,163,184,0.20)" : "1px solid rgba(15,23,42,0.08)",
              background: isDark ? "rgba(255,255,255,0.03)" : "rgba(15,23,42,0.02)",
              overflow: "hidden",
            }}
          >
            <div style={{ background: r.accent, height: 3, width: "100%" }} />

            <div style={{ padding: 14 }}>
              <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6, color: isDark ? "rgba(255,255,255,0.9)" : "#111827" }}>
                {r.label}
              </div>
              <div style={{ fontSize: 13, color: isDark ? "rgba(255,255,255,0.6)" : "rgba(15,23,42,0.55)", marginBottom: 12 }}>
                {r.description}
              </div>

              <div style={{ fontSize: 13, color: isDark ? "rgba(255,255,255,0.6)" : "rgba(15,23,42,0.55)" }}>
                Users in this role: <span style={{ fontWeight: 600, color: isDark ? "rgba(255,255,255,0.9)" : "#111827" }}>{counts[r.id]}</span>
              </div>

              <a
                href="/users"
                style={{
                  display: "inline-block",
                  marginTop: 10,
                  fontSize: 13,
                  fontWeight: 600,
                  color: isDark ? "#93c5fd" : "#2563eb",
                  textDecoration: "none",
                }}
              >
                Manage Users →
              </a>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* -----------------------------
   PERMISSIONS MATRIX
------------------------------*/

function PermissionsMatrix({ isDark }: { isDark: boolean }) {
  const roles = [
    "super_admin",
    "admin",
    "sales_manager",
    "production_manager",
    "am_manager",
    "sales",
    "am",
    "hr",
    "finance",
    "production",
    "client",
  ];

  const labels: Record<string, string> = {
    super_admin: "Super Admin",
    admin: "Admin",
    sales_manager: "Sales Manager",
    production_manager: "Production Manager",
    am_manager: "AM Manager",
    sales: "Sales",
    am: "Account Manager",
    hr: "HR",
    finance: "Finance",
    production: "Production",
    client: "Client",
  };

  const rows = [
    {
      p: "Access dashboard",
      m: {
        super_admin: "✓",
        admin: "✓",
        sales_manager: "✓",
        production_manager: "✓",
        am_manager: "✓",
        sales: "✓",
        am: "✓",
        hr: "✓",
        finance: "✓",
        production: "✓",
        client: "limited",
      },
    },
    {
      p: "Create users",
      m: { super_admin: "✓", admin: "✓" },
    },
    {
      p: "Edit users",
      m: { super_admin: "✓", admin: "limited" },
    },
    {
      p: "Access Finance",
      m: { super_admin: "✓", admin: "✓", finance: "✓" },
    },
    {
      p: "Access HR / Payroll",
      m: { super_admin: "✓", admin: "✓", hr: "✓" },
    },
    {
      p: "Access Clients / Projects",
      m: {
        super_admin: "✓",
        admin: "✓",
        sales_manager: "✓",
        am: "✓",
        sales: "limited",
        finance: "limited",
        production: "limited",
        client: "own",
      },
    },
  ];

  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase", opacity: 0.7, marginBottom: 10 }}>
        Permissions Matrix
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr
              style={{
                background: isDark ? "rgba(255,255,255,0.04)" : "rgba(15,23,42,0.03)",
                borderBottom: isDark ? "1px solid rgba(148,163,184,0.25)" : "1px solid rgba(15,23,42,0.10)",
              }}
            >
              <th style={{ textAlign: "left", padding: "10px 12px", fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase" }}>
                Permission
              </th>
              {roles.map((r) => (
                <th
                  key={r}
                  style={{ textAlign: "center", padding: "10px 12px", fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase" }}
                >
                  {labels[r]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.p}
                style={{
                  borderBottom: isDark ? "1px dashed rgba(148,163,184,0.22)" : "1px dashed rgba(15,23,42,0.10)",
                }}
              >
                <td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>{row.p}</td>
                {roles.map((r) => (
                  <td key={r} style={{ textAlign: "center", padding: "10px 12px" }}>
                    {row.m[r] ? formatCell(row.m[r], isDark) : "—"}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function formatCell(val: string, isDark: boolean) {
  if (val === "✓") {
    return <span style={{ color: isDark ? "#86efac" : "#16a34a", fontWeight: 700 }}>✓</span>;
  }
  if (val === "—") return "—";

  return (
    <span
      style={{
        fontSize: 11,
        padding: "2px 8px",
        borderRadius: 999,
        border: isDark ? "1px solid rgba(148,163,184,0.35)" : "1px solid rgba(148,163,184,0.55)",
        color: isDark ? "rgba(226,232,240,0.7)" : "rgba(15,23,42,0.55)",
      }}
    >
      {val}
    </span>
  );
}
