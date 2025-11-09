"use client";

import { useState } from "react";
import RequireAuth from "@/components/RequireAuth";

export default function HRPage() {
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

  // Dummy Data — HR
  const employees = [
    { id: 1, name: "Sarah Ali", role: "Account Manager", status: "Active" },
    { id: 2, name: "Adnan Iqbal", role: "Sales Executive", status: "Probation" },
  ];

  const onboarding = [
    { id: 1, name: "John Doe", role: "Designer", due: "2 days" },
    { id: 2, name: "Lisa Kent", role: "Content Writer", due: "5 days" },
  ];

  const activity = [
    { id: 1, text: "Sarah updated profile", time: "10:20 AM" },
    { id: 2, text: "New hire added: John Doe", time: "9:10 AM" },
  ];

  return (
    <RequireAuth allowed={["hr"]}>
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
          <div style={{ fontSize: 22, fontWeight: 900, marginBottom: 30, color: "#06B6D4" }}>
            HR PORTAL
          </div>

          {["Overview", "Employees", "Onboarding", "Performance", "Documents", "Activity", "Reports", "Profile"].map(
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
          <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 20 }}>HR Overview</h1>

          {/* EMPLOYEE LIST */}
          <div
            style={{
              background: theme.card,
              padding: 20,
              borderRadius: 16,
              border: `1px solid ${theme.border}`,
              marginBottom: 30,
            }}
          >
            <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 12 }}>Employees</h2>

            {employees.map((emp) => (
              <div
                key={emp.id}
                style={{
                  padding: "14px 0",
                  borderBottom: `1px solid ${theme.border}`,
                  display: "flex",
                  justifyContent: "space-between",
                }}
              >
                <div>
                  <div style={{ fontWeight: 700 }}>{emp.name}</div>
                  <div style={{ fontSize: 13, color: theme.muted }}>
                    {emp.role} • {emp.status}
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

          {/* ONBOARDING */}
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
              Onboarding Tasks
            </h2>

            {onboarding.map((ob) => (
              <div
                key={ob.id}
                style={{
                  padding: "14px 0",
                  borderBottom: `1px solid ${theme.border}`,
                  display: "flex",
                  justifyContent: "space-between",
                }}
              >
                <div>
                  <div style={{ fontWeight: 700 }}>{ob.name}</div>
                  <div style={{ fontSize: 13, color: theme.muted }}>
                    {ob.role} • Due in {ob.due}
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
                  Manage
                </button>
              </div>
            ))}
          </div>

          {/* ACTIVITY FEED */}
          <div
            style={{
              background: theme.card,
              padding: 20,
              borderRadius: 16,
              border: `1px solid ${theme.border}`,
            }}
          >
            <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16 }}>Recent Activity</h2>

            {activity.map((a) => (
              <div
                key={a.id}
                style={{
                  padding: "10px 0",
                  borderBottom: `1px solid ${theme.border}`,
                  fontSize: 14,
                }}
              >
                <div>{a.text}</div>
                <div style={{ fontSize: 11, opacity: 0.7, marginTop: 4 }}>{a.time}</div>
              </div>
            ))}
          </div>
        </main>
      </div>
    </RequireAuth>
  );
                }
