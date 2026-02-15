"use client";

import React from "react";

function SectionWrapper({ title, subtitle, children }: any) {
  return (
    <div
      style={{
        flex: 1,
        minWidth: 320,
        maxWidth: 480,
        borderRadius: 16,
        border: "1px solid #E5E7EB",
        padding: 20,
        background: "#FFFFFF",
        boxShadow: "0 10px 30px rgba(15,23,42,0.06)",
        display: "flex",
        flexDirection: "column",
        gap: 14,
      }}
    >
      <div>
        <h2
          style={{
            fontSize: 18,
            fontWeight: 700,
            marginBottom: 4,
            color: "#0F172A",
          }}
        >
          {title}
        </h2>
        <p style={{ fontSize: 13, color: "#6B7280" }}>{subtitle}</p>
      </div>
      {children}
    </div>
  );
}

function LoginCard({ title, bg, border, buttonBg }: any) {
  return (
    <div
      style={{
        padding: 16,
        borderRadius: 14,
        background: bg,
        border: border,
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <div style={{ fontWeight: 700, fontSize: 14 }}>{title}</div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 6,
          fontSize: 11,
        }}
      >
        <div
          style={{
            padding: "6px 8px",
            borderRadius: 8,
            border: "1px solid rgba(148,163,184,0.7)",
            background: "rgba(15,23,42,0.02)",
          }}
        >
          Email
        </div>
        <div
          style={{
            padding: "6px 8px",
            borderRadius: 8,
            border: "1px solid rgba(148,163,184,0.7)",
            background: "rgba(15,23,42,0.02)",
          }}
        >
          Password
        </div>
      </div>
      <button
        style={{
          marginTop: 4,
          padding: "8px 10px",
          borderRadius: 999,
          border: "none",
          background: buttonBg,
          color: "#FFFFFF",
          fontSize: 11,
          fontWeight: 600,
        }}
      >
        Sign in
      </button>
    </div>
  );
}

