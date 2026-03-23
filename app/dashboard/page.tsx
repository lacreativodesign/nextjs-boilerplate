"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n/I18nProvider";
import { useTenantContext } from "@/lib/tenant/useTenantContext";

type Stats = {
  users: number;
  clients: number;
  activeProjects: number;
  openInvoices: number;
};

function StatCard({
  label,
  value,
  sub,
  href,
}: {
  label: string;
  value: string | number;
  sub: string;
  href?: string;
}) {
  const router = useRouter();
  return (
    <div
      onClick={() => href && router.push(href)}
      className={`rounded-xl border border-[var(--border-subtle)]
        bg-[var(--surface-card)] p-5
        ${href ? "cursor-pointer hover:border-[var(--erp-blue)] transition-all group" : ""}`}
    >
      <p className="text-sm text-[var(--text-muted)]">{label}</p>
      <p
        className="mt-2 text-3xl font-bold text-[var(--text-primary)]
        group-hover:text-[var(--erp-blue)]"
      >
        {value}
      </p>
      <p className="mt-1 text-xs text-[var(--text-soft)]">{sub}</p>
    </div>
  );
}

export default function DashboardPage() {
  const { t } = useI18n();
  const { data: tenantData } = useTenantContext();
  const modulesEnabled = tenantData?.tenant?.modulesEnabled || {};

  function moduleEnabled(key: string): boolean {
    return modulesEnabled[key] !== false;
  }
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [usersRes, clientsRes] = await Promise.all([
          fetch("/api/admin/users/list", { credentials: "include" }),
          fetch("/api/admin/clients/list", { credentials: "include" }).catch(() => null),
        ]);
        const usersData = await usersRes.json().catch(() => ({}));
        const clientsData = clientsRes ? await clientsRes.json().catch(() => ({})) : {};

        const userList = Array.isArray(usersData) ? usersData : usersData?.users || [];
        const clientList = Array.isArray(clientsData?.clients)
          ? clientsData.clients
          : Array.isArray(clientsData)
            ? clientsData
            : [];

        setStats({
          users: userList.length,
          clients: clientList.length,
          activeProjects: 0,
          openInvoices: 0,
        });
      } catch (err) {
        console.error("Dashboard stats error", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const val = (n: number) => (loading ? "..." : n || "—");

  return (
    <div className="space-y-6">
      <div className="mb-6">
        <h1 className="page-title">Overview</h1>
        <p className="page-subtitle">Platform-wide snapshot across all operations.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Team Members" value={val(stats?.users ?? 0)} sub="Active users" href="/users" />
        <StatCard label="Clients" value={val(stats?.clients ?? 0)} sub="Total accounts" href="/clients" />
        <StatCard
          label={t("dashboard.widgets.activeProjects")}
          value={val(stats?.activeProjects ?? 0)}
          sub="In progress"
          href="/projects"
        />
        <StatCard
          label={t("dashboard.widgets.openInvoices")}
          value={val(stats?.openInvoices ?? 0)}
          sub="Pending payment"
          href="/finance/invoices"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {[
          {
            title: "Sales & Pipeline",
            href: "/sales",
            desc: "Leads, deals, and revenue pipeline.",
            moduleKey: "sales",
          },
          { title: "Clients", href: "/clients", desc: "Client accounts and lifecycle management." },
          { title: "HR & Team", href: "/hr", desc: "Attendance, leave, and performance.", moduleKey: "hr" },
          {
            title: "Production",
            href: "/production",
            desc: "Jobs, workload, and delivery.",
            moduleKey: "production",
          },
          { title: "Finance", href: "/finance", desc: "Invoices, payments, and payroll.", moduleKey: "finance" },
          {
            title: "Reports",
            href: "/reports",
            desc: "Analytics across all departments.",
            moduleKey: "reports",
          },
          { title: "Settings", href: "/settings", desc: "System configuration and preferences." },
        ]
          .filter((item) => !item.moduleKey || moduleEnabled(item.moduleKey))
          .map((item) => (
          <a
            key={item.href}
            href={item.href}
            className="rounded-xl border border-[var(--border-subtle)]
              bg-[var(--surface-card)] p-5
              hover:border-[var(--erp-blue)] transition-all group"
          >
            <p
              className="font-semibold text-[var(--text-primary)]
              group-hover:text-[var(--erp-blue)]"
            >
              {item.title}
            </p>
            <p className="mt-1 text-sm text-[var(--text-muted)]">{item.desc}</p>
          </a>
        ))}
      </div>

      {/* Admin Tools — only visible to admin and super_admin */}
      <section className="space-y-4">
        <div>
          <h2 className="section-title">Admin Tools</h2>
          <p className="page-subtitle">Workspace utilities, automation, and team management.</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            {
              title: "Support Tickets",
              href: "/admin/support",
              desc: "View and manage internal support requests.",
              icon: "🎫",
            },
            {
              title: "Automation",
              href: "/admin/automation",
              desc: "Configure workflow automation rules.",
              icon: "⚡",
              moduleKey: "admin",
            },
            {
              title: "Data Import",
              href: "/admin/import",
              desc: "Bulk import clients, invoices, and employees.",
              icon: "📥",
              moduleKey: "admin",
            },
            {
              title: "Activity Log",
              href: "/admin/activity",
              desc: "Full audit trail of platform-wide events.",
              icon: "🕐",
            },
          ]
            .filter((item) => !item.moduleKey || moduleEnabled(item.moduleKey))
            .map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="rounded-xl border border-[var(--border-subtle)]
                bg-[var(--surface-card)] p-5
                hover:border-[var(--erp-blue)] transition-all group"
            >
              <div className="mb-2 text-2xl">{item.icon}</div>
              <p
                className="font-semibold text-[var(--text-primary)]
                group-hover:text-[var(--erp-blue)]"
              >
                {item.title}
              </p>
              <p className="mt-1 text-sm text-[var(--text-muted)]">{item.desc}</p>
            </a>
          ))}
        </div>
      </section>

      {/* Extended Modules */}
      <section className="space-y-4">
        <div>
          <h2 className="section-title">Extended Modules</h2>
          <p className="page-subtitle">Additional platform capabilities.</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            {
              title: "Documents",
              href: "/dashboard/documents",
              desc: "File uploads, folders, and version control.",
              icon: "📁",
            },
            {
              title: "CRM — Customers",
              href: "/dashboard/crm/customers",
              desc: "Customer profiles and relationship tracking.",
              icon: "🤝",
              moduleKey: "crm",
            },
            {
              title: "CRM — Deals",
              href: "/dashboard/crm/deals",
              desc: "Deal pipeline and sales opportunities.",
              icon: "💼",
              moduleKey: "crm",
            },
            {
              title: "Inventory",
              href: "/dashboard/inventory/products",
              desc: "Products, stock levels, and variants.",
              icon: "📦",
              moduleKey: "inventory",
            },
            {
              title: "Audit Logs",
              href: "/dashboard/audit-logs",
              desc: "Immutable record of all system changes.",
              icon: "🔍",
            },
            {
              title: "Compliance",
              href: "/dashboard/compliance",
              desc: "Policy management and data retention rules.",
              icon: "🛡️",
            },
          ]
            .filter((item) => !item.moduleKey || moduleEnabled(item.moduleKey))
            .map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="rounded-xl border border-[var(--border-subtle)]
                bg-[var(--surface-card)] p-5
                hover:border-[var(--erp-blue)] transition-all group"
            >
              <div className="mb-2 text-2xl">{item.icon}</div>
              <p
                className="font-semibold text-[var(--text-primary)]
                group-hover:text-[var(--erp-blue)]"
              >
                {item.title}
              </p>
              <p className="mt-1 text-sm text-[var(--text-muted)]">{item.desc}</p>
            </a>
          ))}
        </div>
      </section>
    </div>
  );
}
