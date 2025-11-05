"use client";
import RequireAuth from "@/components/RequireAuth";
import { useState } from "react";

export default function HRPage() {
  const [dark, setDark] = useState(false);

  const theme = {
    bg: dark ? "#0F172A" : "#F8FAFC",
    text: dark ? "#F1F5F9" : "#0F172A",
    card: dark ? "#1E293B" : "#FFFFFF",
    sidebar: dark ? "#0D1323" : "#F1F5F9",
    border: dark ? "#334155" : "#E2E8F0",
    muted: dark ? "#94A3B8" : "#475569",
  };

  // Dummy employees
  const EMPLOYEES = [
    { id: 1, name: "Mia Thompson", role: "Designer", status: "Active" },
    { id: 2, name: "Daniel Carter", role: "Developer", status: "Onboarding" },
    { id: 3, name: "Sophia Khan", role: "Account Manager", status: "Active" },
    { id: 4, name: "James Lee", role: "Production Lead", status: "Probation" },
  ];

  // Dummy Activities
  const ACTIVITY = [
    { id: 1, text: "New employee hired — Daniel Carter", time: "2h ago" },
    { id: 2, text: "Performance review completed for James Lee", time: "1d ago" },
    { id: 3, text: "Documents updated for Mia Thompson", time: "3d ago" },
  ];

  return (
    <RequireAuth allowed={["hr"]}>
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
            HR PORTAL
          </div>

          {["Overview", "Employees", "Onboarding", "Documents", "Activity", "Reports", "Profile"].map(
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

        {/* MAIN */}
        <main style={{ flex: 1, padding: 32 }}>
          <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 20 }}>HR Dashboard</h1>

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
            <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 14 }}>Employees</h2>

            {EMPLOYEES.map((e) => (
              <div
                key={e.id}
                style={{
                  padding: "12px 0",
                  borderBottom: `1px solid ${theme.border}`,
                  display: "flex",
                  justifyContent: "space-between",
                }}
              >
                <div>
                  <div style={{ fontWeight: 700 }}>{e.name}</div>
                  <div style={{ fontSize: 13, color: theme.muted }}>{e.role}</div>
                </div>

                <span
                  style={{
                    padding: "6px 14px",
                    background:
                      e.status === "Active"
                        ? "#06B6D4"
                        : e.status === "Onboarding"
                        ? "#FBBF24"
                        : "#EF4444",
                    color: "#fff",
                    fontWeight: 600,
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                >
                  {e.status}
                </span>
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
              marginBottom: 30,
            }}
          >
            <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 14 }}>Recent Activity</h2>

            {ACTIVITY.map((a) => (
              <div
                key={a.id}
                style={{
                  padding: "12px 0",
                  borderBottom: `1px solid ${theme.border}`,
                }}
              >
                <div style={{ fontWeight: 600 }}>{a.text}</div>
                <div style={{ fontSize: 13, color: theme.muted }}>{a.time}</div>
              </div>
            ))}
          </div>

          {/* DOCUMENTS SECTION */}
          <div
            style={{
              background: theme.card,
              padding: 20,
              borderRadius: 16,
              border: `1px solid ${theme.border}`,
            }}
          >
            <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 12 }}>Documents</h2>

            <div style={{ fontSize: 14, color: theme.muted }}>
              • Employee contracts  
              <br />
              • NDA files  
              <br />
              • Performance reviews  
              <br />
              • Hiring forms  
              <br />
              • Tax documents  
            </div>
          </div>
        </main>
      </div>
    </RequireAuth>
  );
}
