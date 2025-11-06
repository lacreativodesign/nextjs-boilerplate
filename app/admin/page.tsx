export const dynamic = "force-dynamic";
"use client";

import React, { useEffect, useState, useMemo } from "react";
import RequireAuth from "@/components/RequireAuth";
import { watchProjects } from "@/lib/data";

/** ========= THEME HOOK (2025 aesthetic) ========= */
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
      glowA: 'radial-gradient(50% 40% at 15% 10%, rgba(99,102,241,.14), transparent)',
      glowB: 'radial-gradient(55% 40% at 85% 90%, rgba(6,182,212,.16), transparent)',
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

/** ========= DUMMY DATA (replace with Firestore later) ========= */
const KPI = {
  revenueYTD: 482000,
  margin: 0.41,
  actives: 27,
  overdue: 3,
};

const PROJECTS = [
  { id: 'LC-0007', title: 'E-Commerce Revamp', client: 'Acme Co', am: 'Nadia', status: 'Review', budget: 18000, progress: 72 },
  { id: 'LC-0006', title: 'Logo + Brand Kit', client: 'Bistro Ltd', am: 'Farhan', status: 'Planning', budget: 4500, progress: 10 },
  { id: 'LC-0005', title: 'SEO — Fintech', client: 'Fintech Inc', am: 'Nadia', status: 'In Dev', budget: 9000, progress: 55 },
  { id: 'LC-0004', title: 'Landing Page', client: 'Moda', am: 'Sara', status: 'Delivered', budget: 3200, progress: 100 },
];

const TEAM = [
  { name: 'Zain (Sales)', kpi: { quota: 20000, closed: 15800, conv: 0.27 } },
  { name: 'Nadia (AM)', kpi: { portfolio: 12, health: 0.86, csat: 4.7 } },
  { name: 'Ali (Prod)', kpi: { tasks: 38, onTime: 0.91, bugs: 3 } },
];

const ACTIVITY = [
  { t: '2025-11-03 10:41', who: 'Nadia', what: 'Moved LC-0007 → Review', ref: 'LC-0007' },
  { t: '2025-11-03 09:05', who: 'Zain', what: 'Added new lead (paid) → LC-0008', ref: 'LC-0008' },
  { t: '2025-11-02 17:20', who: 'Ali', what: 'Uploaded Draft v2 on LC-0005', ref: 'LC-0005' },
];

/** ========= SMALL SVG CHARTS ========= */
function LineChart({ data, w = 520, h = 120, stroke = '#6366F1' }) {
  const max = Math.max(1, ...data);
  const step = data.length > 1 ? w / (data.length - 1) : w;
  const pts = data.map((v, i) => `${i * step},${h - (v / max) * (h - 10)}`).join(' ');
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      <polyline fill="none" stroke={stroke} strokeWidth="2.5" points={pts} strokeLinecap="round" strokeLinejoin="round" />
      {data.map((v, i) => (
        <circle key={i} cx={i * step} cy={h - (v / max) * (h - 10)} r={3.3} fill={stroke} />
      ))}
    </svg>
  );
}

