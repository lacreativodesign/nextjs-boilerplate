"use client";
import RequireAuth from "@/components/RequireAuth";
import { useState, useMemo } from "react";

export default function HRPage() {
  const [dark, setDark] = useState(false);

  const t = useMemo(
    () => ({
      bg: dark ? "#0F172A" : "#F8FAFC",
      text: dark ? "#E6EEF7" : "#0F172A",
      card: dark ? "#162035" : "#FFFFFF",
      sidebar: dark ? "#0B1224" : "#F1F5F9",
      border: dark ? "#2A3A57" : "#E2E8F0",
      muted: dark ? "#94A3B8" : "#475569",
      brand: "#06B6D4",
    }),
    [dark]
  );

  const EMPLOYEES = [
    { id: 1, name: "Ahsan R.", role: "Frontend Dev", status: "Active" },
    { id: 2, name: "Sadia K.", role: "Designer", status: "Probation" },
    { id: 3, name: "Bilal A.", role: "AM Lead", status: "Active" },
  ];

  const ONBOARDING = [
    { id: 1, task: "Collect Documents", due: "2025-10-25", status: "Pending" },
    { id: 2, task: "Create Accounts", due: "2025-10-26", status: "In Progress" },
  ];

  return (
    <RequireAuth allowed={["hr"]}>
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          background: t.bg,
          color: t.text,
          fontFamily: "Inter, ui-sans-serif",
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
          <div style={{ fontSize: 22, fontWeight: 900, marginBottom: 30, color: t.brand }}>
            HR PANEL
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
                  color: t.muted,
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
              borderRadius: 10,
              border: `1px solid ${t.border}`,
              background: "transparent",
              cursor: "pointer",
              color: t.text,
            }}
          >
            {dark ? "Light Mode" : "Dark Mode"}
          </button>
        </aside>

        {/* MAIN */}
        <main style={{ flex: 1, padding: 32 }}>
          <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 24 }}>HR Overview</h1>

          {/* EMPLOYEE LIST */}
          <section
            style={{
              background: t.card,
              borderRadius: 16,
              border: `1px solid ${t.border}`,
              padding: 20,
              marginBottom: 32,
            }}
          >
            <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16 }}>Employees</h2>

            {EMPLOYEES.map((e) => (
              <div
                key={e.id}
                style={{
                  padding: "14px 0",
                  borderBottom: `1px solid ${t.border}`,
                  display: "flex",
                  justifyContent: "space-between",
                }}
              >
                <div>
                  <div style={{ fontWeight: 700 }}>{e.name}</div>
                  <div style={{ fontSize: 13, color: t.muted }}>{e.role}</div>
                </div>

                <div
                  style={{
                    padding: "6px 14px",
                    borderRadius: 8,
                    background: t.brand,
                    color: "#fff",
                    fontWeight: 700,
                    fontSize: 13,
                  }}
                >
                  {e.status}
                </div>
              </div>
            ))}
          </section>

          {/* ONBOARDING */}
          <section
            style={{
              background: t.card,
              borderRadius: 16,
              border: `1px solid ${t.border}`,
              padding: 20,
            }}
          >
            <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16 }}>Onboarding Tasks</h2>

            {ONBOARDING.map((o) => (
              <div
                key={o.id}
                style={{
                  padding: "14px 0",
                  borderBottom: `1px solid ${t.border}`,
                }}
              >
                <div style={{ fontWeight: 700 }}>{o.task}</div>
                <div style={{ fontSize: 13, color: t.muted }}>
                  Due: {o.due} • {o.status}
                </div>
              </div>
            ))}
          </section>
        </main>
      </div>
    </RequireAuth>
  );
                  }
