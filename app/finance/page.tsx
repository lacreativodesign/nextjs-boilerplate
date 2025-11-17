"use client";

import ERPLayout from "@/components/layouts/ERPLayout";

export default function FinanceDashboard() {
  return (
    <ERPLayout role="finance" title="Finance Dashboard">
      <h2 style={{ fontSize: 24, fontWeight: 600, marginBottom: 10 }}>
        Welcome, Finance Team 💼
      </h2>

      <p style={{ fontSize: 16, color: "#6b7280", marginBottom: 30 }}>
        Manage invoices, payments, payroll, and financial performance analytics.
      </p>

      {/* Finance Grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          gap: 20,
          marginTop: 20,
        }}
      >
        {/* Invoices */}
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
          <h3 style={{ fontSize: 18, fontWeight: 600 }}>Invoices</h3>
          <p style={{ marginTop: 8, fontSize: 14, color: "#6b7280" }}>
            Generate, manage, and track invoice activity across all clients.
          </p>
        </div>

        {/* Payments */}
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
          <h3 style={{ fontSize: 18, fontWeight: 600 }}>Payments</h3>
          <p style={{ marginTop: 8, fontSize: 14, color: "#6b7280" }}>
            Record payments, verify settlements, and manage outstanding dues.
          </p>
        </div>

        {/* Payroll */}
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
          <h3 style={{ fontSize: 18, fontWeight: 600 }}>Payroll</h3>
          <p style={{ marginTop: 8, fontSize: 14, color: "#6b7280" }}>
            Manage employee salaries, adjustments, and automated monthly runs.
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
          <h3 style={{ fontSize: 18, fontWeight: 600 }}>Financial Reports</h3>
          <p style={{ marginTop: 8, fontSize: 14, color: "#6b7280" }}>
            Analyze cashflow, profitability, revenue trends, and forecasting.
          </p>
        </div>
      </div>
    </ERPLayout>
  );
            }
