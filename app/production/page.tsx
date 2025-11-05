"use client";
import RequireAuth from "@/components/RequireAuth";
import { useState } from "react";

export default function ProductionPage() {
  const [dark, setDark] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState([
    { id: 1, from: "client", text: "Hey, any update on the homepage draft?", time: "10:32 AM" },
    { id: 2, from: "prod", text: "Draft ready — uploading final assets shortly.", time: "10:35 AM" },
  ]);

  const theme = {
    bg: dark ? "#0F172A" : "#F8FAFC",
    text: dark ? "#F1F5F9" : "#0F172A",
    card: dark ? "#1E293B" : "#FFFFFF",
    sidebar: dark ? "#0D1323" : "#F1F5F9",
    border: dark ? "#334155" : "#E2E8F0",
    muted: dark ? "#94A3B8" : "#475569",
    bubbleClient: dark ? "#1E293B" : "#E2E8F0",
    bubbleProd: "#06B6D4",
  };

  const PROJECTS = [
    { id: 1, name: "LA Creativo Website", status: "In Queue", files: 5 },
    { id: 2, name: "Branding Kit – Stellar Homes", status: "Revision Needed", files: 3 },
    { id: 3, name: "Social Media Pack – Trend Café", status: "In Production", files: 12 },
  ];

  const sendMessage = () => {
    if (!input.trim()) return;
    const newMsg = {
      id: Date.now(),
      from: "prod",
      text: input,
      time: "Now",
    };
    setMessages([...messages, newMsg]);
    setInput("");
  };

  return (
    <RequireAuth allowed={["production"]}>
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
          <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 20 }}>
            Production Dashboard
          </h1>

          {/* PROJECT LIST */}
          <div
            style={{
              background: theme.card,
              padding: 20,
              borderRadius: 16,
              border: `1px solid ${theme.border}`,
              marginBottom: 30,
            }}
          >
            <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 14 }}>Project Queue</h2>

            {PROJECTS.map((p) => (
              <div
                key={p.id}
                style={{
                  padding: "14px 0",
                  borderBottom: `1px solid ${theme.border}`,
                  display: "flex",
                  justifyContent: "space-between",
                }}
              >
                <div>
                  <div style={{ fontWeight: 700 }}>{p.name}</div>
                  <div style={{ fontSize: 13, color: theme.muted }}>
                    {p.status} • {p.files} Files
                  </div>
                </div>

                <button
                  style={{
                    padding: "6px 14px",
                    background: "#06B6D4",
                    color: "#fff",
                    borderRadius: 8,
                    border: "none",
                    cursor: "pointer",
                    fontWeight: 600,
                  }}
                >
                  View
                </button>
              </div>
            ))}
          </div>

          {/* CHAT BOX */}
          <div
            style={{
              background: theme.card,
              borderRadius: 16,
              padding: 20,
              border: `1px solid ${theme.border}`,
            }}
          >
            <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16 }}>
              Client Chat — Redroot Café
            </h2>

            <div style={{ maxHeight: 350, overflowY: "auto", marginBottom: 20 }}>
              {messages.map((m) => (
                <div
                  key={m.id}
                  style={{
                    marginBottom: 12,
                    display: "flex",
                    justifyContent: m.from === "prod" ? "flex-end" : "flex-start",
                  }}
                >
                  <div
                    style={{
                      maxWidth: "70%",
                      padding: "10px 14px",
                      borderRadius: 14,
                      background:
                        m.from === "prod" ? theme.bubbleProd : theme.bubbleClient,
                      color: m.from === "prod" ? "#ffffff" : theme.text,
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
            <div
              style={{
                display: "flex",
                gap: 10,
                borderTop: `1px solid ${theme.border}`,
                paddingTop: 12,
              }}
            >
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Type your message..."
                style={{
                  flex: 1,
                  padding: "12px 14px",
                  borderRadius: 12,
                  border: `1px solid ${theme.border}`,
                  background: dark ? "#101A30" : "#FFFFFF",
                  color: theme.text,
                }}
              />

              <button
                onClick={sendMessage}
                style={{
                  padding: "12px 18px",
                  background: "#06B6D4",
                  color: "#fff",
                  fontWeight: 700,
                  borderRadius: 12,
                  border: "none",
                  cursor: "pointer",
                }}
              >
                Send
              </button>
            </div>
          </div>
        </main>
      </div>
    </RequireAuth>
  );
                  }
