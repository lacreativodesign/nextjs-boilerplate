export default function RolesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Roles</h1>
        <p className="page-subtitle mt-2">Roles are assigned per user, not configured here.</p>
      </div>

      <div className="card p-6">
        <p className="text-sm text-[var(--text-muted)]">
          Available roles: super_admin, admin, sales_manager, sales, am_manager, am,
          production_manager, production, finance, hr, client.
        </p>
      </div>
    </div>
  );
}
