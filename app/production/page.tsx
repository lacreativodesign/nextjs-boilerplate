"use client";
import RequireAuth from "@/components/RequireAuth";
import { useState } from "react";

export default function ProductionPage() {
  const [dark, setDark] = useState(false);
  const [chatInput, setChatInput] = useState("");

  const theme = {
    bg: dark ? "#0F172A" : "#F8FAFC",
    text: dark ? "#F1F5F9" : "#0F172A",
    card: dark ? "#1E293B" : "#FFFFFF",
    sidebar: dark ? "#0D1323" : "#F1F5F9",
    border: dark ? "#334155" : "#E2E8F0",
    muted: dark ? "#94A3B8" : "#475569",
    bubbleProd: dark ? "#0EA5E9" : "#06B6D4",
    bubbleClient: dark ? "#1E293B" : "#FFFFFF",
  };

  const KPIS = [
    { label: "Tasks in Queue", value: 12 },
    { label: "Files Delivered", value: 34 },
    { label: "Active Projects", value: 5 },
  ];

  const QUEUE = [
    { id: 1, name: "Café Website — Hero Slider", due: "Today" },
    { id: 2, name: "Logo Revision — Mark II", due: "Tomorrow" },
    { id: 3, name: "Packaging Mockup", due: "2 Days" },
  ];

  const FILE_BUCKET = [
    { id: 1, name: "Hero Banner.psd", type: "Draft" },
    { id: 2, name: "Menu Board.ai", type: "Revision" },
    { id: 3, name: "Logo Final.png", type: "Final" },
  ];

  const MESSAGES = [
    { id: 1, from: "client", text: "Please revise the header size.", time: "10:02 AM" },
    { id: 2, from: "prod", text: "Got it — sending updated draft shortly.", time: "10:05 AM" },
    { id: 3, from: "client", text: "Thank you!", time: "10:06 AM" },
  ];

  function sendMessage() {
    if (!chatInput.trim()) return;
    alert("Chat send stub — Firebase integration later.");
    setChatInput("");
  }

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
          <div
            style={{
              fontSize: 22,
              fontWeight: 900,
              marginBottom: 30,
              color: "#06B6D4",
            }}
          >
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
          <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 20 }}>
            Production Dashboard
          </h1>

          {/* KPIs */}
          <div style={{ display: "flex", gap: 20, marginBottom: 30 }}>
            {KPIS.map((kpi) => (
              <div
                key={kpi.label}
                style={{
                  flex: 1,
                  background: theme.card,
                  padding: 20,
                  borderRadius: 16,
                  border: `1px solid ${theme.border}`,
                }}
              >
                <div style={{ fontSize: 14, color: theme.muted }}>{kpi.label}</div>
                <div style={{ fontSize: 22, fontWeight: 800 }}>{kpi.value}</div>
              </div>
            ))}
          </div>

          {/* QUEUE */}
          <div
            style={{
              background: theme.card,
              padding: 20,
              borderRadius: 16,
              border: `1px solid ${theme.border}`,
              marginBottom: 30,
            }}
          >
            <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 14 }}>
              Work Queue
            </h2>

            {QUEUE.map((task) => (
              <div
                key={task.id}
                style={{
                  padding: "14px 0",
                  borderBottom: `1px solid ${theme.border}`,
                  display: "flex",
                  justifyContent: "space-between",
                }}
              >
                <div>
                  <div style={{ fontWeight: 700 }}>{task.name}</div>
                  <div style={{ fontSize: 13, color: theme.muted }}>Due: {task.due}</div>
                </div>
                <button
                  style={{
                    padding: "6px 14px",
                    borderRadius: 8,
                    border: "none",
                    background: "#06B6D4",
                    color: "#fff",
                    cursor: "pointer",
                    fontWeight: 600,
                  }}
                >
                  Open
                </button>
              </div>
            ))}
          </div>

          {/* FILE BUCKET */}
          <div
            style={{
              background: theme.card,
              padding: 20,
              borderRadius: 16,
              border: `1px solid ${theme.border}`,
              marginBottom: 30,
            }}
          >
            <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 14 }}>
              Files
            </h2>

            {FILE_BUCKET.map((file) => (
              <div
                key={file.id}
                style={{
                  padding: "12px 0",
                  borderBottom: `1px solid ${theme.border}`,
                  display: "flex",
                  justifyContent: "space-between",
                }}
              >
                <div>
                  <div style={{ fontWeight: 700 }}>{file.name}</div>
                  <div style={{ fontSize: 13, color: theme.muted }}>{file.type}</div>
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

          {/* CHAT AREA */}
          <div
            style={{
              background: theme.card,
              padding: 20,
              borderRadius: 16,
              border: `1px solid ${theme.border}`,
            }}
          >
            <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 14 }}>
              Client Chat — Redroot Café
            </h2>

            <div style={{ maxHeight: 350, overflowY: "auto", marginBottom: 20 }}>
              {MESSAGES.map((m) => (
                <div
                  key={m.id}
                  style={{
                    marginBottom: 12,
                    display: "flex",
                    justifyContent:
                      m.from === "prod" ? "flex-end" : "flex-start",
                  }}
                >
                  <div
                    style={{
                      maxWidth: "70%",
                      padding: "10px 14px",
                      borderRadius: 14,
                      background:
                        m.from === "prod"
                          ? theme.bubbleProd
                          : theme.bubbleClient,
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
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
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
