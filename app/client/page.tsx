"use client";
import RequireAuth from "@/components/RequireAuth";
import { useState } from "react";

export default function ClientPage() {
  const [dark, setDark] = useState(false);

  const theme = {
    bg: dark ? "#0F172A" : "#F8FAFC",
    text: dark ? "#F1F5F9" : "#0F172A",
    card: dark ? "#1E293B" : "#FFFFFF",
    sidebar: dark ? "#0D1323" : "#F1F5F9",
    border: dark ? "#334155" : "#E2E8F0",
    muted: dark ? "#94A3B8" : "#475569",
  };

  const KPIS = [
    { label: "Projects", value: "4 Active" },
    { label: "Invoices", value: "2 Due" },
    { label: "Chats", value: "5 Unread" },
  ];

  const PROJECTS = [
    { id: 1, name: "Redroot Café Website", stage: "Revisions" },
    { id: 2, name: "Branding Kit", stage: "Draft Submitted" },
    { id: 3, name: "Menu Design", stage: "Final Delivered" },
  ];

  const INVOICES = [
    { id: 1, label: "Website Design – Phase 2", status: "Due", amount: "$450" },
    { id: 2, label: "Branding Add-ons", status: "Paid", amount: "$199" },
  ];

  const PROFILE = {
    name: "Redroot Café",
    email: "owner@redrootcafe.com",
    phone: "+1 (555) 123-4567",
  };

  function downloadInvoice(id: number) {
    alert("Invoice download stub – will integrate Firebase Storage later.");
  }

  return (
    <RequireAuth allowed={["client"]}>
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
          <div
            style={{
              fontSize: 22,
              fontWeight: 900,
              marginBottom: 30,
              color: "#06B6D4",
            }}
          >
            CLIENT
          </div>

          {["Overview", "Projects", "Billing", "Profile"].map((item) => (
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
          ))}

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
          <h1
            style={{
              fontSize: 28,
              fontWeight: 800,
              marginBottom: 20,
            }}
          >
            Client Dashboard
          </h1>

          {/* KPIs */}
          <div style={{ display: "flex", gap: 20, marginBottom: 30 }}>
            {KPIS.map((kpi) => (
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
                <div style={{ fontSize: 22, fontWeight: 800 }}>{kpi.value}</div>
              </div>
            ))}
          </div>

          {/* PROJECTS */}
          <div
            style={{
              background: theme.card,
              padding: 20,
              borderRadius: 16,
              border: `1px solid ${theme.border}`,
              marginBottom: 30,
            }}
          >
            <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 14 }}>
              Your Projects
            </h2>

            {PROJECTS.map((p) => (
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
                  <div style={{ fontWeight: 700 }}>{p.name}</div>
                  <div style={{ fontSize: 13, color: theme.muted }}>{p.stage}</div>
                </div>
                <button
                  style={{
                    padding: "6px 14px",
                    borderRadius: 8,
                    border: "none",
                    background: "#06B6D4",
                    color: "#fff",
                    cursor: "pointer",
                    fontWeight: 600,
                  }}
                >
                  View
                </button>
              </div>
            ))}
          </div>

          {/* BILLING */}
          <div
            style={{
              background: theme.card,
              padding: 20,
              borderRadius: 16,
              border: `1px solid ${theme.border}`,
              marginBottom: 30,
            }}
          >
            <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 14 }}>
              Billing & Invoices
            </h2>

            {INVOICES.map((inv) => (
              <div
                key={inv.id}
                style={{
                  padding: "12px 0",
                  borderBottom: `1px solid ${theme.border}`,
                  display: "flex",
                  justifyContent: "space-between",
                }}
              >
                <div>
                  <div style={{ fontWeight: 700 }}>{inv.label}</div>
                  <div style={{ fontSize: 13, color: theme.muted }}>{inv.status}</div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ fontWeight: 700 }}>{inv.amount}</div>

                  <button
                    onClick={() => downloadInvoice(inv.id)}
                    style={{
                      padding: "6px 14px",
                      background: "#06B6D4",
                      color: "#fff",
                      borderRadius: 8,
                      border: "none",
                      cursor: "pointer",
                      fontWeight: 600,
                    }}
                  >
                    Download
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* PROFILE */}
          <div
            style={{
              background: theme.card,
              padding: 20,
              borderRadius: 16,
              border: `1px solid ${theme.border}`,
            }}
          >
            <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 14 }}>
              Profile
            </h2>

            <div style={{ fontSize: 14, marginBottom: 6 }}>Business Name: {PROFILE.name}</div>
            <div style={{ fontSize: 14, marginBottom: 6 }}>Email: {PROFILE.email}</div>
            <div style={{ fontSize: 14, marginBottom: 14 }}>Phone: {PROFILE.phone}</div>

            <button
              style={{
                padding: "10px 16px",
                background: "#06B6D4",
                borderRadius: 10,
                border: "none",
                fontWeight: 700,
                cursor: "pointer",
                color: "#fff",
              }}
            >
              Edit Profile
            </button>
          </div>
        </main>
      </div>
    </RequireAuth>
  );
                             }
