"use client";

import React, { useMemo, useState } from "react";

/** ---------- tiny SVG chart primitives (no external libs) ---------- */
function Line({ data = [], width = 420, height = 120, stroke = "#334155" }) {
  if (!data.length) data = [0];
  const max = Math.max(...data, 1);
  const step = width / Math.max(1, data.length - 1);
  const pts = data
    .map((v, i) => `${i * step},${height - (v / max) * (height - 8)}`)
    .join(" ");
  return (
    <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}>
      <polyline
        fill="none"
        stroke={stroke}
        strokeWidth="2.5"
        points={pts}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {data.map((v, i) => (
        <circle
          key={i}
          cx={i * step}
          cy={height - (v / max) * (height - 8)}
          r="3.2"
          fill={stroke}
        />
      ))}
    </svg>
  );
}

function Donut({
  values = [1, 1, 1],
  colors = ["#06B6D4", "#6366F1", "#10B981", "#F59E0B", "#EF4444"],
  size = 160,
}) {
  const total = values.reduce((s, v) => s + v, 0) || 1;
  let angle = -90;
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 10;
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
        const d = `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`;
        angle += portion * 360;
        return <path key={i} d={d} fill={colors[i % colors.length]} />;
      })}
      <circle cx={cx} cy={cy} r={r * 0.55} fill="#fff" />
    </svg>
  );
}

/** ---------- fake data ---------- */
const INVOICES = [
  {
    id: "INV-1001",
    client: "Falcon Motors",
    service: "Website Design",
    amount: 4200,
    status: "Due",
    date: "2025-10-08",
    due: "2025-11-15",
  },
  {
    id: "INV-1002",
    client: "SilverOak Properties",
    service: "Branding",
    amount: 2600,
    status: "Paid",
    date: "2025-10-01",
    due: "2025-10-10",
  },
  {
    id: "INV-1003",
    client: "Moda Retail",
    service: "Social/Ads",
    amount: 1800,
    status: "Due",
    date: "2025-09-20",
    due: "2025-10-05",
  },
  {
    id: "INV-1004",
    client: "Fintech Inc",
    service: "SEO",
    amount: 3200,
    status: "Paid",
    date: "2025-09-05",
    due: "2025-09-20",
  },
];

const PAYOUTS = [
  { id: "PO-7001", vendor: "Payroll", amount: 4100, date: "2025-10-28", method: "Bank" },
  { id: "PO-7002", vendor: "Figma", amount: 45, date: "2025-10-21", method: "Card" },
  { id: "PO-7003", vendor: "Domains", amount: 28, date: "2025-10-18", method: "Card" },
];

const CASHFLOW_SERIES = [8.2, 9.1, 8.7, 10.4, 9.8, 11.6]; // $k by month
const REVENUE_BUCKETS = [
  { label: "Website", value: 18000 },
  { label: "Branding", value: 8200 },
  { label: "Social/Ads", value: 6200 },
  { label: "SEO", value: 9100 },
];

/** ---------- helpers ---------- */
const money = (n: number) =>
  (n < 0 ? "-$" : "$") + Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: 0 });

