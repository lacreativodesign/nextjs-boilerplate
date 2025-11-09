"use client";

import { useState } from "react";
import RequireAuth from "@/components/RequireAuth";

export default function ProductionPage() {
  const [dark, setDark] = useState(true);
  const [input, setInput] = useState("");

  const theme = dark
    ? {
        bg: "#0D1527",
        text: "#E2E8F0",
        sidebar: "#0B1220",
        border: "#1E293B",
        card: "#111B2E",
        muted: "#94A3B8",
        bubbleProd: "#06B6D4",
        bubbleClient: "#1E293B",
      }
    : {
        bg: "#F8FAFC",
        text: "#0F172A",
        sidebar: "#FFFFFF",
        border: "#CBD5E1",
        card: "#FFFFFF",
        muted: "#475569",
        bubbleProd: "#06B6D4",
        bubbleClient: "#E2E8F0",
      };

  // Dummy Data
  const tasks = [
    { id: 1, name: "Website Draft", status: "In Progress" },
    { id: 2, name: "Branding Kit", status: "Pending Review" },
  ];

  const messages = [
    { id: 1, from: "prod", text: "Draft has been uploaded.", time: "10:30 AM" },
    { id: 2, from: "client", text: "Received. Reviewing now.", time: "10:33 AM" },
    { id: 3, from: "prod", text: "Let us know if revisions needed.", time: "10:34 AM" },
  ];

  const files = {
    draft: ["draft_v1.pdf", "homepage_mockup.png"],
    revision: ["revision_round1.pdf"],
    final: ["final_package.zip"],
  };

  return (
    <RequireAuth allowed={["production"]}>
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

        {/* MAIN CONTENT */}
        <main style={{ flex: 1, padding: 32 }}>
          <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 20 }}>Production Queue</h1>

          {/* TASK LIST */}
          <div
            style={{
              background: theme.card,
              padding: 20,
              borderRadius: 16,
              border: `1px solid ${theme.border}`,
              marginBottom: 30,
            }}
          >
            <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 12 }}>Active Tasks</h2>

            {tasks.map((t) => (
              <div
                key={t.id}
                style={{
                  padding: "14px 0",
                  borderBottom: `1px solid ${theme.border}`,
                  display: "flex",
                  justifyContent: "space-between",
                }}
              >
                <div>
                  <div style={{ fontWeight: 700 }}>{t.name}</div>
                  <div style={{ fontSize: 13, color: theme.muted }}>{t.status}</div>
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

          {/* FILE SECTIONS */}
          <div
            style={{
              background: theme.card,
              padding: 20,
              borderRadius: 16,
              border: `1px solid ${theme.border}`,
              marginBottom: 30,
            }}
          >
            <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 12 }}>Files</h2>

            {["draft", "revision", "final"].map((section) => (
              <div key={section} style={{ marginBottom: 24 }}>
                <div style={{ fontWeight: 700, marginBottom: 8 }}>
                  {section.toUpperCase()} FILES
                </div>
                {files[section].map((f, i) => (
                  <div
                    key={i}
                    style={{
                      padding: "10px 0",
                      borderBottom: `1px solid ${theme.border}`,
                      fontSize: 14,
                    }}
                  >
                    {f}
                  </div>
                ))}
              </div>
            ))}
          </div>

          {/* CHAT SECTION */}
          <div
            style={{
              background: theme.card,
              padding: 20,
              borderRadius: 16,
              border: `1px solid ${theme.border}`,
            }}
          >
            <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16 }}>Client Chat</h2>

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
