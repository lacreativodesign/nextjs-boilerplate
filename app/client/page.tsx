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
        accent: "#06B6D4",
      }
    : {
        bg: "#F8FAFC",
        text: "#0F172A",
        sidebar: "#FFFFFF",
        border: "#CBD5E1",
        card: "#FFFFFF",
        muted: "#475569",
        accent: "#06B6D4",
      };

  // ===== Dummy Data =====
  const kpis = [
    { label: "Active Projects", value: 3 },
    { label: "Pending Invoices", value: 1 },
    { label: "Unread Messages", value: 4 },
    { label: "Files Delivered", value: 12 },
  ];

  const projects = [
    { id: "P-1021", name: "Corporate Website Revamp", status: "In Review", files: 5 },
    { id: "P-1012", name: "Brand Identity Kit", status: "Revisions", files: 9 },
    { id: "P-0997", name: "Explainer Video", status: "Production", files: 3 },
  ];

  const invoices = [
    { id: "INV-23011", amount: "$1,200", status: "Paid", date: "2025-10-01" },
    { id: "INV-23012", amount: "$900", status: "Unpaid", date: "2025-10-28" },
  ];

  const files = [
    { id: 1, name: "Homepage_v2_DRAFT.fig", tag: "Draft" },
    { id: 2, name: "Logo_Final.ai", tag: "Final" },
    { id: 3, name: "BrandGuidelines.pdf", tag: "Final" },
    { id: 4, name: "Storyboard_rev1.pdf", tag: "Revision" },
  ];

  return (
    <RequireAuth allowed={["client"]}>
      <div
        style={{
          display: "flex",
          minHeight: "100vh",
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
            padding: "28px 18px",
          }}
        >
          <div style={{ fontSize: 22, fontWeight: 900, marginBottom: 30, color: t.accent }}>
            CLIENT PORTAL
          </div>

          {[
            "Overview",
            "Projects",
            "Files",
            "Invoices",
            "Messages",
            "Activity",
            "Profile",
          ].map((item) => (
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

        {/* MAIN */}
        <main style={{ flex: 1, padding: 32 }}>
          <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 20 }}>Overview</h1>

          {/* KPI ROW */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
              gap: 16,
              marginBottom: 24,
            }}
          >
            {kpis.map((k) => (
              <div
                key={k.label}
                style={{
                  background: t.card,
                  border: `1px solid ${t.border}`,
                  borderRadius: 16,
                  padding: 16,
                }}
              >
                <div style={{ fontSize: 12, color: t.muted }}>{k.label}</div>
                <div style={{ fontSize: 24, fontWeight: 800, marginTop: 6 }}>{k.value}</div>
              </div>
            ))}
          </div>

          {/* PROJECTS */}
          <div
            style={{
              background: t.card,
              border: `1px solid ${t.border}`,
              borderRadius: 16,
              padding: 20,
              marginBottom: 24,
            }}
          >
            <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 12 }}>Projects</h2>
            {projects.map((p) => (
              <div
                key={p.id}
                style={{
                  padding: "12px 0",
                  borderBottom: `1px solid ${t.border}`,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <div>
                  <div style={{ fontWeight: 700 }}>{p.name}</div>
                  <div style={{ fontSize: 13, color: t.muted }}>
                    {p.id} • {p.status} • {p.files} files
                  </div>
                </div>
                <button
                  style={{
                    padding: "6px 16px",
                    borderRadius: 8,
                    border: "none",
                    background: t.accent,
                    color: "#fff",
                    cursor: "pointer",
                  }}
                >
                  View
                </button>
              </div>
            ))}
          </div>

          {/* FILES */}
          <div
            style={{
              background: t.card,
              border: `1px solid ${t.border}`,
              borderRadius: 16,
              padding: 20,
              marginBottom: 24,
            }}
          >
            <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 12 }}>Files</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
              {files.map((f) => (
                <div
                  key={f.id}
                  style={{
                    border: `1px solid ${t.border}`,
                    borderRadius: 12,
                    padding: 12,
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    background: dark ? "#0E192E" : "#FFFFFF",
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 700 }}>{f.name}</div>
                    <div style={{ fontSize: 12, color: t.muted }}>{f.tag}</div>
                  </div>
                  <button
                    style={{
                      padding: "6px 12px",
                      borderRadius: 8,
                      border: "none",
                      background: t.accent,
                      color: "#fff",
                      cursor: "pointer",
                    }}
                  >
                    Download
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* INVOICES */}
          <div
            style={{
              background: t.card,
              border: `1px solid ${t.border}`,
              borderRadius: 16,
              padding: 20,
            }}
          >
            <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 12 }}>Invoices</h2>
            {invoices.map((inv) => (
              <div
                key={inv.id}
                style={{
                  padding: "12px 0",
                  borderBottom: `1px solid ${t.border}`,
                  display: "flex",
                  justifyContent: "space-between",
                }}
              >
                <div>
                  <div style={{ fontWeight: 700 }}>{inv.id}</div>
                  <div style={{ fontSize: 13, color: t.muted }}>{inv.date}</div>
                </div>
                <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                  <div style={{ fontWeight: 800 }}>{inv.amount}</div>
                  <span
                    style={{
                      padding: "4px 10px",
                      borderRadius: 999,
                      border: `1px solid ${t.border}`,
                      fontSize: 12,
                      color: inv.status === "Paid" ? "#10B981" : "#F97316",
                      background: dark ? "#0B1427" : "#F8FAFC",
                    }}
                  >
                    {inv.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </main>
      </div>
    </RequireAuth>
  );
            }
