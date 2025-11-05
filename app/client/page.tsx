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

  const PROJECTS = [
    { id: 1, name: "Redroot Café Website", status: "Draft Ready", progress: 70 },
    { id: 2, name: "Branding Kit — Horizon Gym", status: "Revision Needed", progress: 40 },
  ];

  const INVOICES = [
    { id: 1, label: "Website Deposit", amount: "$299", status: "Paid" },
    { id: 2, label: "Branding Package", amount: "$499", status: "Unpaid" },
  ];

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
          <div style={{ fontSize: 22, fontWeight: 900, marginBottom: 30, color: "#06B6D4" }}>
            CLIENT PORTAL
          </div>

          {["Overview", "Projects", "Files", "Billing", "Activity", "Support", "Profile"].map(
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
          <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 20 }}>
            Client Dashboard
          </h1>

          {/* PROJECTS CARD */}
          <div
            style={{
              background: theme.card,
              padding: 20,
              borderRadius: 16,
              border: `1px solid ${theme.border}`,
              marginBottom: 28,
            }}
          >
            <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 14 }}>
              Your Projects
            </h2>

            {PROJECTS.map((p) => (
              <div
                key={p.id}
                style={{
                  padding: "12px 0",
                  borderBottom: `1px solid ${theme.border}`,
                }}
              >
                <div style={{ fontWeight: 700 }}>{p.name}</div>
                <div style={{ fontSize: 13, color: theme.muted }}>{p.status}</div>

                <div
                  style={{
                    marginTop: 8,
                    height: 8,
                    background: dark ? "#1E293B" : "#E2E8F0",
                    borderRadius: 6,
                  }}
                >
                  <div
                    style={{
                      width: `${p.progress}%`,
                      height: "100%",
                      background: "#06B6D4",
                      borderRadius: 6,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* BILLING CARD */}
          <div
            style={{
              background: theme.card,
              padding: 20,
              borderRadius: 16,
              border: `1px solid ${theme.border}`,
              marginBottom: 28,
            }}
          >
            <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 14 }}>
              Billing & Invoices
            </h2>

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
                  <div style={{ fontWeight: 700 }}>{inv.label}</div>
                  <div style={{ fontSize: 13, color: theme.muted }}>{inv.amount}</div>
                </div>
                <div
                  style={{
                    padding: "6px 12px",
                    background: inv.status === "Paid" ? "#22C55E" : "#EAB308",
                    color: "#fff",
                    borderRadius: 10,
                    fontSize: 12,
                    fontWeight: 700,
                  }}
                >
                  {inv.status}
                </div>
              </div>
            ))}
          </div>

          {/* PROFILE SUMMARY */}
          <div
            style={{
              background: theme.card,
              padding: 20,
              borderRadius: 16,
              border: `1px solid ${theme.border}`,
            }}
          >
            <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 12 }}>
              Your Profile
            </h2>

            <div style={{ fontSize: 15, marginBottom: 6 }}>Name: John Doe</div>
            <div style={{ fontSize: 15, marginBottom: 6 }}>Email: johndoe@gmail.com</div>
            <div style={{ fontSize: 15, marginBottom: 6 }}>Role: Client</div>
          </div>
        </main>
      </div>
    </RequireAuth>
  );
                    }
