export default function SuperAdminPage() {
  return (
    <div className="space-y-6">
      <div className="mb-6">
        <h1 className="page-title">Super Admin</h1>
        <p className="page-subtitle">Platform governance, tenant management, and system control.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {[
          { label: "Total Tenants", value: "—", sub: "Active workspaces" },
          { label: "Active Users", value: "—", sub: "Across all tenants" },
          { label: "System Health", value: "OK", sub: "All services running" },
        ].map((card) => (
          <div
            key={card.label}
            className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-5"
          >
            <p className="text-sm text-[var(--text-muted)]">{card.label}</p>
            <p className="mt-2 text-3xl font-bold text-[var(--text-primary)]">{card.value}</p>
            <p className="mt-1 text-xs text-[var(--text-soft)]">{card.sub}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {[
          {
            title: "Tenant Management",
            href: "/super_admin/tenants",
            desc: "View, create, and manage tenant workspaces.",
          },
          {
            title: "Plan Management",
            href: "/super_admin/plans",
            desc: "Configure subscription plans and feature access.",
          },
          {
            title: "System Settings",
            href: "/super_admin/system",
            desc: "Platform-wide configuration and maintenance.",
          },
          {
            title: "Audit Logs",
            href: "/super_admin/activity",
            desc: "Review all platform activity and user actions.",
          },
        ].map((item) => (
          <a
            key={item.href}
            href={item.href}
            className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-5 hover:border-[var(--erp-blue)] hover:bg-[var(--erp-blue-soft)] transition-all group"
          >
            <p className="font-semibold text-[var(--text-primary)] group-hover:text-[var(--erp-blue)]">
              {item.title}
            </p>
            <p className="mt-1 text-sm text-[var(--text-muted)]">{item.desc}</p>
          </a>
        ))}
      </div>
    </div>
  );
}
