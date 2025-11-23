"use client";

export default function AdminOverview() {
  return (
    <div>
      {/* PAGE TITLE */}
      <h2 style={{ fontSize: 26, fontWeight: 700, marginBottom: 20 }}>
        Overview
      </h2>

      <p style={{ fontSize: 16, color: "var(--sidebar-text)", marginBottom: 30 }}>
        Company-wide analytics, KPIs and recent activity.
      </p>

      {/* KPI ROWS */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 20,
        }}
      >
        {[
          "Total Clients",
          "Active Projects",
          "Monthly Revenue",
          "Pending Payments",
        ].map((label) => (
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
        ))}
      </div>

      {/* FUTURE SECTIONS PLACEHOLDERS */}
      <div
        style={{
          marginTop: 40,
          padding: 20,
          background: "var(--card-bg)",
          borderRadius: 10,
          border: "1px solid var(--border)",
        }}
      >
        <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 10 }}>
          Reports & Charts (Coming Soon)
        </h3>
        <p style={{ fontSize: 14, color: "var(--sidebar-text)" }}>
          Revenue chart, lead funnel, utilization metrics will be added here.
        </p>
      </div>

      <div
        style={{
          marginTop: 20,
          padding: 20,
          background: "var(--card-bg)",
          borderRadius: 10,
          border: "1px solid var(--border)",
        }}
      >
        <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 10 }}>
          Recent Activity
        </h3>
        <p style={{ fontSize: 14, color: "var(--sidebar-text)" }}>
          A timeline of system-wide updates and actions will appear here.
        </p>
      </div>
    </div>
  );
}
