export default function RolesPage() {
  return (
    <div className="card p-6">
      <h2 className="text-lg font-bold text-[var(--text-primary)] mb-2">Role Management</h2>
      <p className="text-sm text-[var(--text-muted)]">
        Roles are assigned per user. Available roles: super_admin, admin, sales_manager, sales, am_manager, am,
        production_manager, production, finance, hr, client.
      </p>
    </div>
  );
}
