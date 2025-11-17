"use client";

import ERPLayout from "@/components/layouts/ERPLayout";

export default function SalesDashboard() {
  return (
    <ERPLayout role="sales" title="Sales Dashboard">

      <h2 style={{ fontSize: 24, fontWeight: 600, marginBottom: 10 }}>
        Welcome, Sales Rockstar 👋
      </h2>

      <p style={{ fontSize: 16, color: "#6b7280", marginBottom: 30 }}>
        Track your leads, performance metrics, and follow-ups — all in one place.
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
        {/* My Leads */}
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
          <h3 style={{ fontSize: 18, fontWeight: 600 }}>My Leads</h3>
          <p style={{ marginTop: 8, fontSize: 14, color: "#6b7280" }}>
            View, update, and manage all leads assigned to you.
          </p>
        </div>

        {/* Follow Ups */}
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
          <h3 style={{ fontSize: 18, fontWeight: 600 }}>Follow Ups</h3>
          <p style={{ marginTop: 8, fontSize: 14, color: "#6b7280" }}>
            Stay on top of tasks and pipeline activities.
          </p>
        </div>

        {/* Performance */}
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
          <h3 style={{ fontSize: 18, fontWeight: 600 }}>My Performance</h3>
          <p style={{ marginTop: 8, fontSize: 14, color: "#6b7280" }}>
            Track monthly revenue, targets, and conversions.
          </p>
        </div>

        {/* New Lead */}
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
          <h3 style={{ fontSize: 18, fontWeight: 600 }}>Add New Lead</h3>
          <p style={{ marginTop: 8, fontSize: 14, color: "#6b7280" }}>
            Create new leads and move them into your sales pipeline.
          </p>
        </div>
      </div>
    </ERPLayout>
  );
        }
