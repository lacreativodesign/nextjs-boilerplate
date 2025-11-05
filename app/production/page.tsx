"use client";

import React, { useState } from "react";

export default function ProductionDashboard() {
  const [dark, setDark] = useState(false);

  const theme = {
    bg: dark ? "#0A0F1C" : "#F4F7FB",
    sidebar: dark ? "#0E1629" : "#FFFFFF",
    card: dark ? "#111C34" : "#FFFFFF",
    border: dark ? "rgba(255,255,255,0.09)" : "rgba(0,0,0,0.08)",
    text: dark ? "#E7ECF3" : "#0F172A",
    muted: dark ? "#9AA8BC" : "#6B7280",
    brand: "#06B6D4",
    accent: "#6366F1",
  };

  const projects = [
    {
      id: "PR-001",
      name: "Website Redesign – Falcon Motors",
      status: "Draft Submitted",
      progress: 55,
      chat: [
        { from: "am", msg: "Hey team, client approved the new homepage layout.", time: "10:18 AM" },
        { from: "prod", msg: "Got it. Working on the revisions now.", time: "10:22 AM" },
      ],
    },
    {
      id: "PR-002",
      name: "Brand Identity – SilverOak Properties",
      status: "In Revisions",
      progress: 72,
      chat: [
        { from: "am", msg: "Need 2 more logo variations.", time: "Yesterday" },
        { from: "prod", msg: "Uploading shortly!", time: "Yesterday" },
      ],
    },
  ];

  const [selected, setSelected] = useState(projects[0]);
  const [newMsg, setNewMsg] = useState("");

  function sendMessage() {
    if (!newMsg.trim()) return;

    const updated = {
      ...selected,
      chat: [...selected.chat, { from: "prod", msg: newMsg, time: "Just now" }],
    };

    setSelected(updated);
    setNewMsg("");
  }

  return (
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
          padding: "26px 18px",
          borderRight: `1px solid ${theme.border}`,
        }}
      >
        <div style={{ fontSize: 22, fontWeight: 900, color: theme.brand, marginBottom: 28 }}>
          PRODUCTION
        </div>

        {["Overview", "Queue", "Projects", "Files", "Activity", "Reports"].map((item) => (
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
            borderRadius: 10,
            border: `1px solid ${theme.border}`,
            background: "transparent",
            cursor: "pointer",
            color: theme.text,
          }}
        >
          {dark ? "Light Mode" : "Dark Mode"}
        </button>
      </aside>

      {/* MAIN AREA */}
      <main style={{ flex: 1, padding: 32 }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 20 }}>Project Queue</h1>

        {/* PROJECT LIST */}
        <div style={{ display: "flex", gap: 24 }}>
          {/* LEFT LIST */}
          <div
            style={{
              width: "35%",
              background: theme.card,
              padding: 20,
              borderRadius: 16,
              border: `1px solid ${theme.border}`,
              height: "80vh",
              overflowY: "auto",
            }}
          >
            {projects.map((p) => (
              <div
                key={p.id}
                onClick={() => setSelected(p)}
                style={{
                  padding: "14px 12px",
                  borderBottom: `1px solid ${theme.border}`,
                  marginBottom: 10,
                  cursor: "pointer",
                }}
              >
                <div style={{ fontWeight: 700 }}>{p.name}</div>
                <div style={{ fontSize: 13, color: theme.muted }}>
                  {p.status} • {p.progress}% complete
                </div>
              </div>
            ))}
          </div>

          {/* RIGHT DETAILS */}
          <div
            style={{
              flex: 1,
              background: theme.card,
              padding: 20,
              borderRadius: 16,
              border: `1px solid ${theme.border}`,
              display: "flex",
              flexDirection: "column",
              height: "80vh",
            }}
          >
            <h2 style={{ fontSize: 22, marginBottom: 8 }}>{selected.name}</h2>
            <div style={{ fontSize: 14, color: theme.muted, marginBottom: 20 }}>
              {selected.status} • {selected.progress}% complete
            </div>

            {/* CHAT AREA */}
            <div
              style={{
                flex: 1,
                overflowY: "auto",
                paddingRight: 12,
                marginBottom: 12,
              }}
            >
              {selected.chat.map((c, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    justifyContent: c.from === "prod" ? "flex-end" : "flex-start",
                    marginBottom: 12,
                  }}
                >
                  <div
                    style={{
                      maxWidth: "70%",
                      padding: "12px 16px",
                      borderRadius: 16,
                      background: c.from === "prod" ? theme.brand : theme.accent,
                      color: "#fff",
                      fontSize: 14,
                      lineHeight: 1.4,
                    }}
                  >
                    {c.msg}
                    <div style={{ fontSize: 11, opacity: 0.8, marginTop: 4 }}>{c.time}</div>
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
                paddingTop: 10,
              }}
            >
              <input
                value={newMsg}
                onChange={(e) => setNewMsg(e.target.value)}
                placeholder="Write a message..."
                style={{
                  flex: 1,
                  padding: "12px 14px",
                  borderRadius: 10,
                  border: `1px solid ${theme.border}`,
                  background: dark ? "#101A30" : "#fff",
                  color: theme.text,
                }}
              />

              <button
                onClick={sendMessage}
                style={{
                  padding: "12px 20px",
                  background: theme.brand,
                  color: "#fff",
                  borderRadius: 10,
                  border: "none",
                  cursor: "pointer",
                  fontWeight: 700,
                }}
              >
                Send
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
