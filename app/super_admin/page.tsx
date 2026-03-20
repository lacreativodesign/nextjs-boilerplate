"use client";
import { useEffect, useState } from "react";

type Stats = {
  tenants: number;
  users: number;
  activeUsers: number;
};

function StatCard({ label, value, sub, color }: {
  label: string; value: string | number; sub: string; color?: string;
}) {
  return (
    <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-5">
      <p className="text-sm text-[var(--text-muted)]">{label}</p>
      <p className="mt-2 text-3xl font-bold" style={{ color: color || "var(--text-primary)" }}>
        {value}
      </p>
      <p className="mt-1 text-xs text-[var(--text-soft)]">{sub}</p>
    </div>
  );
}

const ACTION_LINKS = [
  { title: "Tenant Management", href: "/super_admin/tenants",
    desc: "View, create, and manage tenant workspaces." },
  { title: "All Users", href: "/super_admin/users",
    desc: "View every user across all tenants." },
  { title: "System Health", href: "/super_admin/system-health/full",
    desc: "Monitor Firebase, API, and service status." },
  { title: "Error Monitoring", href: "/super_admin/monitoring",
    desc: "Sentry integration status and error tracking dashboard." },
  { title: "Audit Logs", href: "/super_admin/audit",
    desc: "Review all platform activity and changes." },
  { title: "Payment Terminal", href: "/super_admin/payments",
    desc: "Subscription revenue, billing status, and transaction history." },
  { title: "Activity Feed", href: "/super_admin/activity",
    desc: "Live stream of platform-wide events." },
  { title: "Backups", href: "/super_admin/backups",
    desc: "Manage data exports and backup schedules." },
  { title: "Demo Environment", href: "/super_admin/demo",
    desc: "Manage demo tenant and reset sample data for sales demos." },
];

export default function SuperAdminPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [usersRes, tenantsRes] = await Promise.all([
          fetch("/api/super_admin/users", { credentials: "include" }),
          fetch("/api/super_admin/tenants", { credentials: "include" })
            .catch(() => null),
        ]);
        const usersData = await usersRes.json().catch(() => ({}));
        const tenantsData = tenantsRes
          ? await tenantsRes.json().catch(() => ({}))
          : {};

        const userList = Array.isArray(usersData?.users) ? usersData.users : [];
        const tenantList = Array.isArray(tenantsData?.tenants)
          ? tenantsData.tenants
          : [];
        const activeUsers = userList.filter(
          (u: any) => (u.status || "active") === "active"
        ).length;

        setStats({
          tenants: tenantList.length || 1,
          users: userList.length,
          activeUsers,
        });
      } catch (err) {
        console.error("Super admin stats error", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Total Tenants"
          value={loading ? "..." : stats?.tenants ?? "—"}
          sub="Active workspaces"
          color="var(--erp-blue)"
        />
        <StatCard
          label="Total Users"
          value={loading ? "..." : stats?.users ?? "—"}
          sub="Across all tenants"
        />
        <StatCard
          label="Active Users"
          value={loading ? "..." : stats?.activeUsers ?? "—"}
          sub="Status: active"
          color="#10b981"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {ACTION_LINKS.map((item) => (
          <a
            key={item.href}
            href={item.href}
            className="rounded-xl border border-[var(--border-subtle)]
              bg-[var(--surface-card)] p-5
              hover:border-[var(--erp-blue)] transition-all group"
          >
            <p className="font-semibold text-[var(--text-primary)]
              group-hover:text-[var(--erp-blue)]">
              {item.title}
            </p>
            <p className="mt-1 text-sm text-[var(--text-muted)]">{item.desc}</p>
          </a>
        ))}
      </div>
    </div>
  );
}
