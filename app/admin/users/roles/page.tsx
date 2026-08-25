'use client';

import { useEffect, useMemo, useState } from 'react';

/* -----------------------------
   ROLE DEFINITIONS (HIERARCHY)
------------------------------*/

type RoleLevel = 'top' | 'head' | 'team';

type RoleMeta = {
  id: string;
  label: string;
  level: RoleLevel;
  description: string;
  accent: string;
};

type OrgRoleNode = {
  id: string;
  label: string;
  description: string;
  tone: 'purple' | 'blue' | 'violet' | 'indigo' | 'slate' | 'emerald' | 'amber' | 'rose';
};

const ORG_HIERARCHY = {
  superAdmin: {
    id: 'org_super_admin',
    label: 'Super Admin',
    description: 'Owns platform-wide governance and unrestricted ERP control.',
    tone: 'purple',
  },
  admin: {
    id: 'org_admin',
    label: 'Admin',
    description: 'Runs day-to-day administration, departments, users, and operations.',
    tone: 'blue',
  },
  managers: [
    {
      manager: {
        id: 'org_sales_manager',
        label: 'Sales Manager',
        description: 'Leads sales pipeline, targets, and team performance.',
        tone: 'violet',
      },
      child: {
        id: 'org_sales',
        label: 'Sales',
        description: 'Handles outreach, follow-ups, lead qualification, and closing.',
        tone: 'slate',
      },
    },
    {
      manager: {
        id: 'org_am_manager',
        label: 'AM Manager',
        description: 'Guides account managers, client health, and escalations.',
        tone: 'indigo',
      },
      child: {
        id: 'org_am',
        label: 'AM',
        description: 'Manages client relationships, delivery updates, and retention.',
        tone: 'slate',
      },
    },
    {
      manager: {
        id: 'org_production_manager',
        label: 'Production Manager',
        description: 'Oversees production workload, quality, and approvals.',
        tone: 'violet',
      },
      child: {
        id: 'org_production',
        label: 'Production',
        description: 'Executes production work, task progress, and delivery workflow.',
        tone: 'slate',
      },
    },
    {
      manager: {
        id: 'org_finance',
        label: 'Finance',
        description: 'Controls invoicing, payments, and financial reporting access.',
        tone: 'emerald',
      },
    },
    {
      manager: {
        id: 'org_hr',
        label: 'HR',
        description: 'Manages people operations, attendance, and HR records.',
        tone: 'rose',
      },
    },
  ],
  clientPortal: {
    id: 'org_client_portal',
    label: 'Client Portal',
    description: 'External access for clients to view only their permitted workspace.',
    tone: 'amber',
  },
} satisfies {
  superAdmin: OrgRoleNode;
  admin: OrgRoleNode;
  managers: { manager: OrgRoleNode; child?: OrgRoleNode }[];
  clientPortal: OrgRoleNode;
};