function DashboardMini({
  variant,
}: {
  variant: "corporate" | "futuristic" | "minimal" | "agency" | "dark";
}) {
  // Shared base layout: sidebar + topbar + content
  const base: React.CSSProperties = {
    borderRadius: 14,
    overflow: "hidden",
    border: "1px solid rgba(148,163,184,0.4)",
    display: "grid",
    gridTemplateColumns: "96px 1fr",
    height: 180,
    fontSize: 10,
  };

  if (variant === "corporate") {
    return (
      <div
        style={{
          ...base,
          background: "#F3F4F6",
        }}
      >
        {/* Sidebar */}
        <div
          style={{
            background: "#FFFFFF",
            borderRight: "1px solid #E5E7EB",
            padding: 8,
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          <div
            style={{
              height: 24,
              borderRadius: 8,
              background: "#2563EB",
              color: "#FFFFFF",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 600,
            }}
          >
            Admin
          </div>
          <div
            style={{
              height: 22,
              borderRadius: 6,
              background: "#EFF6FF",
              color: "#1D4ED8",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            Sales
          </div>
          <div
            style={{
              height: 22,
              borderRadius: 6,
              background: "#F9FAFB",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#6B7280",
            }}
          >
            HR
          </div>
        </div>

        {/* Main */}
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              height: 30,
              background: "#FFFFFF",
              borderBottom: "1px solid #E5E7EB",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "0 10px",
            }}
          >
            <span style={{ fontWeight: 600, color: "#111827" }}>
              BIZOSTO ERP
            </span>
            <span style={{ fontSize: 10, color: "#6B7280" }}>Admin • v1.0</span>
          </div>
          <div
            style={{
              padding: 8,
              display: "grid",
              gridTemplateColumns: "repeat(3, minmax(0,1fr))",
              gap: 6,
            }}
          >
            {["Revenue", "Utilization", "Active Projects"].map((label) => (
              <div
                key={label}
                style={{
                  borderRadius: 8,
                  background: "#FFFFFF",
                  border: "1px solid #E5E7EB",
                  padding: 6,
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                }}
              >
                <span
                  style={{ fontSize: 9, color: "#6B7280", fontWeight: 500 }}
                >
                  {label}
                </span>
                <span style={{ fontSize: 11, fontWeight: 700, color: "#111827" }}>
                  $128k
                </span>
                <div
                  style={{
                    height: 4,
                    borderRadius: 999,
                    background: "#DBEAFE",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      width: "70%",
                      height: "100%",
                      background: "#2563EB",
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (variant === "futuristic") {
    return (
      <div
        style={{
          ...base,
          background:
            "radial-gradient(circle at top, #22d3ee30, #020617 65%, #000000)",
          border: "1px solid rgba(56,189,248,0.5)",
          boxShadow:
            "0 0 40px rgba(56,189,248,0.45), 0 0 0 1px rgba(15,23,42,0.9)",
        }}
      >
        {/* Sidebar */}
        <div
          style={{
            background: "linear-gradient(to bottom, #020617, #0b1120)",
            borderRight: "1px solid rgba(148,163,184,0.5)",
            padding: 8,
            display: "flex",
            flexDirection: "column",
            gap: 6,
          }}
        >
          {["☰", "📊", "👥", "⚙️"].map((icon, idx) => (
            <div
              key={idx}
              style={{
                height: 26,
                borderRadius: 999,
                background:
                  idx === 1
                    ? "linear-gradient(90deg,#22d3ee,#a855f7)"
                    : "rgba(15,23,42,0.8)",
                color: "#E5E7EB",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 13,
                boxShadow:
                  idx === 1 ? "0 0 15px rgba(56,189,248,0.7)" : "none",
              }}
            >
              {icon}
            </div>
          ))}
        </div>

        {/* Main */}
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              height: 32,
              background:
                "linear-gradient(90deg,rgba(15,23,42,0.65),rgba(15,23,42,0.95))",
              borderBottom: "1px solid rgba(148,163,184,0.4)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "0 10px",
              color: "#E5E7EB",
              fontSize: 10,
            }}
          >
            <span style={{ fontWeight: 600 }}>BIZOSTO • NEBULA PANEL</span>
            <span
              style={{
                padding: "3px 8px",
                borderRadius: 999,
                border: "1px solid rgba(56,189,248,0.7)",
                fontSize: 9,
              }}
            >
              Admin · Online
            </span>
          </div>
          <div
            style={{
              padding: 8,
              display: "grid",
              gridTemplateColumns: "1.4fr 1fr",
              gap: 8,
              color: "#E5E7EB",
            }}
          >
            <div
              style={{
                borderRadius: 10,
                background:
                  "radial-gradient(circle at top left,#22d3ee33,#0f172a)",
                border: "1px solid rgba(56,189,248,0.4)",
                padding: 8,
              }}
            >
              <div
                style={{
                  fontSize: 10,
                  color: "#bae6fd",
                  marginBottom: 6,
                  display: "flex",
                  justifyContent: "space-between",
                }}
              >
                <span>Live Utilization</span>
                <span>72%</span>
              </div>
              <div
                style={{
                  display: "flex",
                  gap: 4,
                  alignItems: "flex-end",
                  height: 55,
                }}
              >
                {[30, 60, 45, 72, 50, 80].map((h, i) => (
                  <div
                    key={i}
                    style={{
                      flex: 1,
                      borderRadius: 999,
                      background:
                        i === 5
                          ? "linear-gradient(#22d3ee,#a855f7)"
                          : "linear-gradient(#0ea5e9,#1d4ed8)",
                      height: `${h}%`,
                      boxShadow:
                        i === 5 ? "0 0 10px rgba(56,189,248,0.8)" : "none",
                    }}
                  />
                ))}
              </div>
            </div>
            <div
              style={{
                borderRadius: 10,
                background: "rgba(15,23,42,0.85)",
                border: "1px solid rgba(148,163,184,0.4)",
                padding: 8,
                display: "flex",
                flexDirection: "column",
                gap: 4,
              }}
            >
              <div style={{ fontSize: 10, color: "#9CA3AF" }}>
                Quick Stats · Last 24h
              </div>
              {[
                ["New Leads", "+34"],
                ["Projects Active", "18"],
                ["On-time Delivery", "96%"],
              ].map(([label, val]) => (
                <div
                  key={label}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: 10,
                  }}
                >
                  <span style={{ color: "#9CA3AF" }}>{label}</span>
                  <span style={{ color: "#E5E7EB", fontWeight: 600 }}>
                    {val}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (variant === "minimal") {
    return (
      <div
        style={{
          ...base,
          background: "#F9FAFB",
          border: "1px solid #E5E7EB",
        }}
      >
        {/* Sidebar */}
        <div
          style={{
            background: "#FFFFFF",
            borderRight: "1px solid #E5E7EB",
            padding: 10,
            display: "flex",
            flexDirection: "column",
            gap: 4,
          }}
        >
          {["Overview", "Projects", "Team", "Reports"].map((label, idx) => (
            <div
              key={label}
              style={{
                fontSize: 10,
                padding: "6px 8px",
                borderRadius: 999,
                background: idx === 0 ? "#EFF6FF" : "transparent",
                color: idx === 0 ? "#1D4ED8" : "#6B7280",
                fontWeight: idx === 0 ? 600 : 500,
              }}
            >
              {label}
            </div>
          ))}
        </div>

        {/* Main */}
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              height: 30,
              background: "#FFFFFF",
              borderBottom: "1px solid #E5E7EB",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "0 12px",
            }}
          >
            <span
              style={{
                fontWeight: 600,
                fontSize: 11,
                color: "#111827",
                letterSpacing: 0.2,
              }}
            >
              BIZOSTO · Admin
            </span>
            <span
              style={{
                padding: "3px 8px",
                borderRadius: 999,
                background: "#F3F4F6",
                fontSize: 9,
                color: "#6B7280",
              }}
            >
              Today · 12:45
            </span>
          </div>
          <div
            style={{
              padding: 10,
              display: "grid",
              gridTemplateColumns: "2fr 1.4fr",
              gap: 10,
            }}
          >
            <div
              style={{
                borderRadius: 10,
                background: "#FFFFFF",
                border: "1px solid #E5E7EB",
                padding: 8,
                display: "flex",
                flexDirection: "column",
                gap: 6,
              }}
            >
              <div
                style={{
                  fontSize: 10,
                  color: "#6B7280",
                  display: "flex",
                  justifyContent: "space-between",
                }}
              >
                <span>Pipeline</span>
                <span>Q4 Snapshot</span>
              </div>
              <div
                style={{
                  display: "flex",
                  gap: 8,
                  alignItems: "center",
                  fontSize: 10,
                }}
              >
                <div
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 999,
                    background: "#3B82F6",
                  }}
                />
                <span>New Leads · 34</span>
              </div>
              <div
                style={{
                  height: 38,
                  borderRadius: 6,
                  background:
                    "linear-gradient(90deg,#DBEAFE,#3B82F6,#1D4ED8)",
                  opacity: 0.8,
                }}
              />
            </div>
            <div
              style={{
                borderRadius: 10,
                background: "#FFFFFF",
                border: "1px solid #E5E7EB",
                padding: 8,
                display: "flex",
                flexDirection: "column",
                gap: 4,
                fontSize: 10,
              }}
            >
              <div style={{ color: "#6B7280" }}>Today&apos;s Focus</div>
              <ul
                style={{
                  margin: 0,
                  paddingLeft: 14,
                  display: "flex",
                  flexDirection: "column",
                  gap: 2,
                }}
              >
                <li>Approve 3 new client proposals</li>
                <li>Review production workload</li>
                <li>Check AM feedback queue</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (variant === "agency") {
    return (
      <div
        style={{
          ...base,
          background:
            "linear-gradient(135deg,#eef2ff 0%,#e0f2fe 45%,#fdf2ff 100%)",
          border: "1px solid rgba(129,140,248,0.5)",
        }}
      >
        {/* Sidebar */}
        <div
          style={{
            background:
              "linear-gradient(180deg,#1f2937,#111827 50%,#0f172a 100%)",
            padding: 10,
            display: "flex",
            flexDirection: "column",
            gap: 10,
            color: "#E5E7EB",
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 700 }}>BIZOSTO</div>
          {["Overview", "Clients", "Projects", "Billing"].map((label, idx) => (
            <div
              key={label}
              style={{
                fontSize: 10,
                padding: "6px 8px",
                borderRadius: 999,
                background:
                  idx === 0
                    ? "linear-gradient(90deg,#6366F1,#22C55E)"
                    : "transparent",
                color: idx === 0 ? "#FFFFFF" : "#9CA3AF",
                fontWeight: idx === 0 ? 600 : 500,
              }}
            >
              {label}
            </div>
          ))}
        </div>

        {/* Main */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            background:
              "radial-gradient(circle at top,#e0e7ff 0,#f9fafb 40%,#ffffff 100%)",
          }}
        >
          <div
            style={{
              height: 30,
              background: "rgba(255,255,255,0.9)",
              borderBottom: "1px solid rgba(209,213,219,0.8)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "0 12px",
            }}
          >
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: "#111827",
                letterSpacing: 0.4,
              }}
            >
              CREATIVE OPERATIONS HUB
            </span>
            <span
              style={{
                fontSize: 10,
                color: "#6B7280",
              }}
            >
              Admin • Studio View
            </span>
          </div>
          <div
            style={{
              padding: 10,
              display: "grid",
              gridTemplateColumns: "1.4fr 1.1fr",
              gap: 8,
            }}
          >
            <div
              style={{
                borderRadius: 14,
                background: "#FFFFFF",
                boxShadow: "0 10px 25px rgba(148,163,184,0.35)",
                padding: 10,
                display: "flex",
                flexDirection: "column",
                gap: 6,
              }}
            >
              <div
                style={{
                  fontSize: 10,
                  color: "#6B7280",
                  display: "flex",
                  justifyContent: "space-between",
                }}
              >
                <span>Live Projects</span>
                <span>12 Active</span>
              </div>
              <div
                style={{
                  display: "flex",
                  gap: 6,
                }}
              >
                {["Branding", "Websites", "Social"].map((label, idx) => (
                  <div
                    key={label}
                    style={{
                      flex: 1,
                      borderRadius: 10,
                      background:
                        idx === 0
                          ? "linear-gradient(135deg,#6366F1,#22C55E)"
                          : idx === 1
                          ? "linear-gradient(135deg,#0EA5E9,#6366F1)"
                          : "linear-gradient(135deg,#EC4899,#F97316)",
                      color: "#FFFFFF",
                      padding: 6,
                      fontSize: 9,
                      display: "flex",
                      flexDirection: "column",
                      gap: 3,
                    }}
                  >
                    <span style={{ fontWeight: 600 }}>{label}</span>
                    <span>4 in progress</span>
                  </div>
                ))}
              </div>
            </div>
            <div
              style={{
                borderRadius: 14,
                background: "#FFFFFF",
                border: "1px solid rgba(209,213,219,0.8)",
                padding: 10,
                display: "flex",
                flexDirection: "column",
                gap: 6,
                fontSize: 10,
              }}
            >
              <div style={{ color: "#6B7280" }}>Client Happiness · Today</div>
              <div
                style={{
                  display: "flex",
                  gap: 6,
                  alignItems: "center",
                }}
              >
                <div
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: "50%",
                    background:
                      "conic-gradient(#22C55E 0 270deg,#E5E7EB 270deg 360deg)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 10,
                    fontWeight: 700,
                    color: "#15803D",
                  }}
                >
                  90%
                </div>
                <div style={{ color: "#6B7280" }}>
                  Most projects are on track and communicated clearly.
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // dark / Vercel style
  return (
    <div
      style={{
        ...base,
        background: "#020617",
        border: "1px solid #111827",
        boxShadow: "0 18px 45px rgba(0,0,0,0.9)",
      }}
    >
      {/* Sidebar */}
      <div
        style={{
          background: "#020617",
          borderRight: "1px solid #111827",
          padding: 10,
          display: "flex",
          flexDirection: "column",
          gap: 6,
          color: "#9CA3AF",
        }}
      >
        <div
          style={{
            fontSize: 11,
            fontWeight: 600,
            marginBottom: 4,
            color: "#F9FAFB",
          }}
        >
          BIZOSTO
        </div>
        {["Overview", "Deployments", "Logs", "Settings"].map((label, idx) => (
          <div
            key={label}
            style={{
              fontSize: 10,
              padding: "6px 8px",
              borderRadius: 6,
              background: idx === 0 ? "#111827" : "transparent",
              color: idx === 0 ? "#F9FAFB" : "#6B7280",
            }}
          >
            {label}
          </div>
        ))}
      </div>

      {/* Main */}
      <div style={{ display: "flex", flexDirection: "column" }}>
        <div
          style={{
            height: 30,
            background: "#020617",
            borderBottom: "1px solid #111827",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 12px",
            color: "#E5E7EB",
            fontSize: 10,
          }}
        >
          <span style={{ fontWeight: 600 }}>Dashboard · Admin</span>
          <span
            style={{
              padding: "3px 8px",
              borderRadius: 999,
              border: "1px solid #1F2937",
              fontSize: 9,
            }}
          >
            Live
          </span>
        </div>
        <div
          style={{
            padding: 10,
            display: "grid",
            gridTemplateColumns: "repeat(3,minmax(0,1fr))",
            gap: 8,
          }}
        >
          {["Requests", "Response Time", "Error Rate"].map((label, idx) => (
            <div
              key={label}
              style={{
                borderRadius: 10,
                background: "#020617",
                border: "1px solid #111827",
                padding: 8,
                color: "#E5E7EB",
                display: "flex",
                flexDirection: "column",
                gap: 4,
              }}
            >
              <span style={{ fontSize: 9, color: "#6B7280" }}>{label}</span>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: "#F9FAFB",
                }}
              >
                {idx === 0 ? "81.2k" : idx === 1 ? "178 ms" : "0.12%"}
              </span>
              <div
                style={{
                  height: 4,
                  borderRadius: 999,
                  background: "#111827",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    width: idx === 2 ? "35%" : "72%",
                    height: "100%",
                    background: "#22C55E",
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function UiPreviewPage() {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#F3F4F6",
        padding: "24px",
        fontFamily: "Inter, system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
      }}
    >
      <h1
        style={{
          fontSize: 22,
          fontWeight: 800,
          marginBottom: 8,
          color: "#0F172A",
        }}
      >
        BIZOSTO ERP · UI Style Preview
      </h1>
      <p
        style={{
          fontSize: 13,
          color: "#6B7280",
          marginBottom: 18,
          maxWidth: 720,
        }}
      >
        These are small visual mocks of how your ERP could look with different
        global themes. We&apos;ll lock one style and then apply it everywhere:
        login, all dashboards, tables, modals, and more.
      </p>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 18,
        }}
      >
        {/* A — Corporate */}
        <SectionWrapper
          title="A · Corporate Enterprise"
          subtitle="Microsoft / AWS style · blue primary, lots of white space, very corporate."
        >
          <LoginCard
            title="Login · Corporate"
            bg="#FFFFFF"
            border="1px solid #E5E7EB"
            buttonBg="#2563EB"
          />
          <DashboardMini variant="corporate" />
        </SectionWrapper>

        {/* B — Futuristic */}
        <SectionWrapper
          title="B · Futuristic 2030"
          subtitle="Glassmorphism, neon edges, shiny gradients. Feels very 2030."
        >
          <LoginCard
            title="Login · Futuristic"
            bg="linear-gradient(135deg,#0f172a,#020617)"
            border="1px solid rgba(56,189,248,0.7)"
            buttonBg="linear-gradient(90deg,#22D3EE,#A855F7)"
          />
          <DashboardMini variant="futuristic" />
        </SectionWrapper>

        {/* C — Minimal */}
        <SectionWrapper
          title="C · Minimal Modern SaaS"
          subtitle="Linear / Notion / Stripe vibes · calm, clean, typography-driven."
        >
          <LoginCard
            title="Login · Minimal"
            bg="#F9FAFB"
            border="1px solid #E5E7EB"
            buttonBg="#3B82F6"
          />
          <DashboardMini variant="minimal" />
        </SectionWrapper>

        {/* D — Premium Agency */}
        <SectionWrapper
          title="D · Premium Creative Agency"
          subtitle="Perfect for BIZOSTO · gradients, soft cards, as if Apple made an agency ERP."
        >
          <LoginCard
            title="Login · Agency"
            bg="linear-gradient(135deg,#EEF2FF,#E0F2FE)"
            border="1px solid rgba(129,140,248,0.6)"
            buttonBg="linear-gradient(90deg,#6366F1,#22C55E)"
          />
          <DashboardMini variant="agency" />
        </SectionWrapper>

        {/* E — Dark Pro */}
        <SectionWrapper
          title="E · Dark Pro (Dev / Vercel style)"
          subtitle="Dark-first, high-contrast, very tech and serious."
        >
          <LoginCard
            title="Login · Dark Pro"
            bg="#020617"
            border="1px solid #111827"
            buttonBg="#FFFFFF"
          />
          <DashboardMini variant="dark" />
        </SectionWrapper>
      </div>
    </div>
  );
}
