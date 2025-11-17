"use client";

import ERPLayout from "@/components/layouts/ERPLayout";

export default function AMDashboard() {
  return (
    <ERPLayout role="am" title="Account Manager Dashboard">
      <h2 style={{ fontSize: 24, fontWeight: 600, marginBottom: 10 }}>
        Welcome, Account Manager 👋
      </h2>

      <p style={{ fontSize: 16, color: "#6b7280", marginBottom: 30 }}>
        Your assigned clients, project updates, and communication threads will appear here.
      </p>

      {/* Placeholder KPI cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
          gap: 20,
        }}
      >
        <div
          style={{
            padding: 20,
            background: "#fff",
            borderRadius: 10,
            border: "1px solid #e5e7eb",
            boxShadow: "0 2px 5px rgba(0,0,0,0.05)",
          }}
        >
          <h3 style={{ fontSize: 18, fontWeight: 600 }}>Assigned Clients</h3>
          <p style={{ fontSize: 28, fontWeight: 700, marginTop: 5 }}>0</p>
        </div>

        <div
          style={{
            padding: 20,
            background: "#fff",
            borderRadius: 10,
            border: "1px solid #e5e7eb",
            boxShadow: "0 2px 5px rgba(0,0,0,0.05)",
          }}
        >
          <h3 style={{ fontSize: 18, fontWeight: 600 }}>Projects in Progress</h3>
          <p style={{ fontSize: 28, fontWeight: 700, marginTop: 5 }}>0</p>
        </div>

        <div
          style={{
            padding: 20,
            background: "#fff",
            borderRadius: 10,
            border: "1px solid #e5e7eb",
            boxShadow: "0 2px 5px rgba(0,0,0,0.05)",
          }}
        >
          <h3 style={{ fontSize: 18, fontWeight: 600 }}>Pending Approvals</h3>
          <p style={{ fontSize: 28, fontWeight: 700, marginTop: 5 }}>0</p>
        </div>
      </div>
    </ERPLayout>
  );
}
