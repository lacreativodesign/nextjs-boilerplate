// app/admin/page.tsx
"use client";

export default function AdminOverviewPage() {
  return (
    <>
      <h2 style={{ fontSize: 24, fontWeight: 600, marginBottom: 10 }}>
        Welcome, Admin 👑
      </h2>

      <p style={{ fontSize: 16, color: "#6b7280", marginBottom: 30 }}>
        Manage teams, insights, finances, and operations from one unified dashboard.
      </p>

      {/* Admin Grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          gap: 20,
          marginTop: 20,
        }}
      >
        {/* Team Analytics */}
        <div
          style={{
            padding: 20,
            background: "#fff",
            borderRadius: 10,
            border: "1px solid #e5e7eb",
            boxShadow: "0 2px 5px rgba(0,0,0,0.05)",
            cursor: "pointer",
          }}
        >
          <h3 style={{ fontSize: 18, fontWeight: 600 }}>Team Analytics</h3>
          <p style={{ marginTop: 8, fontSize: 14, color: "#6b7280" }}>
            Review team performance, efficiency, and utilization metrics.
          </p>
        </div>

        {/* Hierarchy */}
        <div
          style={{
            padding: 20,
            background: "#fff",
            borderRadius: 10,
            border: "1px solid #e5e7eb",
            boxShadow: "0 2px 5px rgba(0,0,0,0.05)",
            cursor: "pointer",
          }}
        >
          <h3 style={{ fontSize: 18, fontWeight: 600 }}>Hierarchy</h3>
          <p style={{ marginTop: 8, fontSize: 14, color: "#6b7280" }}>
            Manage system roles, permissions, and access levels.
          </p>
        </div>

        {/* Finance */}
        <div
          style={{
            padding: 20,
            background: "#fff",
            borderRadius: 10,
            border: "1px solid #e5e7eb",
            boxShadow: "0 2px 5px rgba(0,0,0,0.05)",
            cursor: "pointer",
          }}
        >
          <h3 style={{ fontSize: 18, fontWeight: 600 }}>Finance</h3>
          <p style={{ marginTop: 8, fontSize: 14, color: "#6b7280" }}>
            View invoices, payments, reports, and spending activity.
          </p>
        </div>

        {/* Activity */}
        <div
          style={{
            padding: 20,
            background: "#fff",
            borderRadius: 10,
            border: "1px solid #e5e7eb",
            boxShadow: "0 2px 5px rgba(0,0,0,0.05)",
            cursor: "pointer",
          }}
        >
          <h3 style={{ fontSize: 18, fontWeight: 600 }}>Recent Activity</h3>
          <p style={{ marginTop: 8, fontSize: 14, color: "#6b7280" }}>
            Track everything that happens across the entire organization.
          </p>
        </div>
      </div>
    </>
  );
          }
