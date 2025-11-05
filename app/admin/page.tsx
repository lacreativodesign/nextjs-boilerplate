"use client";

import React, { useEffect, useMemo, useState } from "react";
import RequireAuth from "@/components/RequireAuth";

/** ===========================================================
 *  LAC-ADMIN-LOCKED-2025.10.24-v1.0
 *  Admin Dashboard — 2025 aesthetic, dark/light toggle (switch),
 *  left sidebar, mobile responsive, packed overview, delivered projects,
 *  team analytics, hierarchy, activity, projects, clients, finance, reports,
 *  settings, profile (with editable fields + password change stub).
 *  Pure React + SVG charts. No external UI libs. Build-safe.
 *  =========================================================== */

type Role = "admin" | "sales" | "am" | "production" | "hr" | "finance" | "client";

type Project = {
  id: string;
  code: string; // "LC-0001"
  title: string;
  client: string;
  service: "Website" | "Branding" | "Social/Ads" | "SEO" | "Custom";
  status: "Inquiry" | "Deposit" | "Kickoff" | "Draft" | "Review" | "Revisions" | "Final" | "Delivered";
  am: string; // account manager
  budget: number;
  paid: number;
  due: string; // ISO date
};

type Activity = {
  id: string;
  at: string; // ISO date
  who: string;
  what: string;
  projectCode?: string;
};

type KPI = {
  label: string;
  value: string;
  sub: string;
};

const SAMPLE_PROJECTS: Project[] = [
  { id: "p1", code: "LC-0001", title: "E-Com Redesign", client: "Acme Co", service: "Website", status: "Review", am: "Sana Khan", budget: 12000, paid: 8000, due: "2025-11-18" },
  { id: "p2", code: "LC-0002", title: "Logo Suite", client: "Moda Labs", service: "Branding", status: "Revisions", am: "Ali Raza", budget: 4500, paid: 4500, due: "2025-10-29" },
  { id: "p3", code: "LC-0003", title: "SEO Growth", client: "Fintech Inc", service: "SEO", status: "Kickoff", am: "Sana Khan", budget: 7000, paid: 3500, due: "2025-12-06" },
  { id: "p4", code: "LC-0004", title: "Social Sprint Q4", client: "Glow Co", service: "Social/Ads", status: "Delivered", am: "Imran Ali", budget: 6000, paid: 6000, due: "2025-10-15" },
  { id: "p5", code: "LC-0005", title: "Custom Portal", client: "Northbridge", service: "Custom", status: "Final", am: "Ali Raza", budget: 22000, paid: 10000, due: "2026-01-10" },
];

const SAMPLE_ACTIVITY: Activity[] = [
  { id: "a1", at: "2025-11-04T13:22:00Z", who: "Admin", what: "Marked LC-0004 as Delivered", projectCode: "LC-0004" },
  { id: "a2", at: "2025-11-03T18:10:00Z", who: "Sana Khan", what: "Requested client assets for LC-0003", projectCode: "LC-0003" },
  { id: "a3", at: "2025-11-02T09:40:00Z", who: "Ali Raza", what: "Uploaded Draft v2 to LC-0002", projectCode: "LC-0002" },
  { id: "a4", at: "2025-11-01T11:05:00Z", who: "Imran Ali", what: "Kicked off Ads Plan for LC-0004", projectCode: "LC-0004" },
];

const TEAM = [
  { name: "Sana Khan", role: "am", kpi: { active: 7, onTime: "92%", csat: "4.7" } },
  { name: "Ali Raza", role: "am", kpi: { active: 5, onTime: "87%", csat: "4.6" } },
  { name: "Imran Ali", role: "production", kpi: { active: 9, onTime: "90%", csat: "4.5" } },
  { name: "Sara Ahmed", role: "sales", kpi: { active: 18, onTime: "—", csat: "—" } },
];

const SALES_SERIES = [4500, 5600, 4900, 6200, 5800, 7000]; // last 6 months
const TASKS_DIST = { todo: 5, inProgress: 8, blocked: 2, done: 14 };

function currency(n: number) {
  return "$" + (n || 0).toLocaleString();
}

