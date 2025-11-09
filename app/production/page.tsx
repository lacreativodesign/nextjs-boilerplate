"use client";

import { useState } from "react";
import RequireAuth from "@/components/RequireAuth";

export default function ProductionPage() {
  const [dark, setDark] = useState(true);

  const t = dark
    ? {
        bg: "#0D1527",
        text: "#E2E8F0",
        sidebar: "#0B1220",
        border: "#1E293B",
        card: "#111B2E",
        muted: "#94A3B8",
        accent: "#06B6D4",
      }
    : {
        bg: "#F8FAFC",
        text: "#0F172A",
        sidebar: "#FFFFFF",
        border: "#CBD5E1",
        card: "#FFFFFF",
        muted: "#475569",
        accent: "#06B6D4",
      };

  // Dummy queues
  const queue = [
    { id: "P-8912", client: "Brightwood Publishing", task: "Book Cover Design", status: "In Progress" },
    { id: "P-8721", client: "Hipster Circles", task: "Clothing Mockups", status: "In Review" },
    { id: "P-8123", client: "La Creativo", task: "Animation Draft", status: "Pending" },
  ];

  // Dummy files
  const files = [
    { name: "Logo_rev2.ai", tag: "Revision" },
    { name: "Homepage_DRAFT.fig", tag: "Draft" },
    { name: "VideoStoryboard_final.pdf", tag: "Final" },
    { name: "Social_Banners_pack.zip", tag: "Final" },
  ];

  // Dummy activity
  const activity = [
    { text: "Uploaded draft for Homepage Redesign", time: "2h ago" },
    { text: "Reviewed new storyboard from Video Team", time: "5h ago" },
    { text: "Delivered final files to Brightwood Publishing", time: "Yesterday" },
  ];

  return (
    <RequireAuth allowed={["production"]}>
      <div
        style={{
          display: "flex",
          minHeight: "100vh",
          background: t.bg,
          color: t.text,
          fontFamily: "Inter, sans-serif",
        }}
      >
        {/* SIDEBAR */}
        <aside
          style={{
            width: 240,
            background: t.sidebar,
            borderRight: `1px solid ${t.border}`,
            padding: "28px 18px",
          }}
        >
          <div style={{ fontSize: 22, fontWeight: 900, marginBottom: 30, color: t.accent }}>
            PRODUCTION
          </div>

          {[
            "Overview",
            "Task Queue",
            "Files",
            "Activity",
            "Reports",
            "Profile",
          ].map((item) => (
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
              background: "transparent",
              borderRadius: 10,
              border: `1px solid ${t.border}`,
              cursor: "pointer",
              color: t.text,
            }}
          >
            {dark ? "Light Mode" : "Dark Mode"}
          </button>
        </aside>

        {/* MAIN CONTENT */}
        <main style={{ flex: 1, padding: 32 }}>
          <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 20 }}>Production Overview</h1>

          {/* TASK QUEUE */}
          <div
            style={{
              background: t.card,
              border: `1px solid ${t.border}`,
              borderRadius: 16,
              padding: 20,
              marginBottom: 24,
            }}
          >
            <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 12 }}>Task Queue</h2>
            {queue.map((q) => (
              <div
                key={q.id}
                style={{
                  padding: "12px 0",
                  borderBottom: `1px solid ${t.border}`,
                  display: "flex",
                  justifyContent: "space-between",
                }}
              >
                <div>
                  <div style={{ fontWeight: 700 }}>{q.task}</div>
                  <div style={{ fontSize: 13, color: t.muted }}>
                    {q.id} • {q.client}
                  </div>
                </div>
                <span
                  style={{
                    padding: "4px 12px",
                    borderRadius: 999,
                    border: `1px solid ${t.border}`,
                    color:
                      q.status === "In Progress"
                        ? "#06B6D4"
                        : q.status === "In Review"
                        ? "#F97316"
                        : "#94A3B8",
                    fontSize: 12,
                  }}
                >
                  {q.status}
                </span>
              </div>
            ))}
          </div>

          {/* FILES */}
          <div
            style={{
              background: t.card,
              border: `1px solid ${t.border}`,
              borderRadius: 16,
              padding: 20,
              marginBottom: 24,
            }}
          >
            <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 12 }}>Latest Files</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 12 }}>
              {files.map((f, i) => (
                <div
                  key={i}
                  style={{
                    padding: 14,
                    borderRadius: 12,
                    border: `1px solid ${t.border}`,
                    background: dark ? "#0E192E" : "#ffffff",
                  }}
                >
                  <div style={{ fontWeight: 700 }}>{f.name}</div>
                  <div style={{ fontSize: 12, marginTop: 4, color: t.muted }}>{f.tag}</div>
                </div>
              ))}
            </div>
          </div>

          {/* ACTIVITY */}
          <div
            style={{
              background: t.card,
              border: `1px solid ${t.border}`,
              borderRadius: 16,
              padding: 20,
              marginBottom: 24,
            }}
          >
            <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 12 }}>Recent Activity</h2>
            {activity.map((a, i) => (
              <div
                key={i}
                style={{
                  padding: "10px 0",
                  borderBottom: `1px solid ${t.border}`,
                }}
              >
                <div style={{ fontWeight: 600 }}>{a.text}</div>
                <div style={{ fontSize: 12, color: t.muted }}>{a.time}</div>
              </div>
            ))}
          </div>
        </main>
      </div>
    </RequireAuth>
  );
          }
