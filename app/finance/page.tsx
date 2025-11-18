// app/finance/page.tsx
"use client";

export default function FinanceOverviewPage() {
  return (
    <>
      <h2 style={{ fontSize: 24, fontWeight: 600, marginBottom: 10 }}>
        Finance Overview
      </h2>

      <p style={{ fontSize: 16, color: "#6b7280", marginBottom: 30 }}>
        Monitor invoices, payments, cash flow, and financial performance across the agency.
      </p>

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
            Track issued invoices, due dates, and outstanding amounts.
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
            View received payments and cash-in across projects and clients.
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
            Manage salaries, payouts, and monthly payroll summaries.
          </p>
        </div>

        {/* Finance Reports */}
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
            Analyze revenue, margins, and department-level financial health.
          </p>
        </div>

        {/* Settings / Controls */}
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
          <h3 style={{ fontSize: 18, fontWeight: 600 }}>Finance Settings</h3>
          <p style={{ marginTop: 8, fontSize: 14, color: "#6b7280" }}>
            Configure tax, currencies, payment terms, and export options.
          </p>
        </div>
      </div>
    </>
  );
        }