// ---------- Simple SVG Charts (no external deps) ----------
function LineChart({ data, width = 520, height = 140, stroke = "#2563eb" }: { data: number[]; width?: number; height?: number; stroke?: string }) {
  if (!data || data.length === 0) data = [0];
  const max = Math.max(...data, 1);
  const step = width / Math.max(1, data.length - 1);
  const points = data.map((v, i) => `${i * step},${height - (v / max) * (height - 10)}`).join(" ");
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <polyline fill="none" stroke={stroke} strokeWidth="2.5" points={points} strokeLinecap="round" strokeLinejoin="round" />
      {data.map((v, i) => (
        <circle key={i} cx={i * step} cy={height - (v / max) * (height - 10)} r="3.5" fill={stroke} />
      ))}
    </svg>
  );
}

function BarChart({ labels, values, width = 340, height = 140, color = "#0f172a" }: { labels: string[]; values: number[]; width?: number; height?: number; color?: string }) {
  if (!values || values.length === 0) values = [0];
  const max = Math.max(...values, 1);
  const bw = Math.max(14, width / values.length - 8);
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      {values.map((v, i) => {
        const x = i * (bw + 8) + 10;
        const h = (v / max) * (height - 24);
        return (
          <g key={i}>
            <rect x={x} y={height - h - 20} width={bw} height={h} rx={4} fill={color} />
            <text x={x + bw / 2} y={height - 6} fontSize="10" textAnchor="middle" fill="#6b7280">
              {labels[i]}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function Donut({ values = [1, 1, 1], colors = ["#0ea5e9", "#8b5cf6", "#f59e0b"], size = 140 }: { values?: number[]; colors?: string[]; size?: number }) {
  const total = values.reduce((s, v) => s + v, 0) || 1;
  let angle = -90;
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 8;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {values.map((v, i) => {
        const portion = v / total;
        const a1 = (angle * Math.PI) / 180;
        const a2 = ((angle + portion * 360) * Math.PI) / 180;
        const x1 = cx + r * Math.cos(a1);
        const y1 = cy + r * Math.sin(a1);
        const x2 = cx + r * Math.cos(a2);
        const y2 = cy + r * Math.sin(a2);
        const large = portion > 0.5 ? 1 : 0;
        const path = `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`;
        angle += portion * 360;
        return <path key={i} d={path} fill={colors[i % colors.length]} />;
      })}
      <circle cx={cx} cy={cy} r={r * 0.55} fill="#fff" />
    </svg>
  );
}

// ---------- Theme ----------
function useTheme(defaultDark = true) {
  const [dark, setDark] = useState<boolean>(defaultDark);
  useEffect(() => {
    const saved = localStorage.getItem("lac_theme");
    if (saved) setDark(saved === "dark");
  }, []);
  useEffect(() => {
    localStorage.setItem("lac_theme", dark ? "dark" : "light");
  }, [dark]);
  const t = useMemo(
    () => ({
      dark,
      bg: dark ? "#070F22" : "#F5F7FB",
      text: dark ? "#E8EEF7" : "#0F172A",
      mut: dark ? "#9AA6B2" : "#64748B",
      card: dark ? "rgba(16,28,56,.72)" : "#ffffff",
      border: dark ? "rgba(255,255,255,.08)" : "rgba(15,23,42,.08)",
      accent: "#06B6D4",
      accent2: "#8B5CF6",
      ok: "#10B981",
      danger: "#EF4444",
      shadow: dark ? "0 30px 80px rgba(2,6,23,.55)" : "0 30px 80px rgba(2,6,23,.12)",
      radius: 18,
    }),
    [dark]
  );
  return { dark, setDark, t };
}

export default function AdminPage() {
  return (
    <RequireAuth allowed={["admin"]}>
      <Admin2025 />
    </RequireAuth>
  );
}

function Admin2025() {
  const { dark, setDark, t } = useTheme(true);
  const [page, setPage] = useState<string>("Overview");
  const [q, setQ] = useState<string>("");

  const projects = useMemo(() => SAMPLE_PROJECTS, []);
  const activity = useMemo(() => SAMPLE_ACTIVITY, []);

  const delivered = projects.filter((p) => p.status === "Delivered");
  const deliveredByService = useMemo(() => {
    const map = new Map<string, number>();
    delivered.forEach((p) => map.set(p.service, (map.get(p.service) || 0) + 1));
    return Array.from(map.entries()).map(([service, count]) => ({ service, count }));
  }, [delivered]);

  const revenueByService = useMemo(() => {
    const map = new Map<string, number>();
    projects.forEach((p) => map.set(p.service, (map.get(p.service) || 0) + p.paid));
    const rows = Array.from(map.entries()).map(([service, sum]) => ({ service, sum }));
    const values = rows.map((r) => r.sum);
    const labels = rows.map((r) => r.service);
    return { rows, values, labels };
  }, [projects]);

  const kpis: KPI[] = useMemo(() => {
    const totalRevenue = projects.reduce((s, p) => s + p.paid, 0);
    const receivables = projects.reduce((s, p) => s + Math.max(p.budget - p.paid, 0), 0);
    const active = projects.filter((p) => p.status !== "Delivered").length;
    return [
      { label: "Revenue (Paid)", value: currency(totalRevenue), sub: "YTD collected" },
      { label: "Receivables", value: currency(receivables), sub: "Outstanding" },
      { label: "Active Projects", value: String(active), sub: "In progress" },
    ];
  }, [projects]);

  const filteredProjects = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return projects;
    return projects.filter(
      (p) =>
        p.title.toLowerCase().includes(needle) ||
        p.client.toLowerCase().includes(needle) ||
        p.code.toLowerCase().includes(needle)
    );
  }, [q, projects]);

  // ---- Profile editable state (client-side only preview) ----
  const [profile, setProfile] = useState({
    name: "Admin Alice",
    email: "admin@lacreativo.com",
    phone: "+92 300 0000000",
    dob: "1985-10-04",
    city: "Karachi",
    state: "Sindh",
    zip: "75500",
    socials: { linkedin: "https://linkedin.com/company/lacreativo", twitter: "https://x.com/lacreativo" },
    role: "admin" as Role,
    designation: "Administrator",
  });

  // ---- UI ----
  return (
    <div className="wrap" style={{ background: t.bg, color: t.text }}>
      <aside className="sidebar" style={{ background: dark ? "#081227" : "#ffffff", borderRight: `1px solid ${t.border}` }}>
        <div className="brand">
          <div className="logo">LA&nbsp;CREATIVO</div>
          <div className="mode">
            <span>{dark ? "Dark" : "Light"}</span>
            <label className="switch">
              <input type="checkbox" checked={dark} onChange={(e) => setDark(e.target.checked)} />
              <span className="slider" />
            </label>
          </div>
        </div>

        <nav className="nav">
          {[
            "Overview",
            "Team Analytics",
            "Hierarchy",
            "Activity",
            "Projects",
            "Clients",
            "Finance",
            "Reports",
            "Settings",
            "Profile",
          ].map((p) => (
            <button
              key={p}
              className={`navbtn ${page === p ? "active" : ""}`}
              onClick={() => setPage(p)}
              style={{ borderColor: t.border }}
            >
              {p}
            </button>
          ))}
        </nav>

        <div className="asideFoot" style={{ color: t.mut }}>© {new Date().getFullYear()} LA CREATIVO</div>
      </aside>

      <main className="main">
        {/* Topbar */}
        <div className="topbar" style={{ borderBottom: `1px solid ${t.border}` }}>
          <div className="search">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search: client, project, or LC-code"
              aria-label="Search"
            />
            <button className="btn minor" onClick={() => setQ("")}>Clear</button>
          </div>
          <div className="who">
            <div className="avatar">A</div>
            <div className="meta">
              <div className="nm">Admin Alice</div>
              <div className="rl" style={{ color: t.mut }}>Administrator</div>
            </div>
          </div>
        </div>

        {/* Pages */}
        {page === "Overview" && (
          <section className="pad">
            {/* KPIs */}
            <div className="kpis">
              {kpis.map((k) => (
                <div key={k.label} className="kpi" style={{ background: t.card, border: `1px solid ${t.border}`, boxShadow: t.shadow }}>
                  <div className="khead">{k.label}</div>
                  <div className="kval">{k.value}</div>
                  <div className="ksub" style={{ color: t.mut }}>{k.sub}</div>
                </div>
              ))}
            </div>

            {/* Charts + Donut */}
            <div className="grid2">
              <div className="panel" style={{ background: t.card, border: `1px solid ${t.border}`, boxShadow: t.shadow }}>
                <div className="ph"><span>Sales (Last 6 months)</span></div>
                <LineChart data={SALES_SERIES} width={640} height={160} stroke={t.accent2} />
              </div>

              <div className="panel" style={{ background: t.card, border: `1px solid ${t.border}`, boxShadow: t.shadow }}>
                <div className="ph"><span>Tasks Distribution</span></div>
                <BarChart
                  labels={["Todo", "In Progress", "Blocked", "Done"]}
                  values={[TASKS_DIST.todo, TASKS_DIST.inProgress, TASKS_DIST.blocked, TASKS_DIST.done]}
                  width={360}
                  height={160}
                  color={dark ? "#e2e8f0" : "#0f172a"}
                />
              </div>
            </div>

            <div className="grid2">
              <div className="panel" style={{ background: t.card, border: `1px solid ${t.border}`, boxShadow: t.shadow }}>
                <div className="ph"><span>Revenue by Service</span></div>
                <div className="donutRow">
                  <Donut values={revenueByService.values} colors={[t.accent, t.accent2, "#f59e0b", "#22c55e", "#ef4444"]} size={160} />
                  <div className="legend">
                    {revenueByService.rows.map((r) => (
                      <div key={r.service} className="legrow">
                        <div className="lbl">{r.service}</div>
                        <div className="val">{currency(r.sum)}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="panel" style={{ background: t.card, border: `1px solid ${t.border}`, boxShadow: t.shadow }}>
                <div className="ph"><span>Delivered Projects (service-wise)</span></div>
                <div className="table">
                  <div className="thead">
                    <div>Service</div>
                    <div>Delivered</div>
                  </div>
                  {deliveredByService.map((r) => (
                    <div key={r.service} className="trow">
                      <div>{r.service}</div>
                      <div>{r.count}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Recent Projects + Activity */}
            <div className="grid2">
              <div className="panel" style={{ background: t.card, border: `1px solid ${t.border}`, boxShadow: t.shadow }}>
                <div className="ph"><span>Projects</span></div>
                <div className="table">
                  <div className="thead">
                    <div>Project</div>
                    <div>Client</div>
                    <div>Service</div>
                    <div>AM</div>
                    <div>Status</div>
                    <div>Budget</div>
                    <div>Paid</div>
                    <div>Code</div>
                  </div>
                  {filteredProjects.map((p) => (
                    <div key={p.id} className="trow">
                      <div>{p.title}</div>
                      <div>{p.client}</div>
                      <div>{p.service}</div>
                      <div>{p.am}</div>
                      <div>{p.status}</div>
                      <div>{currency(p.budget)}</div>
                      <div>{currency(p.paid)}</div>
                      <div>{p.code}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="panel" style={{ background: t.card, border: `1px solid ${t.border}`, boxShadow: t.shadow }}>
                <div className="ph"><span>Recent Activity</span></div>
                <div className="feed">
                  {activity.map((a) => (
                    <div key={a.id} className="feedrow">
                      <div className="dot" />
                      <div>
                        <div className="what">{a.what}{a.projectCode ? ` (${a.projectCode})` : ""}</div>
                        <div className="mut" style={{ color: t.mut }}>
                          {new Date(a.at).toLocaleString()} • {a.who}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>
        )}

        {page === "Team Analytics" && (
          <section className="pad">
            <div className="ph" style={{ marginBottom: 12 }}><span>Team KPIs</span></div>
            <div className="table cardlike" style={{ background: t.card, border: `1px solid ${t.border}`, boxShadow: t.shadow }}>
              <div className="thead">
                <div>Name</div>
                <div>Role</div>
                <div>Active</div>
                <div>On-time</div>
                <div>CSAT</div>
              </div>
              {TEAM.map((m) => (
                <div key={m.name} className="trow">
                  <div>{m.name}</div>
                  <div style={{ textTransform: "uppercase", fontSize: 12 }}>{m.role}</div>
                  <div>{m.kpi.active}</div>
                  <div>{m.kpi.onTime}</div>
                  <div>{m.kpi.csat}</div>
                </div>
              ))}
            </div>
          </section>
        )}

        {page === "Hierarchy" && (
          <section className="pad">
            <div className="panel" style={{ background: t.card, border: `1px solid ${t.border}`, boxShadow: t.shadow }}>
              <div className="ph"><span>Company Hierarchy</span></div>
              <div className="tree">
                <div className="node">
                  <div className="badge admin">Admin</div>
                  <div className="children">
                    <div className="node">
                      <div className="badge am">AM Lead</div>
                      <div className="children">
                        <div className="badge am">AM — Sana</div>
                        <div className="badge am">AM — Ali</div>
                      </div>
                    </div>
                    <div className="node">
                      <div className="badge sales">Sales Lead</div>
                      <div className="children">
                        <div className="badge sales">Sales — Sara</div>
                      </div>
                    </div>
                    <div className="node">
                      <div className="badge prod">Production Lead</div>
                      <div className="children">
                        <div className="badge prod">Designer — Imran</div>
                        <div className="badge prod">Developer — Dario</div>
                      </div>
                    </div>
                    <div className="node">
                      <div className="badge hr">HR</div>
                    </div>
                    <div className="node">
                      <div className="badge fin">Finance</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}

        {page === "Activity" && (
          <section className="pad">
            <div className="ph" style={{ marginBottom: 12 }}><span>Activity Log</span></div>
            <div className="feed cardlike" style={{ background: t.card, border: `1px solid ${t.border}`, boxShadow: t.shadow }}>
              {activity.map((a) => (
                <div key={a.id} className="feedrow">
                  <div className="dot" />
                  <div>
                    <div className="what">{a.what}{a.projectCode ? ` (${a.projectCode})` : ""}</div>
                    <div className="mut" style={{ color: t.mut }}>
                      {new Date(a.at).toLocaleString()} • {a.who}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {page === "Projects" && (
          <section className="pad">
            <div className="ph" style={{ marginBottom: 12 }}><span>Projects</span></div>
            <div className="table cardlike" style={{ background: t.card, border: `1px solid ${t.border}`, boxShadow: t.shadow }}>
              <div className="thead">
                <div>Code</div>
                <div>Title</div>
                <div>Client</div>
                <div>Service</div>
                <div>AM</div>
                <div>Status</div>
                <div>Budget</div>
                <div>Paid</div>
              </div>
              {filteredProjects.map((p) => (
                <div key={p.id} className="trow clickable" title="Opens details (demo)">
                  <div>{p.code}</div>
                  <div>{p.title}</div>
                  <div>{p.client}</div>
                  <div>{p.service}</div>
                  <div>{p.am}</div>
                  <div>{p.status}</div>
                  <div>{currency(p.budget)}</div>
                  <div>{currency(p.paid)}</div>
                </div>
              ))}
            </div>
          </section>
        )}

        {page === "Clients" && (
          <section className="pad">
            <div className="ph" style={{ marginBottom: 12 }}><span>Clients</span></div>
            <div className="table cardlike" style={{ background: t.card, border: `1px solid ${t.border}`, boxShadow: t.shadow }}>
              <div className="thead">
                <div>Client</div>
                <div>Active Projects</div>
                <div>Total Paid</div>
                <div>AM</div>
              </div>
              {Object.values(
                filteredProjects.reduce((acc: any, p) => {
                  if (!acc[p.client]) acc[p.client] = { client: p.client, count: 0, paid: 0, am: p.am };
                  acc[p.client].count += 1;
                  acc[p.client].paid += p.paid;
                  acc[p.client].am = p.am;
                  return acc;
                }, {})
              ).map((r: any) => (
                <div key={r.client} className="trow">
                  <div>{r.client}</div>
                  <div>{r.count}</div>
                  <div>{currency(r.paid)}</div>
                  <div>{r.am}</div>
                </div>
              ))}
            </div>
          </section>
        )}

        {page === "Finance" && (
          <section className="pad">
            <div className="grid2">
              <div className="panel" style={{ background: t.card, border: `1px solid ${t.border}`, boxShadow: t.shadow }}>
                <div className="ph"><span>Receivables vs Paid</span></div>
                <LineChart
                  data={[
                    projects.reduce((s, p) => s + p.paid, 0),
                    projects.reduce((s, p) => s + Math.max(p.budget - p.paid, 0), 0),
                  ]}
                  width={640}
                  height={160}
                  stroke={t.accent}
                />
              </div>

              <div className="panel" style={{ background: t.card, border: `1px solid ${t.border}`, boxShadow: t.shadow }}>
                <div className="ph"><span>Collection Health</span></div>
                <BarChart labels={["Paid", "Outstanding"]} values={[
                  projects.reduce((s, p) => s + p.paid, 0),
                  projects.reduce((s, p) => s + Math.max(p.budget - p.paid, 0), 0),
                ]} width={360} height={160} color={dark ? "#e2e8f0" : "#0f172a"} />
              </div>
            </div>
          </section>
        )}

        {page === "Reports" && (
          <section className="pad">
            <div className="panel" style={{ background: t.card, border: `1px solid ${t.border}`, boxShadow: t.shadow }}>
              <div className="ph"><span>Exports</span></div>
              <p className="mut" style={{ color: t.mut, marginTop: 8 }}>Download CSV snapshots (demo data).</p>
              <div className="rowgap">
                <button className="btn" onClick={() => exportCSV(projects, "projects.csv")}>Export Projects CSV</button>
                <button className="btn" onClick={() => exportCSV(delivered, "delivered.csv")}>Export Delivered CSV</button>
              </div>
            </div>
          </section>
        )}

        {page === "Settings" && (
          <section className="pad">
            <div className="panel" style={{ background: t.card, border: `1px solid ${t.border}`, boxShadow: t.shadow }}>
              <div className="ph"><span>System Settings</span></div>
              <div className="rowgap">
                <div className="mut" style={{ color: t.mut }}>Admin can manage roles, reset passwords, and reassign AM/Sales.</div>
                <button className="btn minor">Manage Roles (demo)</button>
                <button className="btn minor">Reassign Projects (demo)</button>
              </div>
            </div>
          </section>
        )}

        {page === "Profile" && (
          <section className="pad">
            <div className="grid2">
              <div className="panel" style={{ background: t.card, border: `1px solid ${t.border}`, boxShadow: t.shadow }}>
                <div className="ph"><span>Personal Profile</span></div>
                <form className="form" onSubmit={(e) => e.preventDefault()}>
                  <label>
                    <span>Name</span>
                    <input value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} />
                  </label>
                  <label>
                    <span>Email</span>
                    <input value={profile.email} onChange={(e) => setProfile({ ...profile, email: e.target.value })} />
                  </label>
                  <label>
                    <span>Phone</span>
                    <input value={profile.phone} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} />
                  </label>
                  <div className="row2">
                    <label>
                      <span>DOB</span>
                      <input type="date" value={profile.dob} onChange={(e) => setProfile({ ...profile, dob: e.target.value })} />
                    </label>
                    <label>
                      <span>Role</span>
                      <input value={profile.role} readOnly />
                    </label>
                  </div>
                  <div className="row2">
                    <label>
                      <span>City</span>
                      <input value={profile.city} onChange={(e) => setProfile({ ...profile, city: e.target.value })} />
                    </label>
                    <label>
                      <span>State</span>
                      <input value={profile.state} onChange={(e) => setProfile({ ...profile, state: e.target.value })} />
                    </label>
                  </div>
                  <div className="row2">
                    <label>
                      <span>Zip</span>
                      <input value={profile.zip} onChange={(e) => setProfile({ ...profile, zip: e.target.value })} />
                    </label>
                    <label>
                      <span>Designation</span>
                      <input value={profile.designation} onChange={(e) => setProfile({ ...profile, designation: e.target.value })} />
                    </label>
                  </div>
                  <label>
                    <span>LinkedIn</span>
                    <input
                      value={profile.socials.linkedin}
                      onChange={(e) => setProfile({ ...profile, socials: { ...profile.socials, linkedin: e.target.value } })}
                    />
                  </label>
                  <label>
                    <span>X/Twitter</span>
                    <input
                      value={profile.socials.twitter}
                      onChange={(e) => setProfile({ ...profile, socials: { ...profile.socials, twitter: e.target.value } })}
                    />
                  </label>

                  <div className="rowgap">
                    <button className="btn" onClick={() => alert("Saved (demo).")}>Save Profile</button>
                  </div>
                </form>
              </div>

              <div className="panel" style={{ background: t.card, border: `1px solid ${t.border}`, boxShadow: t.shadow }}>
                <div className="ph"><span>Change Password</span></div>
                <form className="form" onSubmit={(e) => e.preventDefault()}>
                  <label>
                    <span>Current Password</span>
                    <input type="password" placeholder="••••••••" />
                  </label>
                  <label>
                    <span>New Password</span>
                    <input type="password" placeholder="••••••••" />
                  </label>
                  <label>
                    <span>Confirm New Password</span>
                    <input type="password" placeholder="••••••••" />
                  </label>
                  <button className="btn" onClick={() => alert("Password change simulated (demo).")}>Update Password</button>
                </form>
              </div>
            </div>
          </section>
        )}
      </main>

      {/* Styles */}
      <style>{`
        * { box-sizing: border-box; }
        .wrap { min-height: 100vh; display: grid; grid-template-columns: 280px 1fr; }
        .sidebar { padding: 18px; display: flex; flex-direction: column; }
        .brand { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
        .logo { font-weight: 900; letter-spacing: -0.4px; color: #06B6D4; }
        .mode { display: flex; align-items: center; gap: 10px; }
        .switch { position: relative; display: inline-block; width: 44px; height: 24px; }
        .switch input { opacity: 0; width: 0; height: 0; }
        .slider { position: absolute; cursor: pointer; inset: 0; background: #cbd5e1; border-radius: 999px; transition: .2s; }
        .slider:before { content: ""; position: absolute; height: 18px; width: 18px; left: 3px; top: 3px; background: white; border-radius: 50%; transition: .2s; }
        .switch input:checked + .slider { background: #06B6D4; }
        .switch input:checked + .slider:before { transform: translateX(20px); }

        .nav { margin-top: 12px; display: flex; flex-direction: column; gap: 8px; }
        .navbtn { text-align: left; background: transparent; color: inherit; border: 1px solid transparent; padding: 10px 12px; border-radius: 10px; cursor: pointer; }
        .navbtn:hover { border-color: rgba(255,255,255,.12); }
        .navbtn.active { background: rgba(6,182,212,.12); border-color: rgba(6,182,212,.35); }

        .asideFoot { margin-top: auto; font-size: 12px; }

        .main { display: flex; flex-direction: column; min-width: 0; }
        .topbar { display: flex; align-items: center; justify-content: space-between; padding: 14px 18px; }
        .search { display: flex; gap: 8px; align-items: center; }
        .search input { padding: 10px 12px; border-radius: 10px; border: 1px solid rgba(15,23,42,.12); outline: none; min-width: 260px; }
        .who { display: flex; align-items: center; gap: 10px; }
        .avatar { width: 36px; height: 36px; border-radius: 10px; display: grid; place-items: center; background: #06B6D4; color: white; font-weight: 800; }
        .meta .nm { font-weight: 700; }
        .meta .rl { font-size: 12px; }

        .pad { padding: 18px; display: grid; gap: 16px; }
        .kpis { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }
        .kpi { border-radius: 14px; padding: 14px; }
        .khead { font-size: 12px; opacity: .9; }
        .kval { font-size: 22px; font-weight: 800; margin-top: 6px; }
        .ksub { font-size: 12px; margin-top: 2px; }

        .grid2 { display: grid; grid-template-columns: 2fr 1fr; gap: 16px; }
        .panel { border-radius: 14px; padding: 14px; }
        .ph { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; font-weight: 700; }

        .donutRow { display: flex; gap: 12px; align-items: center; }
        .legend { display: grid; gap: 6px; }
        .legrow { display: flex; justify-content: space-between; gap: 16px; min-width: 220px; }

        .table { display: grid; gap: 6px; }
        .thead, .trow { display: grid; grid-template-columns: repeat(8, 1fr); gap: 10px; padding: 10px 8px; border-bottom: 1px dashed rgba(15,23,42,.12); }
        .thead { font-size: 12px; opacity: .8; font-weight: 700; }
        .trow.clickable { cursor: pointer; }
        .trow.clickable:hover { background: rgba(6,182,212,.08); border-radius: 10px; }

        .feed { display: grid; gap: 10px; }
        .feedrow { display: flex; gap: 10px; align-items: flex-start; padding: 8px 0; border-bottom: 1px dashed rgba(15,23,42,.12); }
        .dot { width: 8px; height: 8px; border-radius: 50%; background: #06B6D4; margin-top: 8px; }
        .what { font-weight: 700; }

        .btn { background: #06B6D4; color: white; border: none; border-radius: 10px; padding: 10px 12px; cursor: pointer; font-weight: 700; }
        .btn.minor { background: transparent; color: inherit; border: 1px solid rgba(15,23,42,.18); }

        .rowgap { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
        .row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        .form { display: grid; gap: 10px; }
        .form label { display: grid; gap: 6px; }
        .form input { padding: 10px 12px; border-radius: 10px; border: 1px solid rgba(15,23,42,.18); background: transparent; color: inherit; }

        .cardlike { border-radius: 14px; padding: 12px; }

        .tree { padding: 10px; }
        .node { margin-left: 10px; }
        .children { margin-left: 16px; display: grid; gap: 6px; margin-top: 6px; }
        .badge { display: inline-block; padding: 6px 10px; border-radius: 999px; font-size: 12px; font-weight: 700; }
        .badge.admin { background: rgba(6,182,212,.15); }
        .badge.am { background: rgba(99,102,241,.15); }
        .badge.sales { background: rgba(234,179,8,.18); }
        .badge.prod { background: rgba(34,197,94,.18); }
        .badge.hr { background: rgba(244,63,94,.18); }
        .badge.fin { background: rgba(14,165,233,.18); }

        @media (max-width: 1024px) {
          .wrap { grid-template-columns: 1fr; }
          .sidebar { display: none; }
          .grid2 { grid-template-columns: 1fr; }
          .thead, .trow { grid-template-columns: repeat(2, 1fr); }
          .kpis { grid-template-columns: 1fr; }
        }
      `}</style>
    </div>
  );
}

// --------- CSV Export (client demo) ----------
function exportCSV(data: any[], filename: string) {
  if (!data || data.length === 0) {
    alert("Nothing to export");
    return;
  }
  const rows = [Object.keys(data[0]), ...data.map((d) => Object.values(d))];
  const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
    }  return (
    <div
      style={{
        minHeight: "100vh",
        background: t.bg,
        color: t.text,
        display: "flex",
        fontFamily: "Inter, sans-serif",
      }}
    >
      {/* SIDEBAR */}
      <aside
        style={{
          width: 240,
          padding: "24px 20px",
          background: dark ? "#0B1426" : "#FFFFFF",
          borderRight: `1px solid ${t.border}`,
          position: "sticky",
          top: 0,
          height: "100vh",
        }}
      >
        <div style={{ fontWeight: 900, fontSize: 20, marginBottom: 30, color: "#06B6D4" }}>
          LA CREATIVO
        </div>

        {[
          "Overview",
          "Team Analytics",
          "Hierarchy",
          "Activity",
          "Projects",
          "Clients",
          "Team",
          "Finance",
          "Reports",
          "Settings",
          "Profile",
        ].map((item) => (
          <div
            key={item}
            style={{
              padding: "10px 12px",
              borderRadius: 10,
              cursor: "pointer",
              marginBottom: 6,
              fontWeight: 600,
              color: t.muted,
            }}
          >
            {item}
          </div>
        ))}

        <button
          onClick={() => setDark((d) => !d)}
          style={{
            marginTop: 30,
            padding: "10px 12px",
            width: "100%",
            borderRadius: 10,
            border: `1px solid ${t.border}`,
            background: "transparent",
            color: t.text,
            cursor: "pointer",
          }}
        >
          {dark ? "Light Mode" : "Dark Mode"}
        </button>
      </aside>

      {/* MAIN CONTENT */}
      <main style={{ flex: 1, padding: 32 }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 20 }}>Admin Overview</h1>

        {/* KPIs */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))",
            gap: 20,
            marginBottom: 30,
          }}
        >
          {kpi.map((k) => (
            <div
              key={k.label}
              style={{
                background: t.card,
                padding: 20,
                borderRadius: 16,
                border: `1px solid ${t.border}`,
              }}
            >
              <div style={{ fontSize: 14, color: t.muted }}>{k.label}</div>
              <div style={{ fontSize: 24, fontWeight: 800 }}>{k.value}</div>
            </div>
          ))}
        </div>

        {/* PROJECTS TABLE */}
        <div
          style={{
            background: t.card,
            borderRadius: 16,
            padding: 20,
            border: `1px solid ${t.border}`,
          }}
        >
          <h2 style={{ fontSize: 20, marginBottom: 16 }}>Recent Projects</h2>

          {sampleProjects.map((p) => (
            <div
              key={p.id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                padding: "12px 0",
                borderBottom: `1px solid ${t.border}`,
              }}
            >
              <div>
                <b>{p.title}</b>
                <div style={{ fontSize: 13, color: t.muted }}>{p.client}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontWeight: 700 }}>{p.amount}</div>
                <div style={{ fontSize: 13, color: t.muted }}>{p.status}</div>
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  </RequireAuth>
  );
}
