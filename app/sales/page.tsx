'use client';

import React, { useMemo, useState } from 'react';
import RequireAuth from '@/components/RequireAuth';

/* ========= THEME ========= */
function useTheme(defaultDark = true) {
  const [dark, setDark] = useState<boolean>(() => {
    if (typeof window === 'undefined') return defaultDark;
    return (localStorage.getItem('lac_theme') ?? (defaultDark ? 'dark' : 'light')) === 'dark';
  });

  const t = useMemo(
    () => ({
      dark,
      setDark: (v: boolean) => {
        setDark(v);
        if (typeof window !== 'undefined') localStorage.setItem('lac_theme', v ? 'dark' : 'light');
      },
      bg: dark ? '#070F22' : '#F5F7FB',
      card: dark ? 'rgba(16,28,56,.72)' : 'rgba(255,255,255,.92)',
      text: dark ? '#E8EEF7' : '#0F172A',
      mut: dark ? '#9AA6B2' : '#64748B',
      border: dark ? 'rgba(255,255,255,.08)' : 'rgba(15,23,42,.08)',
      glowA: 'radial-gradient(50% 40% at 20% 10%, rgba(99,102,241,.18), transparent)',
      glowB: 'radial-gradient(55% 40% at 90% 90%, rgba(6,182,212,.16), transparent)',
      brand: '#06B6D4',
      accent: '#6366F1',
      ok: '#10B981',
      warn: '#F59E0B',
      danger: '#EF4444',
      shadow: dark ? '0 30px 80px rgba(2,6,23,.55)' : '0 30px 80px rgba(2,6,23,.12)',
      radius: 18,
    }),
    [dark]
  );

  return t;
}

/* ========= Dummy Data ========= */
const LEADS = [
  { id: 'LD-0012', name: 'Sarah Lee', service: 'Web Design', budget: 2800, status: 'Hot', source: 'Website' },
  { id: 'LD-0011', name: 'Michael Chen', service: 'Branding', budget: 1500, status: 'Warm', source: 'Instagram' },
  { id: 'LD-0010', name: 'Ravi Kumar', service: 'SEO', budget: 2200, status: 'Cold', source: 'Google' },
];

const PIPELINE = [14, 18, 15, 20, 22, 28, 32, 38];
const CONVERSION = [32, 41, 28, 39, 35, 43];

/* ========= SVG Charts ========= */
function LineChart({ data, w = 500, h = 120, stroke = '#6366F1' }) {
  const max = Math.max(...data, 1);
  const step = data.length > 1 ? w / (data.length - 1) : w;
  const pts = data.map((v, i) => `${i * step},${h - (v / max) * (h - 10)}`).join(' ');

  return (
    <svg width={w} height={h}>
      <polyline fill="none" stroke={stroke} strokeWidth="2.4" points={pts} strokeLinecap="round" />
      {data.map((v, i) => (
        <circle key={i} cx={i * step} cy={h - (v / max) * (h - 10)} r={3} fill={stroke} />
      ))}
    </svg>
  );
}

