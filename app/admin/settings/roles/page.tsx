export default function RolesPermissionsPage() {
  return (
    <div className="space-y-6">
      <section className="card" style={{ padding: 20, borderRadius: 18 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700 }}>Roles & Permissions (Read-only)</div>
          <p style={{ fontSize: 13, color: "var(--sidebar-text)" }}>
            Locked access rules enforced across Admin modules.
          </p>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="card" style={{ padding: 16, borderRadius: 14 }}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>Admin Roles</div>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14, color: "var(--sidebar-text)" }}>
              <li>SUPER_ADMIN: full access to every setting and workflow.</li>
              <li>ADMIN: view access with limited edit rights.</li>
            </ul>
          </div>

          <div className="card" style={{ padding: 16, borderRadius: 14 }}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>HR & Sales Restrictions</div>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14, color: "var(--sidebar-text)" }}>
              <li>HR cannot edit email fields.</li>
              <li>SALES_MANAGER cannot edit client email.</li>
            </ul>
          </div>

          <div className="card" style={{ padding: 16, borderRadius: 14 }}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>Finance Controls</div>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14, color: "var(--sidebar-text)" }}>
              <li>Only Admin roles can mark invoices as paid.</li>
              <li>Admin-only “Mark as Paid” action in Finance.</li>
            </ul>
          </div>

          <div className="card" style={{ padding: 16, borderRadius: 14 }}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>Key Account Rule</div>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14, color: "var(--sidebar-text)" }}>
              <li>Key Account threshold: totalPaidUsd ≥ 1000.</li>
            </ul>
          </div>
        </div>
      </section>
    </div>
  );
}
