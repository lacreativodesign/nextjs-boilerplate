"use client";
import React, { useState } from "react";

export default function Admin2025() {
  const [dark, setDark] = useState(false);
  const t = {
    bg: dark ? "#070F22" : "#F4F7FB",
    card: dark ? "#0E1A32" : "#FFFFFF",
    text: dark ? "#E6EEF6" : "#0F172A",
    muted: dark ? "#97A3B8" : "#6B7280",
    border: dark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)",
  };

  const kpi = [
    { label: "Revenue (YTD)", value: "$286,400" },
    { label: "Active Projects", value: "14" },
    { label: "Pending Tasks", value: "42" },
    { label: "Clients", value: "118" },
  ];

  const sampleProjects = [
    { id: "LC-0001", title: "Ecommerce Website", client: "Mark Rose", status: "In Progress", amount: "$1,950" },
    { id: "LC-0002", title: "Brand Identity", client: "Orbit Co.", status: "Revision", amount: "$899" },
    { id: "LC-0003", title: "Mobile App UI", client: "SwiftHub", status: "Draft", amount: "$2,400" },
  ];

  return (
    <div
      style={{
        minHeight: "100vh",
        background: t.bg,
        color: t.text,
        display: "flex",
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
          position: "sticky",
          top: 0,
          height: "100vh",
        }}
      >
        <div style={{ fontWeight: 900, fontSize: 20, marginBottom: 30, color: "#06B6D4" }}>
          LA CREATIVO
        </div>

        {[
          "Overview",
          "Team Analytics",
          "Hierarchy",
          "Activity",
          "Projects",
          "Clients",
          "Team",
          "Finance",
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
          onClick={() => setDark((d) => !d)}
          style={{
            marginTop: 30,
            padding: "10px 12px",
            width: "100%",
            borderRadius: 10,
            border: `1px solid ${t.border}`,
            background: "transparent",
            color: t.text,
            cursor: "pointer",
          }}
        >
          {dark ? "Light Mode" : "Dark Mode"}
        </button>
      </aside>

      {/* MAIN CONTENT */}
      <main style={{ flex: 1, padding: 32 }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 20 }}>Admin Overview</h1>

        {/* KPIs */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))",
            gap: 20,
            marginBottom: 30,
          }}
        >
          {kpi.map((k) => (
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

        {/* PROJECTS TABLE */}
        <div
          style={{
            background: t.card,
            borderRadius: 16,
            padding: 20,
            border: `1px solid ${t.border}`,
          }}
        >
          <h2 style={{ fontSize: 20, marginBottom: 16 }}>Recent Projects</h2>

          {sampleProjects.map((p) => (
            <div
              key={p.id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                padding: "12px 0",
                borderBottom: `1px solid ${t.border}`,
              }}
            >
              <div>
                <b>{p.title}</b>
                <div style={{ fontSize: 13, color: t.muted }}>{p.client}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontWeight: 700 }}>{p.amount}</div>
                <div style={{ fontSize: 13, color: t.muted }}>{p.status}</div>
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
