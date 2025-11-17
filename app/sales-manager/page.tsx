"use client";

import ERPLayout from "@/components/layouts/ERPLayout";

export default function SalesManagerDashboard() {
  return (
    <ERPLayout role="sales-manager" title="Sales Manager Dashboard">
      <h2 style={{ fontSize: 24, fontWeight: 600, marginBottom: 10 }}>
        Team Sales Overview 📊
      </h2>

      <p style={{ fontSize: 16, color: "#6b7280", marginBottom: 30 }}>
        Monitor your team, assign leads, review performance, and track progress.
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
        {/* Team Members */}
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
          <h3 style={{ fontSize: 18, fontWeight: 600 }}>Team Members</h3>
          <p style={{ marginTop: 8, fontSize: 14, color: "#6b7280" }}>
            View all sales team members and their assigned leads.
          </p>
        </div>

        {/* Team Pipeline */}
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
          <h3 style={{ fontSize: 18, fontWeight: 600 }}>Team Pipeline</h3>
          <p style={{ marginTop: 8, fontSize: 14, color: "#6b7280" }}>
            Monitor all leads assigned across your team.
          </p>
        </div>

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
            Track monthly revenue, quota progress, and overall efficiency.
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
          <h3 style={{ fontSize: 18, fontWeight: 600 }}>Lead Assignment</h3>
          <p style={{ marginTop: 8, fontSize: 14, color: "#6b7280" }}>
            Assign, reassign and manage team lead distribution.
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
          <h3 style={{ fontSize: 18, fontWeight: 600 }}>Team Activity Log</h3>
          <p style={{ marginTop: 8, fontSize: 14, color: "#6b7280" }}>
            Track calls, follow-ups, proposals and closing attempts.
          </p>
        </div>

        {/* Top Performers */}
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
          <h3 style={{ fontSize: 18, fontWeight: 600 }}>Top Performers</h3>
          <p style={{ marginTop: 8, fontSize: 14, color: "#6b7280" }}>
            Identify your highest performing team members.
          </p>
        </div>
      </div>
    </ERPLayout>
  );
}
