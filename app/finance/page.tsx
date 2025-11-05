"use client";

import { useState } from "react";
import RequireAuth from "@/components/RequireAuth";

export default function FinancePage() {
  return (
    <RequireAuth allowed={["finance"]}>
      <FinanceDashboard />
    </RequireAuth>
  );
}

function FinanceDashboard() {
  const [dark, setDark] = useState(false);

  const theme = dark
    ? {
        bg: "#0F172A",
        text: "#FFFFFF",
        muted: "#94A3B8",
        card: "#1E293B",
        border: "#334155",
        sidebar: "#0B1220",
        accent: "#06B6D4",
      }
    : {
        bg: "#F8FAFC",
        text: "#0F172A",
        muted: "#64748B",
        card: "#FFFFFF",
        border: "#E2E8F0",
        sidebar: "#FFFFFF",
        accent: "#06B6D4",
      };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        background: theme.bg,
        color: theme.text,
        fontFamily: "Inter, sans-serif",
      }}
    >
      {/* SIDEBAR */}
      <aside
        style={{
          width: 240,
          background: theme.sidebar,
          borderRight: `1px solid ${theme.border}`,
          padding: "26px 18px",
        }}
      >
        <div style={{ fontSize: 22, fontWeight: 900, marginBottom: 30, color: theme.accent }}>
          FINANCE PORTAL
        </div>

        {["Overview", "Invoices", "Payments", "Payroll", "Reports", "Settings", "Profile"].map(
          (item) => (
            <div
              key={item}
              style={{
                padding: "10px 12px",
                marginBottom: 6,
                cursor: "pointer",
                borderRadius: 10,
                color: theme.muted,
                fontWeight: 600,
              }}
            >
              {item}
            </div>
          )
        )}

        <button
          onClick={() => setDark(!dark)}
          style={{
            marginTop: 30,
            width: "100%",
            padding: "10px",
            background: "transparent",
            borderRadius: 10,
            border: `1px solid ${theme.border}`,
            cursor: "pointer",
            color: theme.text,
          }}
        >
          {dark ? "Light Mode" : "Dark Mode"}
        </button>
      </aside>

      {/* MAIN CONTENT */}
      <main style={{ flex: 1, padding: 32 }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 20 }}>Finance Overview</h1>

        {/* KPIs */}
        <div style={{ display: "flex", gap: 20, marginBottom: 30 }}>
          {[
            { label: "Total Revenue", value: "$182,450" },
            { label: "Outstanding Invoices", value: "$24,900" },
            { label: "Monthly Payroll", value: "$12,700" },
            { label: "Paid This Month", value: "$48,200" },
          ].map((kpi) => (
            <div
              key={kpi.label}
              style={{
                flex: 1,
                background: theme.card,
                padding: 20,
                borderRadius: 16,
                border: `1px solid ${theme.border}`,
              }}
            >
              <div style={{ fontSize: 14, color: theme.muted }}>{kpi.label}</div>
              <div style={{ fontSize: 22, fontWeight: 700, marginTop: 8 }}>{kpi.value}</div>
            </div>
          ))}
        </div>

        {/* INVOICES */}
        <div
          style={{
            background: theme.card,
            padding: 20,
            borderRadius: 16,
            border: `1px solid ${theme.border}`,
            marginBottom: 30,
          }}
        >
          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 12 }}>Recent Invoices</h2>

          {INVOICES.map((inv) => (
            <div
              key={inv.id}
              style={{
                padding: "14px 0",
                borderBottom: `1px solid ${theme.border}`,
                display: "flex",
                justifyContent: "space-between",
              }}
            >
              <div>
                <div style={{ fontWeight: 700 }}>{inv.client}</div>
                <div style={{ fontSize: 13, color: theme.muted }}>
                  {inv.date} • {inv.status}
                </div>
              </div>
              <div style={{ fontWeight: 600 }}>{inv.amount}</div>
            </div>
          ))}
        </div>

        {/* PAYMENTS */}
        <div
          style={{
            background: theme.card,
            padding: 20,
            borderRadius: 16,
            border: `1px solid ${theme.border}`,
            marginBottom: 30,
          }}
        >
          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 12 }}>Recent Payments</h2>

          {PAYMENTS.map((p) => (
            <div
              key={p.id}
              style={{
                padding: "14px 0",
                borderBottom: `1px solid ${theme.border}`,
                display: "flex",
                justifyContent: "space-between",
              }}
            >
              <div>
                <div style={{ fontWeight: 700 }}>{p.client}</div>
                <div style={{ fontSize: 13, color: theme.muted }}>{p.date}</div>
              </div>
              <div style={{ fontWeight: 600, color: theme.accent }}>{p.amount}</div>
            </div>
          ))}
        </div>

        {/* PAYROLL */}
        <div
          style={{
            background: theme.card,
            padding: 20,
            borderRadius: 16,
            border: `1px solid ${theme.border}`,
            marginBottom: 30,
          }}
        >
          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 12 }}>Payroll</h2>

          {PAYROLL.map((p) => (
            <div
              key={p.id}
              style={{
                padding: "14px 0",
                borderBottom: `1px solid ${theme.border}`,
                display: "flex",
                justifyContent: "space-between",
              }}
            >
              <div>{p.name}</div>
              <div style={{ fontWeight: 600 }}>{p.salary}</div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}

/* =================== Dummy Data =================== */

const INVOICES = [
  { id: 1, client: "Redroot Café", amount: "$1,200", status: "Pending", date: "Jan 12, 2025" },
  { id: 2, client: "Pinecore Homes", amount: "$3,450", status: "Paid", date: "Jan 10, 2025" },
  { id: 3, client: "Azuria Spa", amount: "$980", status: "Overdue", date: "Jan 05, 2025" },
];

const PAYMENTS = [
  { id: 1, client: "Pinecore Homes", amount: "$3,450", date: "Jan 10, 2025" },
  { id: 2, client: "Lunaris Media", amount: "$2,200", date: "Jan 08, 2025" },
];

const PAYROLL = [
  { id: 1, name: "Sarah Malik", salary: "$3,200" },
  { id: 2, name: "Hamza Khan", salary: "$2,900" },
  { id: 3, name: "Amina Rehan", salary: "$2,500" },
];
