"use client";

import ERPLayout from "@/components/layouts/ERPLayout";

export default function SalesDashboard() {
  return (
    <ERPLayout role="sales" title="Sales Dashboard">
      <h2 style={{ fontSize: 24, fontWeight: 600, marginBottom: 10 }}>
        Your Sales Dashboard 🚀
      </h2>

      <p style={{ fontSize: 16, color: "#6b7280", marginBottom: 30 }}>
        Stay focused. Track your leads, pipeline, tasks and daily activities.
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
            View and manage the leads assigned to you.
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
          <h3 style={{ fontSize: 18, fontWeight: 600 }}>Sales Pipeline</h3>
          <p style={{ marginTop: 8, fontSize: 14, color: "#6b7280" }}>
            Lead → Qualified → Proposal → Negotiation → Closed.
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
            Track your quota and monthly revenue progress.
          </p>
        </div>

        {/* Tasks & Follow-ups */}
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
          <h3 style={{ fontSize: 18, fontWeight: 600 }}>Tasks & Follow-ups</h3>
          <p style={{ marginTop: 8, fontSize: 14, color: "#6b7280" }}>
            Daily calls, messages, reminders and scheduled tasks.
          </p>
        </div>

        {/* My Clients */}
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
          <h3 style={{ fontSize: 18, fontWeight: 600 }}>My Clients</h3>
          <p style={{ marginTop: 8, fontSize: 14, color: "#6b7280" }}>
            View clients you’ve closed & their project statuses.
          </p>
        </div>

        {/* Activity Log */}
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
          <h3 style={{ fontSize: 18, fontWeight: 600 }}>My Activity Log</h3>
          <p style={{ marginTop: 8, fontSize: 14, color: "#6b7280" }}>
            Track everything you've done this week and month.
          </p>
        </div>
      </div>
    </ERPLayout>
  );
        }
