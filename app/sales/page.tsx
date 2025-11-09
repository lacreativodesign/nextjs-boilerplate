"use client";

import React, { useState } from "react";
import RequireAuth from "@/components/RequireAuth";

export default function SalesPage() {
  const [dark, setDark] = useState(false);

  const theme = dark
    ? {
        bg: "#0F172A",
        card: "#1E293B",
        text: "#F8FAFC",
        muted: "#94A3B8",
        border: "#334155",
        sidebar: "#1E293B",
      }
    : {
        bg: "#F1F5F9",
        card: "#FFFFFF",
        text: "#0F172A",
        muted: "#475569",
        border: "#E2E8F0",
        sidebar: "#FFFFFF",
      };

  return (
    <RequireAuth allowed={["sales", "admin"]}>
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
            SALES PORTAL
          </div>

          {[
            "Overview",
            "Leads",
            "Clients",
            "Performance",
            "Reports",
            "Profile",
          ].map((item) => (
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
              marginBottom: 30,
            }}
          >
            Leads Overview
          </h1>

          {/* LEADS LIST */}
          <div
            style={{
              background: theme.card,
              padding: 20,
              borderRadius: 16,
              border: `1px solid ${theme.border}`,
              marginBottom: 30,
            }}
          >
            <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 12 }}>
              New Leads
            </h2>

            {LEADS.map((lead) => (
              <div
                key={lead.id}
                style={{
                  padding: "14px 0",
                  borderBottom: `1px solid ${theme.border}`,
                  display: "flex",
                  justifyContent: "space-between",
                }}
              >
                <div>
                  <div style={{ fontWeight: 700 }}>{lead.name}</div>
                  <div style={{ fontSize: 13, color: theme.muted }}>
                    {lead.email} • {lead.status}
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
        </main>
      </div>
    </RequireAuth>
  );
}

/* ========== Dummy Leads (Replace later with Firestore) ========== */
const LEADS = [
  {
    id: 1,
    name: "Michael Jordan",
    email: "mj23@example.com",
    status: "New Lead",
  },
  {
    id: 2,
    name: "Sarah Parker",
    email: "sarahp@example.com",
    status: "Follow-up Needed",
  },
  {
    id: 3,
    name: "John Davidson",
    email: "jdavids@example.com",
    status: "Proposal Sent",
  },
];
