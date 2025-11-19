export default function AdminOverview() {
  return (
    <div>
      <h2 style={{ fontSize: 26, fontWeight: 700, marginBottom: 20 }}>
        Overview
      </h2>

      <p style={{ fontSize: 16, color: "var(--sidebar-text)" }}>
        Company-wide analytics, KPIs and recent activity.
      </p>

      {/* KPIs */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 20,
          marginTop: 30,
        }}
      >
        {["Total Clients", "Active Projects", "Monthly Revenue", "Pending Payments"].map(
          (label) => (
            <div
              key={label}
              style={{
                padding: 20,
                background: "var(--card-bg)",
                borderRadius: 10,
                border: "1px solid var(--border)",
              }}
            >
              <h3 style={{ fontSize: 16, fontWeight: 600 }}>{label}</h3>
              <p style={{ marginTop: 8, fontSize: 24, fontWeight: 700 }}>0</p>
            </div>
          )
        )}
      </div>
    </div>
  );
}
