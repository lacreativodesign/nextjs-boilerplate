"use client";
import RequireAuth from "@/components/RequireAuth";
import { useMemo, useState } from "react";

export default function ClientPage() {
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
      chip: dark ? "rgba(2,132,199,.2)" : "rgba(6,182,212,.1)",
    }),
    [dark]
  );

  const PROJECTS = [
    {
      id: "P-101",
      name: "Brand Identity",
      status: "In Review",
      progress: 68,
      lastUpdate: "2025-10-24",
    },
    {
      id: "P-102",
      name: "Website Development",
      status: "Draft",
      progress: 35,
      lastUpdate: "2025-10-22",
    },
  ];

  const INVOICES = [
    { id: "INV-101", amount: 1200, date: "2025-10-12", status: "Paid" },
    { id: "INV-102", amount: 1800, date: "2025-10-20", status: "Unpaid" },
  ];

  const MESSAGES = [
    { id: 1, from: "am", text: "Hi! Your draft is ready for review.", time: "11:02 AM" },
    { id: 2, from: "client", text: "Great! Looking now.", time: "11:05 AM" },
  ];

  return (
    <RequireAuth allowed={["client"]}>
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
            CLIENT
          </div>

          {["Overview", "Projects", "Invoices", "Files", "Messages", "Profile"].map((item) => (
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

        {/* MAIN CONTENT */}
        <main style={{ flex: 1, padding: 32 }}>
          <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 24 }}>Client Dashboard</h1>

          {/* KPIs */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 30 }}>
            {[
              { label: "Active Projects", value: PROJECTS.length },
              { label: "Invoices", value: INVOICES.length },
              { label: "Paid", value: INVOICES.filter((i) => i.status === "Paid").length },
              { label: "Unread Messages", value: 1 },
            ].map((k) => (
              <div
                key={k.label}
                style={{
                  padding: 16,
                  borderRadius: 16,
                  background: t.card,
                  border: `1px solid ${t.border}`,
                }}
              >
                <div style={{ fontSize: 13, color: t.muted }}>{k.label}</div>
                <div style={{ fontSize: 24, fontWeight: 800 }}>{k.value}</div>
              </div>
            ))}
          </div>

          {/* PROJECTS SECTION */}
          <section
            style={{
              background: t.card,
              borderRadius: 16,
              border: `1px solid ${t.border}`,
              padding: 20,
              marginBottom: 30,
            }}
          >
            <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16 }}>Your Projects</h2>

            {PROJECTS.map((p) => (
              <div
                key={p.id}
                style={{
                  padding: "14px 0",
                  borderBottom: `1px solid ${t.border}`,
                }}
              >
                <div style={{ fontWeight: 700 }}>{p.name}</div>
                <div style={{ fontSize: 13, color: t.muted }}>
                  {p.status} • Last updated {p.lastUpdate}
                </div>

                <div
                  style={{
                    marginTop: 10,
                    height: 8,
                    borderRadius: 6,
                    background: t.border,
                    overflow: "hidden",
                    width: "100%",
                  }}
                >
                  <div
                    style={{
                      width: `${p.progress}%`,
                      background: t.brand,
                      height: "100%",
                    }}
                  ></div>
                </div>
              </div>
            ))}
          </section>

          {/* INVOICES */}
          <section
            style={{
              background: t.card,
              borderRadius: 16,
              border: `1px solid ${t.border}`,
              padding: 20,
              marginBottom: 30,
            }}
          >
            <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16 }}>Invoices</h2>

            {INVOICES.map((inv) => (
              <div
                key={inv.id}
                style={{
                  padding: "12px 0",
                  borderBottom: `1px solid ${t.border}`,
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr 1fr 1fr",
                }}
              >
                <div>{inv.id}</div>
                <div>${inv.amount}</div>
                <div>{inv.date}</div>
                <div>
                  <span
                    style={{
                      padding: "4px 10px",
                      borderRadius: 999,
                      background: t.chip,
                      border: `1px solid ${t.border}`,
                      fontSize: 12,
                    }}
                  >
                    {inv.status}
                  </span>
                </div>
              </div>
            ))}
          </section>

          {/* CHAT PREVIEW */}
          <section
            style={{
              background: t.card,
              borderRadius: 16,
              border: `1px solid ${t.border}`,
              padding: 20,
            }}
          >
            <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16 }}>Recent Messages</h2>

            <div style={{ maxHeight: 280, overflowY: "auto", marginBottom: 20 }}>
              {MESSAGES.map((m) => (
                <div
                  key={m.id}
                  style={{
                    marginBottom: 12,
                    display: "flex",
                    justifyContent: m.from === "client" ? "flex-end" : "flex-start",
                  }}
                >
                  <div
                    style={{
                      maxWidth: "70%",
                      padding: "10px 14px",
                      borderRadius: 14,
                      background:
                        m.from === "client"
                          ? "#06B6D4"
                          : t.bubbleClient || "rgba(0,0,0,0.05)",
                      color: m.from === "client" ? "#ffffff" : t.text,
                    }}
                  >
                    <div>{m.text}</div>
                    <div style={{ fontSize: 11, opacity: 0.7, marginTop: 4, textAlign: "right" }}>
                      {m.time}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <input
              placeholder="Start a message…"
              style={{
                width: "100%",
                padding: "12px 14px",
                borderRadius: 12,
                border: `1px solid ${t.border}`,
                background: dark ? "#101A30" : "#fff",
                color: t.text,
              }}
            />
          </section>
        </main>
      </div>
    </RequireAuth>
  );
            }
