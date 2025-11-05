"use client";
import { useState } from "react";
import RequireAuth from "@/components/RequireAuth";

export default function AMPage() {
  const [dark, setDark] = useState(false);

  const theme = {
    bg: dark ? "#0F172A" : "#F8FAFC",
    text: dark ? "#F1F5F9" : "#0F172A",
    card: dark ? "#1E293B" : "#FFFFFF",
    sidebar: dark ? "#0D1323" : "#F1F5F9",
    border: dark ? "#334155" : "#E2E8F0",
    muted: dark ? "#94A3B8" : "#475569",
    bubbleAM: "#06B6D4",
    bubbleClient: dark ? "#334155" : "#E2E8F0",
  };

  const PROJECTS = [
    { id: 1, name: "Redroot Café Website", status: "In Progress", files: 12 },
    { id: 2, name: "Eclipse Fitness Branding", status: "Review", files: 5 },
    { id: 3, name: "Stark Motors – SEO", status: "Active", files: 7 },
  ];

  const MESSAGES = [
    { id: 1, text: "Hey, any update on the homepage?", from: "client", time: "10:21 AM" },
    { id: 2, text: "Yes, draft is ready. Uploading now!", from: "am", time: "10:22 AM" },
    { id: 3, text: "Great! Checking.", from: "client", time: "10:23 AM" },
  ];

  return (
    <RequireAuth allowed={["am"]}>
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
            AM PORTAL
          </div>

          {["Overview", "Projects", "Chats", "Activity", "Files", "Reports", "Profile"].map(
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
            Account Manager Dashboard
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
            <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 12 }}>Active Projects</h2>

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

          {/* CHAT AREA */}
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
              {MESSAGES.map((m) => (
                <div
                  key={m.id}
                  style={{
                    marginBottom: 12,
                    display: "flex",
                    justifyContent: m.from === "am" ? "flex-end" : "flex-start",
                  }}
                >
                  <div
                    style={{
                      maxWidth: "70%",
                      padding: "10px 14px",
                      borderRadius: 14,
                      background:
                        m.from === "am" ? theme.bubbleAM : theme.bubbleClient,
                      color: m.from === "am" ? "#ffffff" : theme.text,
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

            {/* INPUT BAR */}
            <div
              style={{
                display: "flex",
                gap: 10,
                borderTop: `1px solid ${theme.border}`,
                paddingTop: 12,
              }}
            >
              <input
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
