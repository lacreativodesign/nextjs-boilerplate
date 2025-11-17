"use client";

import ERPLayout from "@/components/layouts/ERPLayout";

export default function SalesManagerDashboard() {
  return (
    <ERPLayout role="sales_manager" title="Sales Manager Dashboard">
      <h2 style={{ fontSize: 24, fontWeight: 600, marginBottom: 10 }}>
        Sales Manager Overview 📊
      </h2>

      <p style={{ fontSize: 16, color: "#6b7280", marginBottom: 30 }}>
        Track team performance, assign leads, and manage the entire sales pipeline.
      </p>

      {/* Dashboard Grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          gap: 20,
          marginTop: 20,
        }}
      >
        {/* Team Performance */}
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
          <h3 style={{ fontSize: 18, fontWeight: 600 }}>Team Performance</h3>
          <p style={{ marginTop: 8, fontSize: 14, color: "#6b7280" }}>
            View every salesperson’s numbers, KPIs & weekly progress.
          </p>
        </div>

        {/* Lead Assignment */}
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
          <h3 style={{ fontSize: 18, fontWeight: 600 }}>Assign Leads</h3>
          <p style={{ marginTop: 8, fontSize: 14, color: "#6b7280" }}>
            Distribute leads and track who is working on what.
          </p>
        </div>

        {/* Pipeline Overview */}
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
            Monitor the full sales pipeline from lead → negotiation → closed.
          </p>
        </div>

        {/* Revenue & Targets */}
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
          <h3 style={{ fontSize: 18, fontWeight: 600 }}>Revenue & Targets</h3>
          <p style={{ marginTop: 8, fontSize: 14, color: "#6b7280" }}>
            Track quota vs achieved revenue for the full team.
          </p>
        </div>

        {/* Team Chat */}
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
          <h3 style={{ fontSize: 18, fontWeight: 600 }}>Team Communication</h3>
          <p style={{ marginTop: 8, fontSize: 14, color: "#6b7280" }}>
            Collaborate with your sales team in real-time.
          </p>
        </div>
      </div>
    </ERPLayout>
  );
            }
