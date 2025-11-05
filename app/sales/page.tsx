"use client";

import React, { useMemo, useState } from "react";
import RequireAuth from "@/components/RequireAuth";

/** ===== Theme hook (local, same 2025 aesthetic) ===== */
function useTheme(defaultDark = true) {
  const [dark, setDark] = useState(defaultDark);
  const t = useMemo(
    () => ({
      dark,
      setDark,
      bg: dark ? "#070F22" : "#F5F7FB",
      text: dark ? "#E8EEF7" : "#0F172A",
      muted: dark ? "#91A0B4" : "#64748B",
      border: dark ? "rgba(255,255,255,.08)" : "rgba(15,23,42,.10)",
      card: dark ? "rgba(16,28,56,.78)" : "rgba(255,255,255,.92)",
      sidebar: dark ? "rgba(12,22,44,.86)" : "#FFFFFF",
      brand: "#06B6D4",
      accent: "#6366F1",
      ok: "#10B981",
      warn: "#F59E0B",
      danger: "#EF4444",
      bubbleMe: dark ? "#0EA5E9" : "#0EA5E9",
      bubbleThem: dark ? "#111827" : "#E5E7EB",
      radius: 16,
      shadow: dark
        ? "0 30px 80px rgba(2,6,23,.55)"
        : "0 30px 80px rgba(2,6,23,.12)",
    }),
    [dark]
  );
  return t;
}

/** ===== Dummy data (stable) ===== */
const LEADS = [
  { id: "L-1001", name: "Redroot Café", source: "Website", stage: "Qualified", owner: "Ayesha", value: 1800, age: "3d" },
  { id: "L-1002", name: "Northbridge Law", source: "LinkedIn", stage: "Discovery", owner: "Hamza", value: 4200, age: "1d" },
  { id: "L-1003", name: "Evercrest Fitness", source: "Referral", stage: "Proposal", owner: "Ali", value: 5900, age: "5d" },
  { id: "L-1004", name: "Seabrook Dental", source: "Cold Email", stage: "Won", owner: "Sara", value: 2400, age: "7d" },
];

const PIPELINE = [
  { stage: "New", count: 24, amount: 18000 },
  { stage: "Qualified", count: 12, amount: 24000 },
  { stage: "Discovery", count: 8, amount: 19500 },
  { stage: "Proposal", count: 6, amount: 31000 },
  { stage: "Won", count: 5, amount: 22800 },
];

const ACTIVITY = [
  { id: 1, who: "Ayesha", what: "Logged call with Redroot Café", when: "Today 10:12" },
  { id: 2, who: "Hamza", what: "Sent proposal to Northbridge Law", when: "Yesterday 18:22" },
  { id: 3, who: "Sara", what: "Closed Won — Seabrook Dental", when: "Yesterday 13:04" },
  { id: 4, who: "Ali", what: "Qualified lead Evercrest Fitness", when: "Mon 09:15" },
];

