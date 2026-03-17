"use client";

import { useState } from "react";
import { useIsSystemDark } from "@/components/finance/financeUtils";

const REPORTS = [
  {
    title: "Revenue by Client (USD)",
    description: "Total paid invoice revenue grouped by client.",
    endpoint: "/api/finance/reports/revenue-by-client",
    filename: "finance-revenue-by-client.csv",
  },
  {
    title: "Payments by Month (USD)",
    description: "Paid payments aggregated by month.",
    endpoint: "/api/finance/reports/payments-by-month",
    filename: "finance-payments-by-month.csv",
  },
  {
    title: "Outstanding AR (USD)",
    description: "Unpaid invoices with due dates and amounts.",
    endpoint: "/api/finance/reports/outstanding-ar",
    filename: "finance-outstanding-ar.csv",
  },
  {
    title: "Payroll Totals by Month (PKR)",
    description: "Monthly payroll totals including commissions.",
    endpoint: "/api/finance/reports/payroll-by-month",
    filename: "finance-payroll-by-month.csv",
  },
  {
    title: "Expenses by Category (PKR)",
    description: "Operating expenses grouped by category.",
    endpoint: "/api/finance/reports/expenses-by-category",
    filename: "finance-expenses-by-category.csv",
  },
];

export default function FinanceReportsPage() {
  const isDark = useIsSystemDark();
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const handleDownload = (endpoint: string) => {
    const url = new URL(endpoint, window.location.origin);
    if (startDate) url.searchParams.set("startDate", startDate);
    if (endDate) url.searchParams.set("endDate", endDate);
    window.open(url.toString(), "_blank");
  };

  return (
    <div>
      <div>
        <h1 className="page-title">Reports</h1>
        <p className="page-subtitle">Export finance data in CSV format. USD revenue and PKR expense reporting.</p>
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        <input className="input" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        <input className="input" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        <div style={{ fontSize: 12, opacity: 0.65, display: "flex", alignItems: "center" }}>
          Filters apply to future exports (API ready).
        </div>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        {REPORTS.map((report) => (
          <div key={report.title} className="card" style={{ padding: 18, borderRadius: 16 }}>
            <div style={{ fontSize: 16, fontWeight: 700 }}>{report.title}</div>
            <div style={{ fontSize: 13, opacity: 0.7, marginTop: 6 }}>{report.description}</div>
            <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button className="btn" onClick={() => handleDownload(report.endpoint)} style={{ borderRadius: 999 }}>
                Download CSV
              </button>
              <span style={{ fontSize: 11, opacity: 0.6, alignSelf: "center" }}>{report.filename}</span>
            </div>
          </div>
        ))}
      </div>

      <div
        className="card"
        style={{
          marginTop: 20,
          padding: 16,
          borderRadius: 16,
          background: isDark ? "rgba(30,30,30,0.6)" : "rgba(248,250,252,0.8)",
        }}
      >
        <div style={{ fontWeight: 700, marginBottom: 6 }}>Export Notes</div>
        <ul style={{ fontSize: 13, opacity: 0.75, paddingLeft: 18, listStyle: "disc" }}>
          <li>Revenue and payments are exported in USD.</li>
          <li>Payroll and expenses are exported in PKR.</li>
          <li>Exports reflect live Firestore data at download time.</li>
        </ul>
      </div>
    </div>
  );
}