const ROLE_DEFINITIONS: RoleMeta[] = [
  // LEVEL 1 — TOP LEADERSHIP
  {
    id: 'super_admin',
    label: 'Super Admin',
    level: 'top',
    description: 'Full control over the entire ERP system.',
    accent: 'var(--erp-blue)',
  },
  {
    id: 'admin',
    label: 'Admin',
    level: 'top',
    description: 'Manages departments, users and core operations.',
    accent: 'var(--erp-blue-hover)',
  },

  // LEVEL 2 — DEPARTMENT HEADS
  {
    id: 'sales_manager',
    label: 'Sales Manager',
    level: 'head',
    description: 'Leads sales team & pipeline.',
    accent: 'var(--color-purple)',
  },
  {
    id: 'production_manager',
    label: 'Production Manager',
    level: 'head',
    description: 'Oversees production workload and approvals.',
    accent: 'var(--color-violet)',
  },
  {
    id: 'am_manager',
    label: 'AM Manager',
    level: 'head',
    description: 'Guides account health and client escalations.',
    accent: 'var(--chart-series-5)',
  },
  {
    id: 'am',
    label: 'Account Manager',
    level: 'head',
    description: 'Manages client relationships & delivery.',
    accent: 'var(--chart-series-5)',
  },
  {
    id: 'hr',
    label: 'HR',
    level: 'head',
    description: 'Oversees attendance, staff and HR operations.',
    accent: 'var(--color-violet)',
  },
  {
    id: 'finance',
    label: 'Finance',
    level: 'head',
    description: 'Handles invoices, payments & financial reporting.',
    accent: 'var(--color-violet-deep)',
  },
  {
    id: 'production',
    label: 'Production',
    level: 'head',
    description: 'Manages the production team and workflow.',
    accent: 'var(--color-violet-deeper)',
  },

  // LEVEL 3 — TEAM ROLES
  {
    id: 'sales',
    label: 'Sales',
    level: 'team',
    description: 'Carries out outreach, follow-ups and closing.',
    accent: 'var(--color-slate)',
  },
  {
    id: 'client',
    label: 'Client',
    level: 'team',
    description: 'External client login with restricted access.',
    accent: 'var(--color-slate-deep)',
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
        const res = await fetch('/api/admin/users/list');
        const data = await res.json();
        setUsers(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error('Failed to load users:', err);
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
      const role = (u.role || '').toLowerCase();
      if (tally[role] !== undefined) tally[role] += 1;
    });

    return tally;
  }, [users]);

  const top = ROLE_DEFINITIONS.filter((r) => r.level === 'top');
  const heads = ROLE_DEFINITIONS.filter((r) => r.level === 'head');
  const teams = ROLE_DEFINITIONS.filter((r) => r.level === 'team');

  const shellStyle: React.CSSProperties = {
    borderRadius: 20,
    padding: 14,
    border: '1px solid var(--border-subtle)',
    background: 'var(--surface-card)',
    boxShadow: 'var(--shadow-md)',
  };

  return (
    <div className="w-full">
      <div className="mb-5">
        <h1 className="page-title">User Roles &amp; Hierarchy</h1>
        <p className="page-subtitle mt-2">
          Overview of system roles, hierarchy and permissions inside the ERP.
        </p>
      </div>

      {loading && (
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
          Loading data...
        </p>
      )}

      <div style={shellStyle}>
        <OrgHierarchyDiagram />
        <RoleSection title="Top Leadership" roles={top} counts={counts} />
        <RoleSection title="Department Heads" roles={heads} counts={counts} />
        <RoleSection title="Team Roles" roles={teams} counts={counts} />
      </div>

      <div style={{ height: 16 }} />

      <div style={shellStyle}>
        <PermissionsMatrix />
      </div>
    </div>
  );
}

/* -----------------------------
   ORG HIERARCHY DIAGRAM
------------------------------*/