function BarChart({ labels, values, w = 360, h = 120, color = '#06B6D4' }) {
  const max = Math.max(1, ...values);
  const gap = 10;
  const bw = Math.max(16, w / values.length - gap);
  return (
    <svg width={w} height={h}>
      {values.map((v, i) => {
        const x = i * (bw + gap) + 8;
        const barH = (v / max) * (h - 26);
        return (
          <g key={i}>
            <rect x={x} y={h - barH - 20} width={bw} height={barH} rx={6} fill={color} />
            <text x={x + bw / 2} y={h - 6} fontSize="10" textAnchor="middle" fill="#94A3B8">
              {labels[i]}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function Donut({ values, colors, size = 140 }) {
  const total = values.reduce((s, v) => s + v, 0) || 1;
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 8;
  let angle = -90;

  return (
    <svg width={size} height={size}>
      {values.map((v, i) => {
        const slice = (v / total) * 360;
        const a1 = (angle * Math.PI) / 180;
        const a2 = ((angle + slice) * Math.PI) / 180;
        const x1 = cx + r * Math.cos(a1);
        const y1 = cy + r * Math.sin(a1);
        const x2 = cx + r * Math.cos(a2);
        const y2 = cy + r * Math.sin(a2);
        const large = slice > 180 ? 1 : 0;
        angle += slice;
        return <path key={i} d={`M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`} fill={colors[i % colors.length]} />;
      })}
      <circle cx={cx} cy={cy} r={r * 0.56} fill="#fff" />
    </svg>
  );
}

/** ========= HELPERS ========= */
const currency = (n) => '$' + (n || 0).toLocaleString();

function exportCSV(rows, filename = 'export.csv') {
  if (!rows?.length) return;
  const headers = Object.keys(rows[0]);
  const data = [headers, ...rows.map((r) => headers.map((h) => String(r[h] ?? '')))];
  const csv = data.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** ========= ADMIN PAGE (LOCKED 2025) ========= */
export default function AdminPage() {
  const t = useTheme(true);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState('overview');

  const lineSeries = [14, 18, 16, 22, 21, 26, 25, 29, 33, 31, 36, 40];
  const barLabels = ['W1', 'W2', 'W3', 'W4', 'W5', 'W6'];
  const barValues = [5, 7, 6, 9, 8, 10];
  const donutVals = [48, 32, 20];

  const filtered = useMemo(
    () => PROJECTS.filter((p) => [p.id, p.title, p.client, p.am].join(' ').toLowerCase().includes(search.toLowerCase())),
    [search]
  );

  return (
    <RequireAuth allowed={['admin']}>
      <div
        style={{
          minHeight: '100vh',
          background: `${t.bg}, ${t.glowA}, ${t.glowB}`,
          color: t.text,
          display: 'flex',
        }}
      >
        {/* SIDEBAR */}
        <aside
          style={{
            width: 280,
            padding: 20,
            borderRight: `1px solid ${t.border}`,
            background: t.dark ? 'linear-gradient(180deg,#071127,#071a2a)' : 'linear-gradient(180deg,#ffffff,#f1f5f9)',
          }}
        >
          <div style={{ fontWeight: 900, letterSpacing: -0.4, color: t.brand, fontSize: 18, marginBottom: 12 }}>LA CREATIVO — Admin</div>

          {/* Theme Toggle */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <div style={{ fontSize: 12, color: t.mut }}>Theme</div>
            <label style={{ position: 'relative', width: 60, height: 30, display: 'inline-block' }}>
              <input
                type="checkbox"
                checked={t.dark}
                onChange={(e) => t.setDark(e.target.checked)}
                style={{ display: 'none' }}
              />
              <span
                style={{
                  position: 'absolute',
                  inset: 0,
                  background: t.dark ? '#0b1b2b' : '#e2e8f0',
                  borderRadius: 999,
                }}
              />
              <span
                style={{
                  position: 'absolute',
                  top: 3,
                  left: t.dark ? 32 : 3,
                  width: 24,
                  height: 24,
                  background: t.dark ? t.accent : '#fff',
                  borderRadius: '50%',
                  transition: 'left .18s',
                  border: `1px solid ${t.border}`,
                }}
              />
            </label>
          </div>

          {/* NAVIGATION */}
          <nav style={{ display: 'grid', gap: 6 }}>
            {[
              ['overview', 'Overview'],
              ['team', 'Team Analytics'],
              ['hierarchy', 'Hierarchy'],
              ['activity', 'Activity'],
              ['projects', 'Projects'],
              ['clients', 'Clients'],
              ['finance', 'Finance'],
              ['reports', 'Reports'],
              ['settings', 'Settings'],
              ['profile', 'Profile'],
            ].map(([key, label]) => (
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
                  color: tab === key ? t.text : t.mut,
                  fontWeight: 700,
                }}
              >
                {label}
              </button>
            ))}
          </nav>

          {/* Quick Actions */}
          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 12, color: t.mut, marginBottom: 8 }}>Quick actions</div>
            <button
              onClick={() => exportCSV(PROJECTS, 'projects.csv')}
              style={{
                padding: '10px 12px',
                borderRadius: 12,
                border: 0,
                cursor: 'pointer',
                background: t.brand,
                color: '#fff',
                fontWeight: 800,
                width: '100%',
              }}
            >
              Export Projects CSV
            </button>
          </div>
        </aside>

        {/* MAIN CONTENT */}
        <main style={{ flex: 1, padding: 28 }}>
          {/* TOP BAR */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  background: t.card,
                  borderRadius: 12,
                  border: `1px solid ${t.border}`,
                  padding: '10px 12px',
                }}
              >
                <span>🔎</span>
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search projects, clients, AMs…"
                  style={{
                    border: 0,
                    outline: 'none',
                    background: 'transparent',
                    color: t.text,
                    width: 280,
                  }}
                />
              </div>
              <div style={{ fontSize: 12, color: t.mut }}>ADMIN • LAC-ADMIN-LOCKED-2025.10.24-v1.0</div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div
                title="Notifications"
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 12,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: t.card,
                  border: `1px solid ${t.border}`,
                  cursor: 'pointer',
                }}
                onClick={() => alert('Demo notifications')}
              >
                🔔
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div
                  style={{
                    width: 42,
                    height: 42,
                    borderRadius: 12,
                    background: t.card,
                    border: `1px solid ${t.border}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  👤
                </div>
                <div style={{ lineHeight: 1 }}>
                  <div style={{ fontWeight: 800 }}>Admin</div>
                  <div style={{ fontSize: 12, color: t.mut }}>Full Access</div>
                </div>
              </div>
            </div>
          </div>

          {/* ===================== TABS ===================== */}

          {tab === 'overview' && (
            <section>
              {/* KPIs */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 16 }}>
                <Card t={t}>
                  <Label>Revenue (YTD)</Label>
                  <Big>{currency(KPI.revenueYTD)}</Big>
                  <Small>Across all services</Small>
                </Card>
                <Card t={t}>
                  <Label>Gross Margin</Label>
                  <Big>{Math.round(KPI.margin * 100)}%</Big>
                  <Small>After delivery costs</Small>
                </Card>
                <Card t={t}>
                  <Label>Active Projects</Label>
                  <Big>{KPI.actives}</Big>
                  <Small>In delivery pipeline</Small>
                </Card>
                <Card t={t}>
                  <Label>Overdue</Label>
                  <Big style={{ color: t.warn }}>{KPI.overdue}</Big>
                  <Small>Needs attention</Small>
                </Card>
              </div>

              {/* Charts Row */}
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16 }}>
                <Card t={t}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3 style={{ margin: 0 }}>Sales Trend</h3>
                    <Small>Last 12 months</Small>
                  </div>
                  <div style={{ marginTop: 8 }}>
                    <LineChart data={lineSeries} w={680} h={140} stroke={t.accent} />
                  </div>
                </Card>

                <div style={{ display: 'grid', gap: 16 }}>
                  <Card t={t}>
                    <h4 style={{ margin: '0 0 6px 0' }}>Revenue Mix</h4>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <Donut values={donutVals} colors={[t.accent, t.brand, '#F43F5E']} size={140} />
                      <div style={{ fontSize: 13, color: t.mut }}>
                        <RowJustify a="Web/App" b="$230k" />
                        <RowJustify a="Branding" b="$160k" />
                        <RowJustify a="SEO/Social" b="$92k" />
                      </div>
                    </div>
                  </Card>

                  <Card t={t}>
                    <h4 style={{ margin: '0 0 6px 0' }}>Weekly Throughput</h4>
                    <BarChart labels={barLabels} values={barValues} w={320} h={120} color={t.brand} />
                  </Card>
                </div>
              </div>

              {/* PROJECTS TABLE */}
              <Card t={t} style={{ marginTop: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h3 style={{ margin: 0 }}>Projects</h3>
                  <button
                    onClick={() => exportCSV(PROJECTS, 'projects.csv')}
                    style={{
                      padding: '8px 12px',
                      borderRadius: 10,
                      border: `1px solid ${t.border}`,
                      background: t.card,
                      color: t.text,
                      cursor: 'pointer',
                      fontWeight: 700,
                    }}
                  >
                    Export CSV
                  </button>
                </div>

                <div style={{ marginTop: 10, overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ textAlign: 'left', borderBottom: `1px dashed ${t.border}`, color: t.mut, fontSize: 12 }}>
                        <th style={{ padding: '8px 6px' }}>Order ID</th>
                        <th style={{ padding: '8px 6px' }}>Project</th>
                        <th style={{ padding: '8px 6px' }}>Client</th>
                        <th style={{ padding: '8px 6px' }}>AM</th>
                        <th style={{ padding: '8px 6px' }}>Status</th>
                        <th style={{ padding: '8px 6px' }}>Budget</th>
                        <th style={{ padding: '8px 6px' }}>Progress</th>
                      </tr>
                    </thead>

                    <tbody>
                      {filtered.map((p) => (
                        <tr key={p.id} style={{ borderBottom: `1px dashed ${t.border}` }}>
                          <td style={{ padding: '10px 6px', fontWeight: 800 }}>{p.id}</td>
                          <td style={{ padding: '10px 6px' }}>{p.title}</td>
                          <td style={{ padding: '10px 6px' }}>{p.client}</td>
                          <td style={{ padding: '10px 6px' }}>{p.am}</td>
                          <td style={{ padding: '10px 6px' }}>{p.status}</td>
                          <td style={{ padding: '10px 6px' }}>{currency(p.budget)}</td>
                          <td style={{ padding: '10px 6px' }}>
                            <div
                              style={{
                                height: 8,
                                width: 120,
                                background: t.dark ? '#0b1b2b' : '#e2e8f0',
                                borderRadius: 999,
                                overflow: 'hidden',
                                border: `1px solid ${t.border}`,
                              }}
                            >
                              <div style={{ height: '100%', width: `${p.progress}%`, background: t.ok }} />
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            </section>
          )}

          {tab === 'team' && (
            <section>
              <h2 style={{ marginTop: 0 }}>Team Analytics</h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14 }}>
                {TEAM.map((m) => (
                  <Card key={m.name} t={t}>
                    <h4 style={{ margin: '0 0 4px 0' }}>{m.name}</h4>
                    <Small>KPIs this month</Small>

                    <div style={{ height: 8 }} />

                    <div style={{ display: 'grid', gap: 6, fontSize: 13 }}>
                      <RowJustify a="Quota / Closed" b={`${currency(m.kpi.quota)} / ${currency(m.kpi.closed)}`} />
                      <RowJustify a="Conversion" b={`${Math.round(m.kpi.conv * 100)}%`} />

                      {'portfolio' in m.kpi && <RowJustify a="Portfolio" b={`${m.kpi.portfolio}`} />}
                      {'health' in m.kpi && <RowJustify a="Health" b={`${Math.round(m.kpi.health * 100)}%`} />}
                      {'csat' in m.kpi && <RowJustify a="CSAT" b={`${m.kpi.csat}/5`} />}
                      {'tasks' in m.kpi && <RowJustify a="Open Tasks" b={`${m.kpi.tasks}`} />}
                      {'onTime' in m.kpi && <RowJustify a="On-time" b={`${Math.round(m.kpi.onTime * 100)}%`} />}
                      {'bugs' in m.kpi && <RowJustify a="Bugs" b={`${m.kpi.bugs}`} />}
                    </div>
                  </Card>
                ))}
              </div>
            </section>
          )}

          {tab === 'hierarchy' && (
            <section>
              <h2 style={{ marginTop: 0 }}>Hierarchy & Roles</h2>

              <Card t={t}>
                <p style={{ marginTop: 0, color: t.mut }}>
                  View and assign team leads. When a user is marked as Team Lead, all users under their org node will display that line
                  manager on their profile. (Data wiring via Firestore comes next.)
                </p>

                <button
                  onClick={() => alert('Demo: would open hierarchy editor')}
                  style={{
                    padding: '10px 12px',
                    borderRadius: 12,
                    border: `1px solid ${t.border}`,
                    background: t.card,
                    color: t.text,
                    fontWeight: 800,
                    cursor: 'pointer',
                  }}
                >
                  Open Hierarchy Editor
                </button>
              </Card>
            </section>
          )}

          {tab === 'activity' && (
            <section>
              <h2 style={{ marginTop: 0 }}>Recent Activity</h2>

              <Card t={t}>
                <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                  {ACTIVITY.map((a, i) => (
                    <li key={i} style={{ padding: '10px 0', borderBottom: `1px dashed ${t.border}` }}>
                      <strong>{a.t}</strong> — <span style={{ color: t.accent }}>{a.who}</span> • {a.what} (<code>{a.ref}</code>)
                    </li>
                  ))}
                </ul>
              </Card>
            </section>
          )}

          {tab === 'projects' && (
            <section>
              <h2 style={{ marginTop: 0 }}>Projects</h2>

              <Card t={t}>
                <p style={{ marginTop: 0, color: t.mut }}>Clickable rows will route to project detail (wire to /app/projects/[id]).</p>

                <div style={{ marginTop: 10, overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ textAlign: 'left', borderBottom: `1px dashed ${t.border}`, color: t.mut, fontSize: 12 }}>
                        <th style={{ padding: '8px 6px' }}>Order ID</th>
                        <th style={{ padding: '8px 6px' }}>Project</th>
                        <th style={{ padding: '8px 6px' }}>Client</th>
                        <th style={{ padding: '8px 6px' }}>AM</th>
                        <th style={{ padding: '8px 6px' }}>Status</th>
                        <th style={{ padding: '8px 6px' }}>Budget</th>
                        <th style={{ padding: '8px 6px' }}>Progress</th>
                      </tr>
                    </thead>

                    <tbody>
                      {filtered.map((p) => (
                        <tr key={p.id} style={{ borderBottom: `1px dashed ${t.border}`, cursor: 'pointer' }}>
                          <td style={{ padding: '10px 6px', fontWeight: 800 }}>{p.id}</td>
                          <td style={{ padding: '10px 6px' }}>{p.title}</td>
                          <td style={{ padding: '10px 6px' }}>{p.client}</td>
                          <td style={{ padding: '10px 6px' }}>{p.am}</td>
                          <td style={{ padding: '10px 6px' }}>{p.status}</td>
                          <td style={{ padding: '10px 6px' }}>{currency(p.budget)}</td>
                          <td style={{ padding: '10px 6px' }}>
                            <div
                              style={{
                                height: 8,
                                width: 120,
                                background: t.dark ? '#0b1b2b' : '#e2e8f0',
                                borderRadius: 999,
                                overflow: 'hidden',
                                border: `1px solid ${t.border}`,
                              }}
                            >
                              <div style={{ height: '100%', width: `${p.progress}%`, background: t.ok }} />
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            </section>
          )}

          {tab === 'clients' && (
            <section>
              <h2 style={{ marginTop: 0 }}>Clients</h2>

              <Card t={t}>
                <p style={{ marginTop: 0, color: t.mut }}>Client directory with payments and services (wire to /app/clients/[id]).</p>

                <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                  {['Acme Co', 'Bistro Ltd', 'Fintech Inc', 'Moda'].map((c) => (
                    <li key={c} style={{ padding: '10px 0', borderBottom: `1px dashed ${t.border}` }}>
                      <strong>{c}</strong> — Last invoice: <code>Paid</code>
                    </li>
                  ))}
                </ul>
              </Card>
            </section>
          )}

          {tab === 'finance' && (
            <section>
              <h2 style={{ marginTop: 0 }}>Finance</h2>

              <Card t={t}>
                <p style={{ marginTop: 0, color: t.mut }}>Mark paid (Admin only), export AR aging, and view monthly revenue run-rate.</p>

                <div style={{ marginTop: 10 }}>
                  <BarChart labels={['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun']} values={[62, 71, 68, 88, 79, 95]} w={520} h={120} color={t.accent} />
                </div>
              </Card>
            </section>
          )}

          {tab === 'reports' && (
            <section>
              <h2 style={{ marginTop: 0 }}>Reports</h2>

              <Card t={t}>
                <p style={{ marginTop: 0, color: t.mut }}>Export operational and finance reports. (Hook to server actions later.)</p>

                <div style={{ display: 'flex', gap: 10 }}>
                  <button
                    onClick={() => exportCSV(PROJECTS, 'projects.csv')}
                    style={{
                      padding: '10px 12px',
                      borderRadius: 12,
                      border: `1px solid ${t.border}`,
                      background: t.card,
                      color: t.text,
                      fontWeight: 800,
                      cursor: 'pointer',
                    }}
                  >
                    Export Projects
                  </button>

                  <button
                    onClick={() =>
                      exportCSV(
                        [
                          { id: 'INV-001', client: 'Acme Co', amount: 3000, status: 'Due' },
                          { id: 'INV-002', client: 'Bistro Ltd', amount: 1200, status: 'Paid' },
                        ],
                        'invoices.csv'
                      )
                    }
                    style={{
                      padding: '10px 12px',
                      borderRadius: 12,
                      border: `1px solid ${t.border}`,
                      background: t.card,
                      color: t.text,
                      fontWeight: 800,
                      cursor: 'pointer',
                    }}
                  >
                    Export Invoices
                  </button>
                </div>
              </Card>
            </section>
          )}

          {tab === 'settings' && (
            <section>
              <h2 style={{ marginTop: 0 }}>Settings</h2>

              <Card t={t}>
                <p style={{ marginTop: 0, color: t.mut }}>
                  Company config (branding, email provider, role mapping, pipelines). (Wire to Firestore & Resend after auth.)
                </p>
              </Card>
            </section>
          )}

          {tab === 'profile' && (
            <section>
              <h2 style={{ marginTop: 0 }}>Profile</h2>

              <Card t={t}>
                <p style={{ marginTop: 0, color: t.mut }}>Admin profile with uploader + password change (connect later to Firebase Auth).</p>

                <div style={{ display: 'grid', gap: 10, maxWidth: 560 }}>
                  <Input t={t} label="Name" placeholder="Your name" />
                  <Input t={t} label="Email" placeholder="you@company.com" />

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <Input t={t} label="City" placeholder="Karachi" />
                    <Input t={t} label="State" placeholder="Sindh" />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <Input t={t} label="Zip" placeholder="-" />
                    <Input t={t} label="Role" placeholder="Admin" />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: 12, color: t.mut, marginBottom: 6 }}>Profile Image</label>

                    <div
                      style={{
                        border: `1px dashed ${t.border}`,
                        borderRadius: 12,
                        padding: 14,
                        textAlign: 'center',
                        background: t.dark ? '#0b1b2b' : '#fff',
                        color: t.mut,
                      }}
                    >
                      Click to upload (wire Uploadcare later)
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 10 }}>
                    <button
                      onClick={() => alert('Demo save')}
                      style={{
                        padding: '10px 12px',
                        borderRadius: 12,
                        border: 0,
                        background: t.brand,
                        color: '#fff',
                        fontWeight: 800,
                        cursor: 'pointer',
                      }}
                    >
                      Save Profile
                    </button>

                    <button
                      onClick={() => alert('Demo password change')}
                      style={{
                        padding: '10px 12px',
                        borderRadius: 12,
                        border: `1px solid ${t.border}`,
                        background: t.card,
                        color: t.text,
                        fontWeight: 800,
                        cursor: 'pointer',
                      }}
                    >
                      Change Password
                    </button>
                  </div>
                </div>
              </Card>
            </section>
          )}
        </main>
      </div>
    </RequireAuth>
  );
}

/** ========= UI ATOMS ========= */
function Card({ t, children, style }) {
  return (
    <div
      style={{
        background: t.card,
        border: `1px solid ${t.border}`,
        borderRadius: 18,
        boxShadow: t.shadow,
        padding: 16,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function Label({ children }) {
  return <div style={{ fontSize: 12, color: '#94A3B8' }}>{children}</div>;
}

function Big({ children, style }) {
  return (
    <div style={{ marginTop: 8, fontWeight: 900, fontSize: 22, letterSpacing: -0.2, ...style }}>
      {children}
    </div>
  );
}

function Small({ children }) {
  return <div style={{ marginTop: 6, fontSize: 12, color: '#94A3B8' }}>{children}</div>;
}

function RowJustify({ a, b }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '4px 0' }}>
      <span>{a}</span>
      <strong>{b}</strong>
    </div>
  );
}

function Input({ t, label, placeholder }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 12, color: t.mut, marginBottom: 6 }}>{label}</label>

      <input
        placeholder={placeholder}
        style={{
          width: '100%',
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
}
