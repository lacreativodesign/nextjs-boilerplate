"use client";

import ERPLayout from "@/components/layouts/ERPLayout";

export default function FinanceDashboard() {
  return (
    <ERPLayout role="finance" title="Finance Dashboard">
      <h2 style={{ fontSize: 24, fontWeight: 600, marginBottom: 10 }}>
        Welcome, Finance Manager 💼
      </h2>

      <p style={{ fontSize: 16, color: "#6b7280", marginBottom: 30 }}>
        Manage invoices, payments, payroll, and financial reports right here.
      </p>

      {/* KPI Cards */}
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
          <h3 style={{ fontSize: 18, fontWeight: 600 }}>Total Revenue</h3>
          <p style={{ fontSize: 28, fontWeight: 700, marginTop: 5 }}>$0</p>
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
          <h3 style={{ fontSize: 18, fontWeight: 600 }}>Pending Invoices</h3>
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
          <h3 style={{ fontSize: 18, fontWeight: 600 }}>Monthly Expenses</h3>
          <p style={{ fontSize: 28, fontWeight: 700, marginTop: 5 }}>$0</p>
        </div>
      </div>
    </ERPLayout>
  );
          }
