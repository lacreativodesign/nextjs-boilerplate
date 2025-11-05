"use client";
import React, { useState } from "react";

export default function Sales2025() {
  const [dark, setDark] = useState(false);

  const t = {
    bg: dark ? "#070F22" : "#F4F7FB",
    card: dark ? "#0E1A32" : "#FFFFFF",
    text: dark ? "#E6EEF6" : "#0F172A",
    muted: dark ? "#97A3B8" : "#6B7280",
    border: dark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)",
  };

  const KPIs = [
    { label: "New Leads (This Week)", value: "34" },
    { label: "Qualified Leads", value: "18" },
    { label: "Closed Deals", value: "6" },
    { label: "Revenue (MTD)", value: "$12,450" },
  ];

  const leads = [
    { id: "LD-001", name: "Jennifer Ruiz", service: "Branding", status: "New", budget: "$650" },
    { id: "LD-002", name: "Phoenix Studio", service: "Website", status: "Qualified", budget: "$1,200" },
    { id: "LD-003", name: "Orbit Co.", service: "SMM", status: "Follow-up", budget: "$900" },
  ];

  return (
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
          padding: "24px 20px",
          background: dark ? "#0B1426" : "#FFFFFF",
          borderRight: `1px solid ${t.border}`,
          height: "100vh",
          position: "sticky",
          top: 0,
        }}
      >
        <div style={{ fontWeight: 900, fontSize: 20, marginBottom: 30, color: "#06B6D4" }}>
          SALES PORTAL
        </div>

        {[
          "Overview",
          "Leads",
          "Clients",
          "Performance",
          "Reports",
          "Settings",
          "Profile",
        ].map((item) => (
          <div
            key={item}
            style={{
              padding: "10px 12px",
              borderRadius: 10,
              cursor: "pointer",
              marginBottom: 6,
              fontWeight: 600,
              color: t.muted,
            }}
          >
            {item}
          </div>
        ))}

        <button
          onClick={() => setDark(!dark)}
          style={{
            marginTop: 30,
            padding: "10px 12px",
            width: "100%",
            borderRadius: 10,
            background: "transparent",
            border: `1px solid ${t.border}`,
            color: t.text,
            cursor: "pointer",
          }}
        >
          {dark ? "Light Mode" : "Dark Mode"}
        </button>
      </aside>

      {/* CONTENT */}
      <main style={{ flex: 1, padding: 32 }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 20 }}>Sales Overview</h1>

        {/* KPI GRID */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))",
            gap: 20,
            marginBottom: 30,
          }}
        >
          {KPIs.map((k) => (
            <div
              key={k.label}
              style={{
                background: t.card,
                padding: 20,
                borderRadius: 16,
                border: `1px solid ${t.border}`,
              }}
            >
              <div style={{ fontSize: 14, color: t.muted }}>{k.label}</div>
              <div style={{ fontSize: 24, fontWeight: 800 }}>{k.value}</div>
            </div>
          ))}
        </div>

        {/* LEADS TABLE */}
        <div
          style={{
            background: t.card,
            borderRadius: 16,
            padding: 20,
            border: `1px solid ${t.border}`,
          }}
        >
          <h2 style={{ fontSize: 20, marginBottom: 16, fontWeight: 700 }}>Recent Leads</h2>

          {leads.map((lead) => (
            <div
              key={lead.id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                padding: "12px 0",
                borderBottom: `1px solid ${t.border}`,
              }}
            >
              <div>
                <b>{lead.name}</b>
                <div style={{ fontSize: 13, color: t.muted }}>{lead.service}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontWeight: 700 }}>{lead.budget}</div>
                <div style={{ fontSize: 13, color: t.muted }}>{lead.status}</div>
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
