"use client";

import ERPLayout from "@/components/layouts/ERPLayout";

export default function HRDashboard() {
  return (
    <ERPLayout role="hr" title="HR Dashboard">
      <h2 style={{ fontSize: 24, fontWeight: 600, marginBottom: 10 }}>
        Welcome, HR Manager 👋
      </h2>

      <p style={{ fontSize: 16, color: "#6b7280", marginBottom: 30 }}>
        Employee records, attendance logs, and hiring pipelines will appear here.
      </p>

      {/* KPI cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
          gap: 20,
          marginTop: 20,
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
          <h3 style={{ fontSize: 18, fontWeight: 600 }}>Total Employees</h3>
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
          <h3 style={{ fontSize: 18, fontWeight: 600 }}>Attendance Today</h3>
          <p style={{ fontSize: 28, fontWeight: 700, marginTop: 5 }}>0%</p>
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
          <h3 style={{ fontSize: 18, fontWeight: 600 }}>Pending Requests</h3>
          <p style={{ fontSize: 28, fontWeight: 700, marginTop: 5 }}>0</p>
        </div>
      </div>
    </ERPLayout>
  );
          }
