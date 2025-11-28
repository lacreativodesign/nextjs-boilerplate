"use client";

import { useEffect, useState } from "react";

/* -----------------------------
   ROLE DEFINITIONS (HIERARCHY)
------------------------------*/

type RoleLevel = "top" | "head" | "team";

interface RoleMeta {
  id: string;
  label: string;
  level: RoleLevel;
  description: string;
  accent: string;
}

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
    label: "Production Lead",
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

export default function UserRolesPage() {
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

  // Count users by role
  const counts: Record<string, number> = {};
  ROLE_DEFINITIONS.forEach((r) => (counts[r.id] = 0));

  users.forEach((u) => {
    const role = (u.role || "").toLowerCase();
    if (counts[role] !== undefined) counts[role] += 1;
  });

  const top = ROLE_DEFINITIONS.filter((r) => r.level === "top");
  const heads = ROLE_DEFINITIONS.filter((r) => r.level === "head");
  const teams = ROLE_DEFINITIONS.filter((r) => r.level === "team");

  return (
    <div className="w-full">
      <h2 className="text-[26px] font-bold mb-1">User Roles & Hierarchy</h2>
      <p className="text-[15px] text-gray-500 dark:text-gray-400 mb-6">
        Overview of system roles, hierarchy and permissions inside the ERP.
      </p>

      {loading && (
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          Loading data...
        </p>
      )}

      {/* SECTION 1: Hierarchy Grid */}
      <RoleSection title="Top Leadership" roles={top} counts={counts} />
      <RoleSection title="Department Heads" roles={heads} counts={counts} />
      <RoleSection title="Team Roles" roles={teams} counts={counts} />

      {/* SECTION 2: Permissions Matrix */}
      <PermissionsMatrix />
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
}: {
  title: string;
  roles: RoleMeta[];
  counts: Record<string, number>;
}) {
  if (!roles.length) return null;

  return (
    <div className="mb-10">
      <h3 className="text-lg font-semibold mb-2">{title}</h3>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {roles.map((r) => (
          <div
            key={r.id}
            className="rounded-lg border"
            style={{
              borderColor: "var(--border)",
              background: "var(--card-bg)",
            }}
          >
            {/* Accent line */}
            <div style={{ background: r.accent, height: "3px", width: "100%" }} />

            <div className="p-4">
              <p className="font-semibold text-[15px] mb-1">{r.label}</p>
              <p className="text-[13px] text-gray-500 dark:text-gray-400 mb-3">
                {r.description}
              </p>

              <p className="text-[13px] text-gray-500 dark:text-gray-400">
                Users in this role:{" "}
                <span className="font-semibold text-gray-800 dark:text-gray-200">
                  {counts[r.id]}
                </span>
              </p>

              <a
                href="/admin/users"
                className="text-blue-600 dark:text-blue-400 text-sm font-medium mt-3 inline-block"
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

function PermissionsMatrix() {
  const roles = [
    "super_admin",
    "admin",
    "sales_manager",
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
    <div
      className="rounded-lg border p-4"
      style={{ borderColor: "var(--border)", background: "var(--card-bg)" }}
    >
      <h3 className="text-lg font-semibold mb-3">Permissions Matrix</h3>

      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr
              style={{
                background: "var(--table-header-bg)",
                borderBottom: "1px solid var(--border)",
              }}
            >
              <th className="text-left p-2 font-semibold">Permission</th>
              {roles.map((r) => (
                <th key={r} className="text-center p-2 font-semibold">
                  {labels[r]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.p}
                style={{ borderBottom: "1px solid var(--border)" }}
              >
                <td className="p-2 whitespace-nowrap">{row.p}</td>
                {roles.map((r) => (
                  <td key={r} className="text-center p-2">
                    {row.m[r] ? formatCell(row.m[r]) : "—"}
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

function formatCell(val: string) {
  if (val === "✓")
    return <span className="text-green-600 dark:text-green-400 font-bold">✓</span>;
  if (val === "—") return "—";

  return (
    <span className="text-xs px-2 py-0.5 rounded-full border border-gray-300 dark:border-gray-700 text-gray-500 dark:text-gray-400">
      {val}
    </span>
  );
}