function OrgHierarchyDiagram() {
  return (
    <section className="org-hierarchy" aria-labelledby="org-hierarchy-title">
      <div className="org-section-label" id="org-hierarchy-title">
        Organization Hierarchy
      </div>

      <div className="org-tree" role="list" aria-label="Top-down organization access hierarchy">
        <div className="org-row org-row-centered" role="listitem">
          <OrgNode role={ORG_HIERARCHY.superAdmin} />
        </div>

        <div className="org-row org-row-centered org-row-admin" role="listitem">
          <OrgNode role={ORG_HIERARCHY.admin} />
        </div>

        <div className="org-managers" role="list">
          {ORG_HIERARCHY.managers.map(({ manager, child }) => (
            <div className="org-branch" key={manager.id} role="listitem">
              <OrgNode role={manager} />
              {child ? (
                <div className="org-child">
                  <OrgNode role={child} />
                </div>
              ) : null}
            </div>
          ))}
        </div>

        <div className="org-row org-row-centered org-row-client" role="listitem">
          <OrgNode role={ORG_HIERARCHY.clientPortal} external />
        </div>
      </div>

      <style jsx>{`
        .org-hierarchy {
          margin-bottom: 22px;
          padding-bottom: 20px;
          border-bottom: 1px solid var(--border-subtle);
        }

        .org-section-label {
          margin-bottom: 12px;
          color: var(--text-primary);
          font-size: 12px;
          font-weight: 900;
          letter-spacing: 0.08em;
          opacity: 0.7;
          text-transform: uppercase;
        }

        .org-tree {
          display: flex;
          flex-direction: column;
          align-items: stretch;
          gap: 0;
          overflow-x: auto;
          padding: 2px 2px 4px;
        }

        .org-row {
          display: flex;
        }

        .org-row-centered {
          justify-content: center;
        }

        .org-row-admin,
        .org-row-client {
          position: relative;
          padding-top: 24px;
        }

        .org-row-admin::before,
        .org-row-client::before {
          position: absolute;
          top: 0;
          left: 50%;
          height: 24px;
          border-left: 2px solid var(--border-subtle);
          content: '';
          transform: translateX(-50%);
        }

        .org-managers {
          position: relative;
          display: flex;
          justify-content: center;
          gap: 12px;
          min-width: 960px;
          padding-top: 34px;
        }

        .org-managers::before {
          position: absolute;
          top: 0;
          left: 50%;
          height: 34px;
          border-left: 2px solid var(--border-subtle);
          content: '';
          transform: translateX(-50%);
        }

        .org-branch {
          position: relative;
          display: flex;
          flex: 1 1 0;
          flex-direction: column;
          align-items: center;
          max-width: 220px;
          min-width: 170px;
        }

        .org-branch::before {
          position: absolute;
          top: -18px;
          left: 50%;
          height: 18px;
          border-left: 2px solid var(--border-subtle);
          content: '';
          transform: translateX(-50%);
        }

        .org-branch::after {
          position: absolute;
          top: -18px;
          left: 0;
          width: 100%;
          border-top: 2px solid var(--border-subtle);
          content: '';
        }

        .org-branch:first-child::after {
          left: 50%;
          width: 50%;
        }

        .org-branch:last-child::after {
          width: 50%;
        }

        .org-child {
          position: relative;
          display: flex;
          justify-content: center;
          width: 100%;
          padding-top: 24px;
        }

        .org-child::before {
          position: absolute;
          top: 0;
          left: 50%;
          height: 24px;
          border-left: 2px solid var(--border-subtle);
          content: '';
          transform: translateX(-50%);
        }

        .org-row-client {
          margin-top: 10px;
        }

        @media (max-width: 767px) {
          .org-tree {
            overflow-x: visible;
            padding-left: 10px;
            border-left: 2px solid var(--border-subtle);
          }

          .org-row,
          .org-row-centered,
          .org-managers,
          .org-branch,
          .org-child {
            display: flex;
            align-items: stretch;
            justify-content: flex-start;
            width: 100%;
            max-width: none;
            min-width: 0;
          }

          .org-row-admin,
          .org-row-client,
          .org-managers,
          .org-child {
            padding-top: 10px;
          }

          .org-managers {
            flex-direction: column;
            gap: 10px;
          }

          .org-branch {
            flex-direction: column;
            gap: 0;
            padding-left: 14px;
            border-left: 2px solid var(--border-subtle);
          }

          .org-child {
            padding-left: 14px;
          }

          .org-row-admin::before,
          .org-row-client::before,
          .org-managers::before,
          .org-branch::before,
          .org-branch::after,
          .org-child::before {
            display: none;
          }
        }
      `}</style>
    </section>
  );
}

