// app/sales-manager/page.tsx
"use client";

export default function SalesManagerOverview() {
  return (
    <>
      <h2 style={{ fontSize: 24, fontWeight: 600, marginBottom: 10 }}>
        Sales Manager Overview
      </h2>

      <p style={{ fontSize: 16, color: "#6b7280", marginBottom: 30 }}>
        Monitor pipeline performance, lead quality, team KPIs, and revenue projections.
      </p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          gap: 20,
          marginTop: 20,
        }}
      >
        {/* Team Leads */}
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
          <h3 style={{ fontSize: 18, fontWeight: 600 }}>
            Team Lead Performance
          </h3>
          <p style={{ marginTop: 8, fontSize: 14, color: "#6b7280" }}>
            Evaluate individual salesperson performance across KPIs.
          </p>
        </div>

        {/* Pipeline */}
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
          <h3 style={{ fontSize: 18, fontWeight: 600 }}>Pipeline Overview</h3>
          <p style={{ marginTop: 8, fontSize: 14, color: "#6b7280" }}>
            Review movement across the 7-stage CRM pipeline.
          </p>
        </div>

        {/* Revenue */}
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
          <h3 style={{ fontSize: 18, fontWeight: 600 }}>Revenue Forecast</h3>
          <p style={{ marginTop: 8, fontSize: 14, color: "#6b7280" }}>
            Projected revenue based on leads, proposals, and won deals.
          </p>
        </div>

        {/* Reports */}
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
          <h3 style={{ fontSize: 18, fontWeight: 600 }}>Reports</h3>
          <p style={{ marginTop: 8, fontSize: 14, color: "#6b7280" }}>
            Deep-dive into sales analytics and team performance metrics.
          </p>
        </div>

        {/* Settings */}
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
          <h3 style={{ fontSize: 18, fontWeight: 600 }}>Manager Settings</h3>
          <p style={{ marginTop: 8, fontSize: 14, color: "#6b7280" }}>
            Configure lead scoring, team assignments, and pipeline rules.
          </p>
        </div>
      </div>
    </>
  );
}
