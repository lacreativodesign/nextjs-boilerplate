"use client";

import { useState } from "react";
import RequireAuth from "@/components/RequireAuth";

export default function ClientPage() {
  const [dark, setDark] = useState(true);

  const t = dark
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

  const invoices = [
    { id: 1, number: "INV-001", amount: "$450", status: "Paid" },
    { id: 2, number: "INV-002", amount: "$900", status: "Pending" },
    { id: 3, number: "INV-003", amount: "$180", status: "Paid" },
  ];

  const projects = [
    { id: 1, name: "Redroot Café Website", stage: "Review", progress: "70%" },
    { id: 2, name: "Brand Identity Upgrade", stage: "Drafting", progress: "40%" },
  ];

  return (
    <RequireAuth allowed={["client"]}>
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          background: t.bg,
          color: t.text,
          fontFamily: "Inter, sans-serif",
        }}
      >
        {/* SIDEBAR */}
        <aside
          style={{
            width: 240,
            background: t.sidebar,
            borderRight: `1px solid ${t.border}`,
            padding: "26px 18px",
          }}
        >
          <div style={{ fontSize: 22, fontWeight: 900, marginBottom: 30, color: "#06B6D4" }}>
            CLIENT PORTAL
          </div>

          {["Overview", "Projects", "Billing", "Profile"].map((item) => (
            <div
              key={item}
              style={{
                padding: "10px 12px",
                marginBottom: 6,
                cursor: "pointer",
                borderRadius: 10,
                color: t.muted,
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
              border: `1px solid ${t.border}`,
              cursor: "pointer",
              color: t.text,
            }}
          >
            {dark ? "Light Mode" : "Dark Mode"}
          </button>
        </aside>

        {/* MAIN CONTENT */}
        <main style={{ flex: 1, padding: 32 }}>
          <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 20 }}>Welcome Back</h1>

          {/* KPIs */}
          <div style={{ display: "flex", gap: 20, marginBottom: 30 }}>
            <div
              style={{
                background: t.card,
                padding: 20,
                borderRadius: 14,
                border: `1px solid ${t.border}`,
                flex: 1,
              }}
            >
              <div style={{ fontSize: 14, color: t.muted }}>Active Projects</div>
              <div style={{ fontSize: 28, fontWeight: 800 }}>2</div>
            </div>

            <div
              style={{
                background: t.card,
                padding: 20,
                borderRadius: 14,
                border: `1px solid ${t.border}`,
                flex: 1,
              }}
            >
              <div style={{ fontSize: 14, color: t.muted }}>Pending Invoices</div>
              <div style={{ fontSize: 28, fontWeight: 800 }}>1</div>
            </div>

            <div
              style={{
                background: t.card,
                padding: 20,
                borderRadius: 14,
                border: `1px solid ${t.border}`,
                flex: 1,
              }}
            >
              <div style={{ fontSize: 14, color: t.muted }}>Completed Files</div>
              <div style={{ fontSize: 28, fontWeight: 800 }}>6</div>
            </div>
          </div>

          {/* PROJECT LIST */}
          <div
            style={{
              background: t.card,
              padding: 20,
              borderRadius: 16,
              border: `1px solid ${t.border}`,
              marginBottom: 30,
            }}
          >
            <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 12 }}>Your Projects</h2>

            {projects.map((p) => (
              <div
                key={p.id}
                style={{
                  padding: "14px 0",
                  borderBottom: `1px solid ${t.border}`,
                  display: "flex",
                  justifyContent: "space-between",
                }}
              >
                <div>
                  <div style={{ fontWeight: 700 }}>{p.name}</div>
                  <div style={{ fontSize: 13, color: t.muted }}>
                    {p.stage} • {p.progress} Done
                  </div>
                </div>
                <button
                  style={{
                    padding: "6px 14px",
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
            ))}
          </div>

          {/* BILLING */}
          <div
            style={{
              background: t.card,
              padding: 20,
              borderRadius: 16,
              border: `1px solid ${t.border}`,
              marginBottom: 30,
            }}
          >
            <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 12 }}>Billing</h2>

            {invoices.map((inv) => (
              <div
                key={inv.id}
                style={{
                  padding: "14px 0",
                  borderBottom: `1px solid ${t.border}`,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <div>
                  <div style={{ fontWeight: 700 }}>{inv.number}</div>
                  <div style={{ fontSize: 13, color: t.muted }}>{inv.amount}</div>
                </div>

                <span
                  style={{
                    padding: "6px 12px",
                    borderRadius: 8,
                    background: inv.status === "Paid" ? "#16A34A" : "#F59E0B",
                    color: "#fff",
                    fontWeight: 600,
                  }}
                >
                  {inv.status}
                </span>
              </div>
            ))}
          </div>

          {/* PROFILE */}
          <div
            style={{
              background: t.card,
              padding: 20,
              borderRadius: 16,
              border: `1px solid ${t.border}`,
            }}
          >
            <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 12 }}>Your Profile</h2>
            <div style={{ fontSize: 14, color: t.muted }}>Coming soon…</div>
          </div>
        </main>
      </div>
    </RequireAuth>
  );
        }