function OrgNode({ role, external = false }: { role: OrgRoleNode; external?: boolean }) {
  return (
    <article className={`org-node org-node-${role.tone}${external ? ' org-node-external' : ''}`}>
      <div className="org-node-title">{role.label}</div>
      <p className="org-node-description">{role.description}</p>

      <style jsx>{`
        .org-node {
          width: 100%;
          min-height: 104px;
          border: 1px solid var(--border-subtle);
          border-radius: 16px;
          background: var(--surface-muted);
          box-shadow: var(--shadow-sm);
          overflow: hidden;
        }

        .org-node-title {
          padding: 8px 12px;
          color: var(--text-on-brand);
          font-size: 13px;
          font-weight: 900;
          line-height: 1.2;
          text-align: center;
        }

        .org-node-description {
          margin: 0;
          padding: 10px 12px 12px;
          color: var(--text-muted);
          font-size: 12px;
          line-height: 1.4;
          text-align: center;
        }

        .org-node-purple .org-node-title {
          background: var(--color-purple);
        }

        .org-node-blue .org-node-title {
          background: var(--erp-blue);
        }

        .org-node-violet .org-node-title {
          background: var(--color-violet);
        }

        .org-node-indigo .org-node-title {
          background: var(--color-indigo);
        }

        .org-node-slate .org-node-title {
          background: var(--color-slate);
        }

        .org-node-emerald .org-node-title {
          background: var(--color-emerald);
        }

        .org-node-amber .org-node-title {
          background: var(--warning-strong);
        }

        .org-node-rose .org-node-title {
          background: var(--color-rose);
        }

        .org-node-external {
          border-style: dashed;
        }

        @media (min-width: 768px) {
          .org-node {
            max-width: 210px;
          }
        }

        @media (max-width: 767px) {
          .org-node {
            min-height: auto;
          }

          .org-node-title,
          .org-node-description {
            text-align: left;
          }
        }
      `}</style>
    </article>
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
    <div style={{ marginBottom: 18 }}>
      <div
        style={{
          fontSize: 12,
          fontWeight: 900,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          opacity: 0.7,
          marginBottom: 8,
        }}
      >
        {title}
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 12,
        }}
      >
        {roles.map((r) => (
          <div
            key={r.id}
            style={{
              borderRadius: 16,
              border: '1px solid var(--border-subtle)',
              background: 'var(--surface-muted)',
              overflow: 'hidden',
            }}
          >
            <div style={{ background: r.accent, height: 3, width: '100%' }} />

            <div style={{ padding: 14 }}>
              <div
                style={{
                  fontSize: 15,
                  fontWeight: 600,
                  marginBottom: 6,
                  color: 'var(--text-primary)',
                }}
              >
                {r.label}
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>
                {r.description}
              </div>

              <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                Users in this role:{' '}
                <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                  {counts[r.id]}
                </span>
              </div>

              <a
                href="/users"
                style={{
                  display: 'inline-block',
                  marginTop: 10,
                  fontSize: 13,
                  fontWeight: 600,
                  color: 'var(--erp-blue)',
                  textDecoration: 'none',
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

function PermissionsMatrix() {
  const roles = [
    'super_admin',
    'admin',
    'sales_manager',
    'production_manager',
    'am_manager',
    'sales',
    'am',
    'hr',
    'finance',
    'production',
    'client',
  ] as const;

  type MatrixRole = (typeof roles)[number];
  type PermissionRow = { p: string; m: Partial<Record<MatrixRole, string>> };

  const labels: Record<MatrixRole, string> = {
    super_admin: 'Super Admin',
    admin: 'Admin',
    sales_manager: 'Sales Manager',
    production_manager: 'Production Manager',
    am_manager: 'AM Manager',
    sales: 'Sales',
    am: 'Account Manager',
    hr: 'HR',
    finance: 'Finance',
    production: 'Production',
    client: 'Client',
  };

  const rows: PermissionRow[] = [
    {
      p: 'Access dashboard',
      m: {
        super_admin: '✓',
        admin: '✓',
        sales_manager: '✓',
        production_manager: '✓',
        am_manager: '✓',
        sales: '✓',
        am: '✓',
        hr: '✓',
        finance: '✓',
        production: '✓',
        client: 'limited',
      },
    },
    {
      p: 'Create users',
      m: { super_admin: '✓', admin: '✓' },
    },
    {
      p: 'Edit users',
      m: { super_admin: '✓', admin: 'limited' },
    },
    {
      p: 'Access Finance',
      m: { super_admin: '✓', admin: '✓', finance: '✓' },
    },
    {
      p: 'Access HR / Payroll',
      m: { super_admin: '✓', admin: '✓', hr: '✓' },
    },
    {
      p: 'Access Clients / Projects',
      m: {
        super_admin: '✓',
        admin: '✓',
        sales_manager: '✓',
        am: '✓',
        sales: 'limited',
        finance: 'limited',
        production: 'limited',
        client: 'own',
      },
    },
  ];

  return (
    <div>
      <div
        style={{
          fontSize: 12,
          fontWeight: 900,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          opacity: 0.7,
          marginBottom: 10,
        }}
      >
        Permissions Matrix
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr
              style={{
                borderBottom: '1px solid var(--border-subtle)',
              }}
            >
              <th
                style={{
                  textAlign: 'left',
                  padding: '10px 12px',
                  fontSize: 11,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                }}
              >
                Permission
              </th>
              {roles.map((r) => (
                <th
                  key={r}
                  style={{
                    textAlign: 'center',
                    padding: '10px 12px',
                    fontSize: 11,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                  }}
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
                  borderBottom: '1px dashed var(--border-subtle)',
                }}
              >
                <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>{row.p}</td>
                {roles.map((r) => (
                  <td key={r} style={{ textAlign: 'center', padding: '10px 12px' }}>
                    {row.m[r] ? formatCell(row.m[r]) : '—'}
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
  if (val === '✓') {
    return <span style={{ color: 'var(--color-green)', fontWeight: 700 }}>✓</span>;
  }
  if (val === '—') return '—';
  return (
    <span
      style={{
        fontSize: 11,
        padding: '2px 8px',
        borderRadius: 999,
        border: '1px solid var(--border-subtle)',
        color: 'var(--text-muted)',
      }}
    >
      {val}
    </span>
  );
}