function BarChart({ values, labels, w = 350, h = 120, color = '#06B6D4' }) {
  const max = Math.max(...values, 1);
  const gap = 10;
  const bw = Math.max(16, w / values.length - gap);

  return (
    <svg width={w} height={h}>
      {values.map((v, i) => {
        const hVal = (v / max) * (h - 26);
        const x = i * (bw + gap) + 10;
        return (
          <g key={i}>
            <rect x={x} y={h - hVal - 20} width={bw} height={hVal} rx={6} fill={color} />
            <text x={x + bw / 2} y={h - 6} textAnchor="middle" fontSize={10} fill="#94A3B8">
              {labels[i]}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/* ========= Helpers ========= */
function Card({ t, children, style }) {
  return (
    <div
      style={{
        background: t.card,
        border: `1px solid ${t.border}`,
        borderRadius: 18,
        padding: 16,
        boxShadow: t.shadow,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

const currency = (n) => '$' + n.toLocaleString();

/* ========= SALES DASHBOARD PAGE ========= */
export default function SalesPage() {
  const t = useTheme(true);
  const [tab, setTab] = useState('overview');
  const [search, setSearch] = useState('');

  const filtered = LEADS.filter((l) =>
    [l.id, l.name, l.service, l.status, l.source].join(' ').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <RequireAuth allowed={['sales', 'admin']}>
      <div style={{ minHeight: '100vh', background: `${t.bg}, ${t.glowA}, ${t.glowB}`, display: 'flex', color: t.text }}>
        {/* SIDEBAR */}
        <aside
          style={{
            width: 260,
            padding: 20,
            background: t.dark ? '#071127' : '#ffffff',
            borderRight: `1px solid ${t.border}`,
          }}
        >
          <div style={{ fontWeight: 900, marginBottom: 20, color: t.brand }}>Sales Dashboard</div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <span style={{ fontSize: 12, color: t.mut }}>Theme</span>
            <input type="checkbox" checked={t.dark} onChange={(e) => t.setDark(e.target.checked)} />
          </label>

          <nav style={{ display: 'grid', gap: 6 }}>
            {['overview', 'leads', 'pipeline', 'reports', 'profile'].map((key) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                style={{
                  textAlign: 'left',
                  padding: '10px 12px',
                  borderRadius: 12,
                  border: 0,
                  cursor: 'pointer',
                  background: tab === key ? (t.dark ? '#0b1b2b' : '#eef2ff') : 'transparent',
                  fontWeight: 700,
                  color: tab === key ? t.text : t.mut,
                }}
              >
                {key[0].toUpperCase() + key.slice(1)}
              </button>
            ))}
          </nav>
        </aside>

        {/* MAIN */}
        <main style={{ flex: 1, padding: 28 }}>
          {/* TOP BAR */}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search leads…"
                style={{
                  padding: '10px 14px',
                  borderRadius: 12,
                  border: `1px solid ${t.border}`,
                  background: t.card,
                  color: t.text,
                }}
              />
              <span style={{ fontSize: 12, color: t.mut }}>LAC-SALES-LOCKED-2025.10.24-v1.0</span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 42, height: 42, borderRadius: 12, background: t.card, border: `1px solid ${t.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                👤
              </div>
              <div>
                <div style={{ fontWeight: 800 }}>Sales Rep</div>
                <div style={{ fontSize: 12, color: t.mut }}>Lead Access</div>
              </div>
            </div>
          </div>

          {/* TABS */}
          {tab === 'overview' && (
            <section>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14 }}>
                <Card t={t}>
                  <h4 style={{ marginTop: 0 }}>Monthly Quota</h4>
                  <div style={{ fontSize: 26, fontWeight: 900 }}>{currency(20000)}</div>
                  <div style={{ fontSize: 13, color: t.mut }}>Target</div>
                </Card>

                <Card t={t}>
                  <h4 style={{ marginTop: 0 }}>Closed This Month</h4>
                  <div style={{ fontSize: 26, fontWeight: 900, color: t.ok }}>{currency(15800)}</div>
                  <div style={{ fontSize: 13, color: t.mut }}>79% of quota</div>
                </Card>

                <Card t={t}>
                  <h4 style={{ marginTop: 0 }}>Conversion Rate</h4>
                  <div style={{ fontSize: 26, fontWeight: 900 }}>{Math.round(0.27 * 100)}%</div>
                  <div style={{ fontSize: 13, color: t.mut }}>Across all leads</div>
                </Card>
              </div>

              <div style={{ marginTop: 20 }}>
                <Card t={t}>
                  <h3 style={{ marginTop: 0 }}>Pipeline Trend</h3>
                  <LineChart data={PIPELINE} w={650} h={140} stroke={t.accent} />
                </Card>
              </div>
            </section>
          )}

          {tab === 'leads' && (
            <section>
              <h2 style={{ marginTop: 0 }}>Leads</h2>
              <Card t={t}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${t.border}`, color: t.mut, fontSize: 12 }}>
                      <th style={{ padding: 8 }}>ID</th>
                      <th style={{ padding: 8 }}>Name</th>
                      <th style={{ padding: 8 }}>Service</th>
                      <th style={{ padding: 8 }}>Budget</th>
                      <th style={{ padding: 8 }}>Status</th>
                      <th style={{ padding: 8 }}>Source</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((l) => (
                      <tr key={l.id} style={{ borderBottom: `1px dashed ${t.border}` }}>
                        <td style={{ padding: 8, fontWeight: 800 }}>{l.id}</td>
                        <td style={{ padding: 8 }}>{l.name}</td>
                        <td style={{ padding: 8 }}>{l.service}</td>
                        <td style={{ padding: 8 }}>{currency(l.budget)}</td>
                        <td style={{ padding: 8, color: l.status === 'Hot' ? t.ok : l.status === 'Warm' ? t.warn : t.mut }}>{l.status}</td>
                        <td style={{ padding: 8 }}>{l.source}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            </section>
          )}

          {tab === 'pipeline' && (
            <section>
              <h2 style={{ marginTop: 0 }}>Pipeline Analytics</h2>
              <Card t={t}>
                <BarChart values={CONVERSION} labels={['W1', 'W2', 'W3', 'W4', 'W5', 'W6']} w={520} h={120} color={t.brand} />
              </Card>
            </section>
          )}

          {tab === 'reports' && (
            <section>
              <h2 style={{ marginTop: 0 }}>Reports</h2>
              <Card t={t}>
                <p style={{ color: t.mut }}>Export CSV reports (connect Firestore later)</p>
                <button
                  onClick={() => alert('Demo — CSV export')}
                  style={{
                    padding: '10px 12px',
                    borderRadius: 12,
                    background: t.brand,
                    color: '#fff',
                    border: 0,
                    fontWeight: 800,
                  }}
                >
                  Export Leads CSV
                </button>
              </Card>
            </section>
          )}

          {tab === 'profile' && (
            <section>
              <h2 style={{ marginTop: 0 }}>Profile</h2>
              <Card t={t}>
                <p style={{ color: t.mut, marginTop: 0 }}>Sales Rep Profile (image upload + password change later)</p>
                <div style={{ maxWidth: 500, display: 'grid', gap: 14 }}>
                  <Input t={t} label="Name" placeholder="Sales Rep" />
                  <Input t={t} label="Email" placeholder="you@company.com" />
                  <button
                    onClick={() => alert('Demo save')}
                    style={{
                      padding: '10px 12px',
                      borderRadius: 12,
                      background: t.brand,
                      color: '#fff',
                      border: 0,
                      fontWeight: 800,
                    }}
                  >
                    Save Changes
                  </button>
                </div>
              </Card>
            </section>
          )}
        </main>
      </div>
    </RequireAuth>
  );
}

/* ========= Input Component ========= */
function Input({ t, label, placeholder }) {
  return (
    <div>
      <label style={{ fontSize: 12, color: t.mut }}>{label}</label>
      <input
        placeholder={placeholder}
        style={{
          width: '100%',
          marginTop: 6,
          padding: '12px 12px',
          borderRadius: 12,
          border: `1px solid ${t.border}`,
          background: t.dark ? '#0b1b2b' : '#fff',
          color: t.text,
          outline: 'none',
        }}
      />
    </div>
  );
    }  return (
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
          Project Management
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

          {projects.map((p) => (
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
            {messages.map((m) => (
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
                      m.from === "am"
                        ? theme.bubbleAM
                        : theme.bubbleClient,
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
  );
}
