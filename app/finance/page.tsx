"use client";

import { useState } from "react";
import RequireAuth from "@/components/RequireAuth";

export default function FinancePage() {
  const [dark, setDark] = useState(true);

  const theme = dark
    ? {
        bg: "#0D1527",
        text: "#E2E8F0",
        sidebar: "#0B1220",
        border: "#1E293B",
        card: "#111B2E",
        muted: "#94A3B8",
      }
    : {
        bg: "#F8FAFC",
        text: "#0F172A",
        sidebar: "#FFFFFF",
        border: "#CBD5E1",
        card: "#FFFFFF",
        muted: "#475569",
      };

  // ===== Dummy Finance Data =====

  const invoices = [
    { id: 1, client: "Redroot Café", amount: "$1,200", status: "Paid" },
    { id: 2, client: "Bluewave Studio", amount: "$2,100", status: "Unpaid" },
    { id: 3, client: "Nova Brands", amount: "$900", status: "Pending" },
  ];

  const payments = [
    { id: 1, type: "Stripe", date: "2025-01-15", amount: "$500" },
    { id: 2, type: "Bank Transfer", date: "2025-01-17", amount: "$1,000" },
  ];

  const payroll = [
    { id: 1, name: "Sarah Ali", role: "Account Manager", salary: "$850" },
    { id: 2, name: "Adnan Iqbal", role: "Sales Executive", salary: "$650" },
  ];

  return (
    <RequireAuth allowed={["finance"]}>
      <div
        style={{
          display: "flex",
          minHeight: "100vh",
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
            padding: "28px 18px",
          }}
        >
          <div
            style={{
              fontSize: 22,
              fontWeight: 900,
              marginBottom: 30,
              color: "#06B6D4",
            }}
          >
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
            <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 12 }}>Invoices</h2>

            {invoices.map((inv) => (
              <div
                key={inv.id}
                style={{
                  padding: "12px 0",
                  borderBottom: `1px solid ${theme.border}`,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <div>
                  <div style={{ fontWeight: 700 }}>{inv.client}</div>
                  <div style={{ fontSize: 13, color: theme.muted }}>{inv.status}</div>
                </div>

                <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                  <div style={{ fontWeight: 700 }}>{inv.amount}</div>

                  <button
                    style={{
                      padding: "6px 16px",
                      borderRadius: 8,
                      border: "none",
                      background: "#06B6D4",
                      color: "#fff",
                      cursor: "pointer",
                    }}
                  >
                    View
                  </button>
                </div>
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
            <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 12 }}>Payments</h2>

            {payments.map((p) => (
              <div
                key={p.id}
                style={{
                  padding: "12px 0",
                  borderBottom: `1px solid ${theme.border}`,
                  display: "flex",
                  justifyContent: "space-between",
                }}
              >
                <div>
                  <div style={{ fontWeight: 700 }}>{p.type}</div>
                  <div style={{ fontSize: 13, color: theme.muted }}>{p.date}</div>
                </div>
                <div style={{ fontWeight: 700 }}>{p.amount}</div>
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
            }}
          >
            <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 12 }}>Payroll</h2>

            {payroll.map((pr) => (
              <div
                key={pr.id}
                style={{
                  padding: "12px 0",
                  borderBottom: `1px solid ${theme.border}`,
                  display: "flex",
                  justifyContent: "space-between",
                }}
              >
                <div>
                  <div style={{ fontWeight: 700 }}>{pr.name}</div>
                  <div style={{ fontSize: 13, color: theme.muted }}>{pr.role}</div>
                </div>
                <div style={{ fontWeight: 700 }}>{pr.salary}</div>
              </div>
            ))}
          </div>
        </main>
      </div>
    </RequireAuth>
  );
                }