/** ===== Sales Dashboard (Locked 2025) ===== */
export default function SalesPage() {
  const t = useTheme(true);
  const [search, setSearch] = useState("");

  const filtered = LEADS.filter(
    (l) =>
      l.name.toLowerCase().includes(search.toLowerCase()) ||
      l.id.toLowerCase().includes(search.toLowerCase()) ||
      l.owner.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <RequireAuth allowed={["sales", "admin"]}>
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          background: t.bg,
          color: t.text,
          fontFamily: "Inter, ui-sans-serif, system-ui",
        }}
      >
        {/* SIDEBAR */}
        <aside
          style={{
            width: 240,
            background: t.sidebar,
            borderRight: `1px solid ${t.border}`,
            padding: "26px 18px",
            position: "sticky",
            top: 0,
            height: "100vh",
          }}
        >
          <div
            style={{
              fontSize: 22,
              fontWeight: 900,
              marginBottom: 22,
              color: t.brand,
              letterSpacing: -0.3,
            }}
          >
            SALES PORTAL
          </div>

          {[
            "Overview",
            "Leads",
            "Pipeline",
            "Opportunities",
            "Activity",
            "Reports",
            "Profile",
          ].map((item) => (
            <div
              key={item}
              style={{
                padding: "10px 12px",
                marginBottom: 6,
                borderRadius: 10,
                cursor: "pointer",
                color: t.muted,
                fontWeight: 600,
              }}
            >
              {item}
            </div>
          ))}

          <button
            onClick={() => t.setDark?.(!t.dark)}
            style={{
              marginTop: 22,
              width: "100%",
              padding: "10px 12px",
              borderRadius: 12,
              border: `1px solid ${t.border}`,
              background: "transparent",
              color: t.text,
              cursor: "pointer",
            }}
          >
            {t.dark ? "Light Mode" : "Dark Mode"}
          </button>
        </aside>

        {/* MAIN */}
        <main style={{ flex: 1, padding: 28 }}>
          {/* Top bar */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              marginBottom: 18,
              justifyContent: "space-between",
            }}
          >
            <div style={{ fontSize: 26, fontWeight: 800 }}>Leads & Pipeline</div>
            <div style={{ display: "flex", gap: 10 }}>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search leads, owners, IDs…"
                style={{
                  padding: "10px 12px",
                  border: `1px solid ${t.border}`,
                  borderRadius: 12,
                  background: t.dark ? "#0B1530" : "#FFFFFF",
                  color: t.text,
                  width: 260,
                }}
              />
              <button
                style={{
                  padding: "10px 14px",
                  borderRadius: 12,
                  border: "none",
                  background: t.brand,
                  color: "#fff",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                + New Lead
              </button>
            </div>
          </div>

          {/* KPIs */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, minmax(0,1fr))",
              gap: 14,
              marginBottom: 18,
            }}
          >
            <KPI t={t} label="Open Leads" value="50" delta="+8 this week" />
            <KPI t={t} label="Pipeline (USD)" value="$115,300" delta="+$9,200" />
            <KPI t={t} label="Win Rate" value="28%" delta="+2.4%" />
            <KPI t={t} label="Avg. Cycle" value="14 days" delta="-1.2d" />
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1.2fr .8fr",
              gap: 14,
            }}
          >
            {/* Leads table */}
            <Card t={t}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 10,
                }}
              >
                <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>Active Leads</h2>
                <button
                  style={{
                    border: "none",
                    background: "transparent",
                    color: t.accent,
                    cursor: "pointer",
                    fontWeight: 700,
                  }}
                >
                  Export CSV
                </button>
              </div>

              <div
                style={{
                  border: `1px solid ${t.border}`,
                  borderRadius: 12,
                  overflow: "hidden",
                }}
              >
                <table
                  style={{
                    width: "100%",
                    borderCollapse: "collapse",
                    fontSize: 14,
                  }}
                >
                  <thead
                    style={{
                      background: t.dark ? "rgba(255,255,255,.03)" : "#F8FAFC",
                      color: t.muted,
                      textAlign: "left",
                    }}
                  >
                    <tr>
                      {["ID", "Company", "Source", "Stage", "Owner", "Value", "Age"].map(
                        (h) => (
                          <th
                            key={h}
                            style={{ padding: "10px 12px", borderBottom: `1px solid ${t.border}` }}
                          >
                            {h}
                          </th>
                        )
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((l) => (
                      <tr key={l.id} style={{ borderBottom: `1px solid ${t.border}` }}>
                        <td style={{ padding: "10px 12px" }}>{l.id}</td>
                        <td style={{ padding: "10px 12px", fontWeight: 600 }}>{l.name}</td>
                        <td style={{ padding: "10px 12px", color: t.muted }}>{l.source}</td>
                        <td style={{ padding: "10px 12px" }}>
                          <Badge t={t} tone={stageTone(l.stage)}>
                            {l.stage}
                          </Badge>
                        </td>
                        <td style={{ padding: "10px 12px" }}>{l.owner}</td>
                        <td style={{ padding: "10px 12px" }}>${l.value.toLocaleString()}</td>
                        <td style={{ padding: "10px 12px", color: t.muted }}>{l.age}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            {/* Pipeline + Activity */}
            <div style={{ display: "grid", gap: 14 }}>
              <Card t={t}>
                <h2 style={{ fontSize: 18, fontWeight: 800, margin: "0 0 8px 0" }}>
                  Pipeline Summary
                </h2>
                <div style={{ fontSize: 13, color: t.muted, marginBottom: 8 }}>
                  Stage counts & weighted amounts
                </div>

                {/* Simple bar view */}
                <div style={{ display: "grid", gap: 10 }}>
                  {PIPELINE.map((p) => (
                    <div key={p.stage}>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          fontSize: 13,
                          marginBottom: 6,
                        }}
                      >
                        <span style={{ color: t.muted }}>{p.stage}</span>
                        <span style={{ fontWeight: 700 }}>
                          {p.count} • ${p.amount.toLocaleString()}
                        </span>
                      </div>
                      <div
                        style={{
                          height: 10,
                          background: t.dark ? "#0E1A33" : "#E5E7EB",
                          borderRadius: 999,
                          overflow: "hidden",
                          border: `1px solid ${t.border}`,
                        }}
                      >
                        <div
                          style={{
                            width: `${Math.min(100, (p.amount / 31000) * 100)}%`,
                            height: "100%",
                            background:
                              p.stage === "Won"
                                ? t.ok
                                : p.stage === "Proposal"
                                ? t.accent
                                : t.brand,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </Card>

              <Card t={t}>
                <h2 style={{ fontSize: 18, fontWeight: 800, margin: "0 0 8px 0" }}>
                  Recent Activity
                </h2>
                <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                  {ACTIVITY.map((a) => (
                    <li
                      key={a.id}
                      style={{
                        padding: "10px 0",
                        borderBottom: `1px solid ${t.border}`,
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 12,
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 700 }}>{a.who}</div>
                        <div style={{ color: t.muted, fontSize: 13 }}>{a.what}</div>
                      </div>
                      <div style={{ color: t.muted, fontSize: 12 }}>{a.when}</div>
                    </li>
                  ))}
                </ul>
              </Card>
            </div>
          </div>
        </main>
      </div>
    </RequireAuth>
  );
}

/** ===== Small UI bits ===== */
function Card({
  t,
  children,
}: {
  t: ReturnType<typeof useTheme>;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        background: t.card,
        border: `1px solid ${t.border}`,
        borderRadius: t.radius,
        boxShadow: t.shadow,
        padding: 16,
      }}
    >
      {children}
    </div>
  );
}

function KPI({
  t,
  label,
  value,
  delta,
}: {
  t: ReturnType<typeof useTheme>;
  label: string;
  value: string;
  delta: string;
}) {
  return (
    <div
      style={{
        background: t.card,
        border: `1px solid ${t.border}`,
        borderRadius: t.radius,
        boxShadow: t.shadow,
        padding: 16,
      }}
    >
      <div style={{ color: t.muted, fontSize: 12, marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 900, letterSpacing: -0.2 }}>{value}</div>
      <div style={{ fontSize: 12, color: t.ok, marginTop: 4 }}>{delta}</div>
    </div>
  );
}

function Badge({
  t,
  children,
  tone = "neutral",
}: {
  t: ReturnType<typeof useTheme>;
  children: React.ReactNode;
  tone?: "neutral" | "good" | "warn" | "bad";
}) {
  const bg =
    tone === "good" ? "rgba(16,185,129,.18)" : tone === "warn"
      ? "rgba(245,158,11,.18)"
      : tone === "bad"
      ? "rgba(239,68,68,.18)"
      : t.dark ? "rgba(255,255,255,.08)" : "rgba(15,23,42,.06)";
  const col =
    tone === "good" ? "#10B981" : tone === "warn"
      ? "#F59E0B"
      : tone === "bad"
      ? "#EF4444"
      : t.muted;

  return (
    <span
      style={{
        display: "inline-block",
        padding: "6px 10px",
        borderRadius: 999,
        background: bg,
        color: col,
        fontSize: 12,
        fontWeight: 700,
      }}
    >
      {children}
    </span>
  );
}

function stageTone(stage: string): "neutral" | "good" | "warn" | "bad" {
  if (stage === "Won") return "good";
  if (stage === "Proposal" || stage === "Discovery") return "neutral";
  if (stage === "Qualified") return "neutral";
  return "warn";
                         }