function ExportCSV({
  rows,
  filename = "export.csv",
}: {
  rows: Record<string, any>[];
  filename?: string;
}) {
  const click = () => {
    if (!rows?.length) return alert("Nothing to export");
    const cols = Object.keys(rows[0]);
    const body = [cols, ...rows.map((r) => cols.map((c) => String(r[c] ?? "")))];
    const csv = body.map((r) => r.map((v) => `"${v.replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };
  return (
    <button className="btn" onClick={click}>
      Export CSV
    </button>
  );
}

/** ---------- page ---------- */
export default function FinancePage() {
  const [dark, setDark] = useState(false);
  const [tab, setTab] = useState<"All" | "Due" | "Paid">("All");
  const [q, setQ] = useState("");

  const t = {
    dark,
    bg: dark ? "#070F22" : "#F5F7FB",
    card: dark ? "#101A30" : "#FFFFFF",
    side: dark ? "#0C172D" : "#FFFFFF",
    border: dark ? "rgba(255,255,255,.08)" : "rgba(15,23,42,.08)",
    text: dark ? "#E8EEF7" : "#0F172A",
    mut: dark ? "#9AA6B2" : "#6B7280",
    brand: "#06B6D4",
    accent: "#6366F1",
    ok: "#10B981",
    warn: "#F59E0B",
    bad: "#EF4444",
    radius: 16,
    shadow: dark ? "0 30px 80px rgba(2,6,23,.55)" : "0 30px 80px rgba(2,6,23,.12)",
  };

  // finance aggregates
  const totals = useMemo(() => {
    const mrr = 6800; // demo
    const ar = INVOICES.filter((i) => i.status === "Due").reduce((s, i) => s + i.amount, 0);
    const paid = INVOICES.filter((i) => i.status === "Paid").reduce((s, i) => s + i.amount, 0);
    const cash = 24000 + paid - PAYOUTS.reduce((s, p) => s + p.amount, 0);
    return { mrr, ar, cash, ap: PAYOUTS.reduce((s, p) => s + p.amount, 0) };
  }, []);

  // filtered invoices
  const invoices = INVOICES.filter((i) => {
    const byTab = tab === "All" ? true : i.status === tab;
    const byQ =
      i.id.toLowerCase().includes(q.toLowerCase()) ||
      i.client.toLowerCase().includes(q.toLowerCase()) ||
      i.service.toLowerCase().includes(q.toLowerCase());
    return byTab && byQ;
  });

  // donut values
  const donutVals = REVENUE_BUCKETS.map((b) => b.value);

  return (
    <div className="wrap" style={{ background: t.bg, color: t.text }}>
      <aside className="side" style={{ background: t.side, borderRight: `1px solid ${t.border}` }}>
        <div className="brand">FINANCE</div>
        {["Overview", "Invoices", "Payouts", "Reports", "Settings"].map((x) => (
          <div key={x} className="nav">
            {x}
          </div>
        ))}
        <button
          className="mode"
          onClick={() => setDark((d) => !d)}
          style={{ border: `1px solid ${t.border}`, color: t.text }}
        >
          {dark ? "Light Mode" : "Dark Mode"}
        </button>
      </aside>

      <main className="main">
        {/* top header */}
        <div className="top">
          <div className="title">Financial Overview</div>
          <div className="actions">
            <input
              className="search"
              placeholder="Search invoices, clients…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              style={{ border: `1px solid ${t.border}`, color: t.text }}
            />
            <ExportCSV rows={INVOICES} filename="invoices.csv" />
          </div>
        </div>

        {/* KPI row */}
        <div className="kpis">
          <KPI t={t} label="MRR" value={money(totals.mrr)} sub="Monthly Recurring Revenue" />
          <KPI t={t} label="Cash on Hand" value={money(totals.cash)} sub="Available balance" />
          <KPI t={t} label="A/R" value={money(totals.ar)} sub="Open receivables" />
          <KPI t={t} label="A/P" value={money(totals.ap)} sub="Upcoming payouts" />
        </div>

        {/* charts row */}
        <div className="row">
          <div className="card flex2" style={{ border: `1px solid ${t.border}`, boxShadow: t.shadow }}>
            <div className="cardHead">
              <div className="cardTitle">Cashflow (last 6 months)</div>
              <div className="mut">in $k</div>
            </div>
            <Line
              data={CASHFLOW_SERIES}
              width={640}
              height={160}
              stroke={t.dark ? "#93C5FD" : "#0F172A"}
            />
          </div>

          <div className="card flex1" style={{ border: `1px solid ${t.border}`, boxShadow: t.shadow }}>
            <div className="cardHead">
              <div className="cardTitle">Revenue by Service</div>
            </div>
            <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
              <Donut values={donutVals} size={180} />
              <div style={{ display: "grid", gap: 6 }}>
                {REVENUE_BUCKETS.map((b, i) => (
                  <div key={b.label} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <span
                      style={{
                        display: "inline-block",
                        width: 10,
                        height: 10,
                        borderRadius: 2,
                        background: ["#06B6D4", "#6366F1", "#10B981", "#F59E0B", "#EF4444"][i],
                      }}
                    />
                    <div style={{ width: 120 }}>{b.label}</div>
                    <strong>{money(b.value)}</strong>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* invoices */}
        <div className="card" style={{ border: `1px solid ${t.border}`, boxShadow: t.shadow }}>
          <div className="cardHead">
            <div className="cardTitle">Invoices</div>
            <div className="tabs">
              {(["All", "Due", "Paid"] as const).map((x) => (
                <button
                  key={x}
                  className={`tab ${tab === x ? "active" : ""}`}
                  onClick={() => setTab(x)}
                  style={{
                    border: `1px solid ${t.border}`,
                    background: tab === x ? t.brand : "transparent",
                    color: tab === x ? "#fff" : t.text,
                  }}
                >
                  {x}
                </button>
              ))}
            </div>
          </div>

          <div className="tableWrap">
            <table>
              <thead>
                <tr>
                  {["ID", "Client", "Service", "Amount", "Status", "Issued", "Due"].map((h) => (
                    <th key={h} className="th mut">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr key={inv.id} className="tr">
                    <td className="td">{inv.id}</td>
                    <td className="td">{inv.client}</td>
                    <td className="td">{inv.service}</td>
                    <td className="td">
                      <strong>{money(inv.amount)}</strong>
                    </td>
                    <td className="td">
                      <span
                        className="pill"
                        style={{
                          background:
                            inv.status === "Paid" ? "rgba(16,185,129,.18)" : "rgba(245,158,11,.18)",
                          color: inv.status === "Paid" ? "#10B981" : "#F59E0B",
                          border: "0",
                        }}
                      >
                        {inv.status}
                      </span>
                    </td>
                    <td className="td">{inv.date}</td>
                    <td className="td">{inv.due}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* payouts + AR aging */}
        <div className="row">
          <div className="card flex1" style={{ border: `1px solid ${t.border}`, boxShadow: t.shadow }}>
            <div className="cardHead">
              <div className="cardTitle">Payouts</div>
            </div>
            <div className="tableWrap">
              <table>
                <thead>
                  <tr>
                    {["ID", "Vendor", "Amount", "Method", "Date"].map((h) => (
                      <th key={h} className="th mut">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {PAYOUTS.map((p) => (
                    <tr key={p.id} className="tr">
                      <td className="td">{p.id}</td>
                      <td className="td">{p.vendor}</td>
                      <td className="td">
                        <strong>{money(p.amount)}</strong>
                      </td>
                      <td className="td">{p.method}</td>
                      <td className="td">{p.date}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card flex1" style={{ border: `1px solid ${t.border}`, boxShadow: t.shadow }}>
            <div className="cardHead">
              <div className="cardTitle">A/R Aging</div>
              <div className="mut">Amount due by bucket</div>
            </div>
            <div style={{ display: "grid", gap: 10 }}>
              {[
                { label: "0–30 days", value: 2400 },
                { label: "31–60 days", value: 1800 },
                { label: "61–90 days", value: 1200 },
                { label: "90+ days", value: 600 },
              ].map((b) => (
                <div key={b.label}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <div className="mut">{b.label}</div>
                    <strong>{money(b.value)}</strong>
                  </div>
                  <div
                    style={{
                      height: 8,
                      borderRadius: 999,
                      background: "rgba(148,163,184,.25)",
                      overflow: "hidden",
                      marginTop: 6,
                    }}
                  >
                    <div
                      style={{
                        width: `${(b.value / 2400) * 100}%`,
                        height: "100%",
                        background: "#6366F1",
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <footer className="foot mut">Preview • Dummy data • No backend</footer>
      </main>

      {/* styles */}
      <style>{`
        *{ box-sizing:border-box; font-family: Inter, ui-sans-serif, system-ui; }
        .wrap{ min-height:100vh; display:flex; }
        .side{ width:240px; padding:24px 16px; }
        .brand{ font-weight:900; letter-spacing:-.3px; color:#06B6D4; margin-bottom:18px; font-size:20px; }
        .nav{ color:#6B7280; font-weight:700; padding:10px 12px; border-radius:10px; cursor:pointer; margin-bottom:6px; }
        .mode{ margin-top:18px; width:100%; padding:10px 12px; border-radius:10px; background:transparent; cursor:pointer; }
        .main{ flex:1; padding:24px; max-width:1200px; margin:0 auto; }
        .top{ display:flex; justify-content:space-between; align-items:center; margin-bottom:14px; }
        .title{ font-size:24px; font-weight:900; }
        .actions{ display:flex; gap:10px; align-items:center; }
        .search{ padding:10px 12px; border-radius:10px; background:#fff; min-width:260px; }
        .btn{ padding:10px 12px; border-radius:10px; border:0; background:#06B6D4; color:#fff; font-weight:800; cursor:pointer; }
        .kpis{ display:grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap:12px; margin-bottom:14px; }
        .row{ display:grid; grid-template-columns: 2fr 1fr; gap:14px; margin-bottom:14px; }
        .card{ background:var(--card,#fff); padding:16px; border-radius:16px; }
        .flex1{ }
        .flex2{ }
        .cardHead{ display:flex; justify-content:space-between; align-items:flex-end; margin-bottom:10px; }
        .cardTitle{ font-weight:800; }
        .mut{ color:#6B7280; font-size:13px; }
        .tabs{ display:flex; gap:8px; }
        .tab{ padding:8px 10px; border-radius:10px; font-weight:700; background:transparent; cursor:pointer; }
        .tableWrap{ overflow:auto; border-radius:12px; }
        table{ width:100%; border-collapse:collapse; }
        .th{ text-align:left; padding:12px; border-bottom:1px solid rgba(148,163,184,.25); font-size:12px; }
        .td{ padding:12px; border-bottom:1px solid rgba(148,163,184,.2); font-size:14px; }
        .tr:hover{ background: rgba(2,6,23,.03); }
        .pill{ padding:4px 10px; border-radius:999px; font-size:12px; font-weight:800; }
        .foot{ margin-top:16px; text-align:center; font-size:12px; }
        @media (max-width: 980px){
          .row{ grid-template-columns: 1fr; }
          .kpis{ grid-template-columns: repeat(2, minmax(0,1fr)); }
          .search{ min-width: 160px; }
        }
      `}</style>
    </div>
  );
}

function KPI({
  t,
  label,
  value,
  sub,
}: {
  t: any;
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div
      className="card"
      style={{
        border: `1px solid ${t.border}`,
        boxShadow: t.shadow,
        background: t.card,
      }}
    >
      <div className="mut">{label}</div>
      <div style={{ fontSize: 22, fontWeight: 900, marginTop: 6 }}>{value}</div>
      <div className="mut" style={{ marginTop: 4, fontSize: 12 }}>
        {sub}
      </div>
    </div>
  );
}
