"use client";
import React, { useState } from "react";

export default function ClientDashboard() {
  const [dark, setDark] = useState(false);

  const theme = {
    bg: dark ? "#0A0F1C" : "#F4F7FB",
    sidebar: dark ? "#0E1629" : "#FFFFFF",
    card: dark ? "#111C34" : "#FFFFFF",
    border: dark ? "rgba(255,255,255,0.09)" : "rgba(0,0,0,0.08)",
    text: dark ? "#E7ECF3" : "#0F172A",
    muted: dark ? "#9AA8BC" : "#6B7280",
    brand: "#06B6D4",
  };

  const projects = [
    {
      id: "C-PR-2001",
      name: "Business Website – Skyline Interiors",
      status: "In Revisions",
      progress: 68,
    },
    {
      id: "C-PR-2002",
      name: "Brand Identity – Nordstone Holdings",
      status: "Draft Submitted",
      progress: 35,
    },
  ];

  const invoices = [
    { id: "INV-9001", amount: "$350", status: "Paid", date: "Oct 18, 2025" },
    { id: "INV-9002", amount: "$220", status: "Pending", date: "Oct 29, 2025" },
  ];

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
          padding: "26px 18px",
          borderRight: `1px solid ${theme.border}`,
        }}
      >
        <div style={{ fontSize: 22, fontWeight: 900, color: theme.brand, marginBottom: 28 }}>
          CLIENT DASHBOARD
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
            borderRadius: 10,
            border: `1px solid ${theme.border}`,
            background: "transparent",
            cursor: "pointer",
            color: theme.text,
          }}
        >
          {dark ? "Light Mode" : "Dark Mode"}
        </button>
      </aside>

      {/* MAIN */}
      <main style={{ flex: 1, padding: 32 }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 20 }}>Overview</h1>

        {/* KPI CARDS */}
        <div style={{ display: "flex", gap: 20, marginBottom: 30 }}>
          <div
            style={{
              flex: 1,
              background: theme.card,
              padding: 20,
              borderRadius: 16,
              border: `1px solid ${theme.border}`,
            }}
          >
            <div style={{ fontSize: 14, color: theme.muted }}>Active Projects</div>
            <div style={{ fontSize: 32, fontWeight: 900 }}>{projects.length}</div>
          </div>

          <div
            style={{
              flex: 1,
              background: theme.card,
              padding: 20,
              borderRadius: 16,
              border: `1px solid ${theme.border}`,
            }}
          >
            <div style={{ fontSize: 14, color: theme.muted }}>Paid Invoices</div>
            <div style={{ fontSize: 32, fontWeight: 900 }}>
              {invoices.filter((i) => i.status === "Paid").length}
            </div>
          </div>

          <div
            style={{
              flex: 1,
              background: theme.card,
              padding: 20,
              borderRadius: 16,
              border: `1px solid ${theme.border}`,
            }}
          >
            <div style={{ fontSize: 14, color: theme.muted }}>Pending Amount</div>
            <div style={{ fontSize: 32, fontWeight: 900 }}>$220</div>
          </div>
        </div>

        {/* PROJECT LIST */}
        <div
          style={{
            background: theme.card,
            padding: 20,
            borderRadius: 16,
            border: `1px solid ${theme.border}`,
            marginBottom: 40,
          }}
        >
          <h2 style={{ fontSize: 20, marginBottom: 14 }}>Your Projects</h2>

          {projects.map((p) => (
            <div
              key={p.id}
              style={{
                borderBottom: `1px solid ${theme.border}`,
                padding: "14px 0",
                display: "flex",
                justifyContent: "space-between",
              }}
            >
              <div>
                <div style={{ fontWeight: 700 }}>{p.name}</div>
                <div style={{ fontSize: 13, color: theme.muted }}>
                  {p.status} • {p.progress}% complete
                </div>
              </div>
              <button
                style={{
                  padding: "8px 16px",
                  background: theme.brand,
                  borderRadius: 10,
                  border: "none",
                  cursor: "pointer",
                  color: "#fff",
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
            marginBottom: 40,
          }}
        >
          <h2 style={{ fontSize: 20, marginBottom: 14 }}>Billing</h2>

          {invoices.map((inv) => (
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
                <div style={{ fontWeight: 700 }}>{inv.id}</div>
                <div style={{ fontSize: 13, color: theme.muted }}>{inv.date}</div>
              </div>

              <div style={{ fontWeight: 700 }}>{inv.amount}</div>

              <button
                style={{
                  padding: "8px 16px",
                  background:
                    inv.status === "Paid" ? "#10B981" : "#F59E0B",
                  borderRadius: 10,
                  border: "none",
                  cursor: "pointer",
                  color: "#fff",
                }}
              >
                {inv.status}
              </button>
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
          <h2 style={{ fontSize: 20, marginBottom: 14 }}>Profile</h2>

          <div style={{ display: "grid", gap: 14 }}>
            <div>
              <div style={{ fontSize: 13, color: theme.muted }}>Full Name</div>
              <input
                value="Mansoor Ahmed"
                readOnly
                style={{
                  width: "100%",
                  marginTop: 4,
                  padding: "12px 14px",
                  borderRadius: 10,
                  border: `1px solid ${theme.border}`,
                  background: dark ? "#101A30" : "#fff",
                  color: theme.text,
                }}
              />
            </div>

            <div>
              <div style={{ fontSize: 13, color: theme.muted }}>Email</div>
              <input
                value="client@example.com"
                readOnly
                style={{
                  width: "100%",
                  marginTop: 4,
                  padding: "12px 14px",
                  borderRadius: 10,
                  border: `1px solid ${theme.border}`,
                  background: dark ? "#101A30" : "#fff",
                  color: theme.text,
                }}
              />
            </div>

            <button
              style={{
                marginTop: 10,
                padding: "12px 16px",
                background: theme.brand,
                borderRadius: 10,
                border: "none",
                cursor: "pointer",
                color: "#fff",
                fontWeight: 700,
                width: 180,
              }}
            >
              Update Profile
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
