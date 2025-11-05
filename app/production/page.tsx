"use client";
import RequireAuth from "@/components/RequireAuth";
import { useState, useMemo } from "react";

export default function ProductionPage() {
  const [dark, setDark] = useState(false);
  const [message, setMessage] = useState("");

  const t = useMemo(
    () => ({
      bg: dark ? "#0F172A" : "#F8FAFC",
      text: dark ? "#E6EEF7" : "#0F172A",
      card: dark ? "#162035" : "#FFFFFF",
      sidebar: dark ? "#0B1224" : "#F1F5F9",
      border: dark ? "#2A3A57" : "#E2E8F0",
      muted: dark ? "#94A3B8" : "#475569",
      bubbleProd: dark ? "#1E293B" : "#06B6D4",
      bubbleClient: dark ? "#1E293B" : "#E2E8F0",
      brand: "#06B6D4",
    }),
    [dark]
  );

  const PROJECTS = [
    {
      id: "PR-401",
      name: "E-Commerce UI Kit",
      stage: "Revisions",
      files: 12,
      updated: "2025-10-24",
    },
    {
      id: "PR-402",
      name: "Logo + Branding Pack",
      stage: "Draft",
      files: 5,
      updated: "2025-10-23",
    },
  ];

  const MESSAGES = [
    { id: 1, from: "production", text: "First draft uploaded.", time: "09:30 AM" },
    { id: 2, from: "client", text: "Reviewing now!", time: "09:33 AM" },
  ];

  return (
    <RequireAuth allowed={["production"]}>
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
            PRODUCTION
          </div>

          {["Overview", "Queue", "Projects", "Files", "Activity", "Reports", "Profile"].map(
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

        {/* MAIN CONTENT */}
        <main style={{ flex: 1, padding: 32 }}>
          <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 24 }}>Production Queue</h1>

          {/* PROJECT LIST */}
          <section
            style={{
              background: t.card,
              borderRadius: 16,
              border: `1px solid ${t.border}`,
              padding: 20,
              marginBottom: 32,
            }}
          >
            <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 18 }}>Active Projects</h2>

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
                  {p.stage} • {p.files} Files • Updated {p.updated}
                </div>

                <button
                  style={{
                    marginTop: 10,
                    padding: "6px 14px",
                    borderRadius: 8,
                    border: "none",
                    background: t.brand,
                    color: "#fff",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  Open
                </button>
              </div>
            ))}
          </section>

          {/* CHAT */}
          <section
            style={{
              background: t.card,
              borderRadius: 16,
              border: `1px solid ${t.border}`,
              padding: 20,
            }}
          >
            <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16 }}>Client Chat</h2>

            <div style={{ maxHeight: 300, overflowY: "auto", marginBottom: 20 }}>
              {MESSAGES.map((m) => (
                <div
                  key={m.id}
                  style={{
                    marginBottom: 12,
                    display: "flex",
                    justifyContent: m.from === "production" ? "flex-end" : "flex-start",
                  }}
                >
                  <div
                    style={{
                      maxWidth: "70%",
                      padding: "10px 14px",
                      borderRadius: 14,
                      background: m.from === "production" ? t.bubbleProd : t.bubbleClient,
                      color: m.from === "production" ? "#fff" : t.text,
                    }}
                  >
                    <div>{m.text}</div>
                    <div
                      style={{
                        fontSize: 11,
                        opacity: 0.7,
                        marginTop: 4,
                        textAlign: "right",
                      }}
                    >
                      {m.time}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* INPUT */}
            <div style={{ display: "flex", gap: 10 }}>
              <input
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Send update..."
                style={{
                  flex: 1,
                  padding: "12px 14px",
                  borderRadius: 12,
                  border: `1px solid ${t.border}`,
                  background: dark ? "#101A30" : "#ffffff",
                  color: t.text,
                }}
              />
              <button
                style={{
                  padding: "12px 16px",
                  background: t.brand,
                  color: "#fff",
                  borderRadius: 12,
                  border: "none",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Send
              </button>
            </div>
          </section>
        </main>
      </div>
    </RequireAuth>
  );
                }
