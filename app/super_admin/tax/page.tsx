"use client";

import { useCallback, useEffect, useState } from "react";

type TaxData = {
  year: number;
  yearTotal: number;
  allTimeTaxCollected: number;
  quarterlyTotals: { Q1: number; Q2: number; Q3: number; Q4: number };
  monthlyTotals: Record<string, number>;
  tenantBreakdown: Array<{
    tenantId: string;
    tenantName: string;
    plan: string;
    taxPaid: number;
    lastTaxAt: string | null;
  }>;
  taxJurisdiction: string;
  businessEntity: string;
  filingSchedule: string;
};

function fmt(v: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(v);
}

function fmtDate(v: string | null) {
  if (!v) return "—";
  const d = new Date(v);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

const QUARTERS = [
  { key: "Q1", period: "Jan – Mar", due: "April 20" },
  { key: "Q2", period: "Apr – Jun", due: "July 20" },
  { key: "Q3", period: "Jul – Sep", due: "October 20" },
  { key: "Q4", period: "Oct – Dec", due: "January 20" },
];

export default function SuperAdminTaxPage() {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [data, setData] = useState<TaxData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/super_admin/tax?year=${year}`, { credentials: "include" });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Failed to load tax data");
      setData(json);
    } catch (err: any) {
      setError(err.message || "Failed to load tax data");
    } finally {
      setLoading(false);
    }
  }, [year]);

  useEffect(() => { void load(); }, [load]);

  const exportCSV = () => {
    if (!data) return;
    const rows: string[][] = [
      ["LA CREATIVO GROUP LLC — Bizosto Platform Tax Report"],
      [`Tax Year: ${data.year}`],
      [`Jurisdiction: ${data.taxJurisdiction}`],
      [`Filing Schedule: ${data.filingSchedule}`],
      [""],
      ["QUARTERLY SUMMARY"],
      ["Quarter", "Period", "Tax Collected", "Filing Due"],
      ...QUARTERS.map((q) => [
        q.key,
        q.period,
        `$${(data.quarterlyTotals[q.key as keyof typeof data.quarterlyTotals] || 0).toFixed(2)}`,
        q.due,
      ]),
      [""],
      ["ANNUAL TOTAL", "", `$${data.yearTotal.toFixed(2)}`, ""],
      ["ALL-TIME TOTAL", "", `$${data.allTimeTaxCollected.toFixed(2)}`, ""],
      [""],
      ["MONTHLY BREAKDOWN"],
      ["Month", "Tax Collected"],
      ...Object.entries(data.monthlyTotals).map(([month, amount]) => [
        new Date(`${month}-01`).toLocaleDateString("en-US", { month: "long", year: "numeric" }),
        `$${amount.toFixed(2)}`,
      ]),
      [""],
      ["TENANT BREAKDOWN"],
      ["Tenant Name", "Plan", "Tax Paid", "Last Tax Date"],
      ...data.tenantBreakdown.map((t) => [t.tenantName, t.plan, `$${t.taxPaid.toFixed(2)}`, fmtDate(t.lastTaxAt)]),
    ];
    const csv = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `bizosto-tax-report-${data.year}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Tax Filing Dashboard</h1>
          <p className="page-subtitle">LA CREATIVO GROUP, LLC — Austin, Texas — Platform subscription tax</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <select
            className="input"
            style={{ width: 130 }}
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
          >
            {[currentYear, currentYear - 1, currentYear - 2].map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          <button className="btn" onClick={exportCSV} disabled={!data || loading}>
            Export CSV
          </button>
          <a className="btn ghost" href="https://comptroller.texas.gov/taxes/sales/" target="_blank" rel="noreferrer">
            Texas Comptroller ↗
          </a>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-[var(--danger)] bg-[var(--danger-soft)] p-4 text-sm text-[var(--danger)] mt-4">
          {error}
        </div>
      )}

      {loading && (
        <div className="mt-8 text-center text-sm text-[var(--text-muted)]">Loading tax data...</div>
      )}

      {!loading && data && (
        <div className="mt-6 space-y-6">

          <div className="card p-4 rounded-xl" style={{ borderColor: "rgba(245,158,11,0.4)", background: "rgba(254,243,199,0.5)" }}>
            <div className="text-sm font-semibold" style={{ color: "#92400e" }}>⚠ Tax Compliance Notice</div>
            <div className="text-sm mt-1" style={{ color: "#78350f" }}>
              Jurisdiction: <strong>{data.taxJurisdiction}</strong> · Filing: <strong>{data.filingSchedule}</strong> ·
              Export this report each quarter and file at{" "}
              <a href="https://comptroller.texas.gov" target="_blank" rel="noreferrer" className="underline">comptroller.texas.gov</a>.
              Consult your accountant for final filings.
            </div>
          </div>

          <div className="kpis">
            <div className="card kpi-card p-5">
              <div className="text-xs text-[var(--text-muted)] uppercase tracking-widest">Tax Collected {data.year}</div>
              <div className="text-2xl font-black mt-2">{fmt(data.yearTotal)}</div>
              <div className="text-xs text-[var(--text-muted)] mt-1">Texas 8.25% on subscriptions</div>
            </div>
            <div className="card kpi-card p-5">
              <div className="text-xs text-[var(--text-muted)] uppercase tracking-widest">All-Time Total</div>
              <div className="text-2xl font-black mt-2">{fmt(data.allTimeTaxCollected)}</div>
              <div className="text-xs text-[var(--text-muted)] mt-1">Since platform launch</div>
            </div>
            {(["Q1", "Q2"] as const).map((q) => (
              <div key={q} className="card kpi-card p-5">
                <div className="text-xs text-[var(--text-muted)] uppercase tracking-widest">{q} {data.year}</div>
                <div className="text-2xl font-black mt-2">{fmt(data.quarterlyTotals[q] || 0)}</div>
                <div className="text-xs text-[var(--text-muted)] mt-1">
                  {QUARTERS.find((x) => x.key === q)?.period} · Due {QUARTERS.find((x) => x.key === q)?.due}
                </div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {(["Q3", "Q4"] as const).map((q) => (
              <div key={q} className="card kpi-card p-5">
                <div className="text-xs text-[var(--text-muted)] uppercase tracking-widest">{q} {data.year}</div>
                <div className="text-2xl font-black mt-2">{fmt(data.quarterlyTotals[q] || 0)}</div>
                <div className="text-xs text-[var(--text-muted)] mt-1">
                  {QUARTERS.find((x) => x.key === q)?.period} · Due {QUARTERS.find((x) => x.key === q)?.due}
                </div>
              </div>
            ))}
          </div>

          <div className="table-shell">
            <div>
              <table>
                <thead>
                  <tr>
                    <th className="text-left">Month</th>
                    <th className="text-right">Tax Collected</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.keys(data.monthlyTotals).length === 0 ? (
                    <tr><td colSpan={2} className="table-empty">No tax collected in {data.year} yet</td></tr>
                  ) : (
                    Object.entries(data.monthlyTotals).map(([month, amount]) => (
                      <tr key={month}>
                        <td>{new Date(`${month}-01`).toLocaleDateString("en-US", { month: "long", year: "numeric" })}</td>
                        <td className="text-right font-semibold">{fmt(amount)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="table-shell">
            <div>
              <table>
                <thead>
                  <tr>
                    <th className="text-left">Tenant</th>
                    <th className="text-left">Plan</th>
                    <th className="text-right">Tax Paid</th>
                    <th className="text-right">Last Tax Date</th>
                  </tr>
                </thead>
                <tbody>
                  {data.tenantBreakdown.length === 0 ? (
                    <tr><td colSpan={4} className="table-empty">No tenant tax data yet</td></tr>
                  ) : (
                    data.tenantBreakdown.map((t) => (
                      <tr key={t.tenantId}>
                        <td className="font-semibold">{t.tenantName}</td>
                        <td>
                          <span className="inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold bg-[var(--surface-muted)] text-[var(--text-muted)]">
                            {t.plan}
                          </span>
                        </td>
                        <td className="text-right font-semibold">{fmt(t.taxPaid)}</td>
                        <td className="text-right text-[var(--text-muted)]">{fmtDate(t.lastTaxAt)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card p-5">
            <div className="font-bold text-base mb-4">Texas Quarterly Filing Schedule</div>
            <div className="grid gap-3 sm:grid-cols-2">
              {QUARTERS.map((q) => (
                <div key={q.key} className="card p-4">
                  <div className="font-bold">{q.key} — File by {q.due}</div>
                  <div className="text-xs text-[var(--text-muted)] mt-1">{q.period}</div>
                  <div className="text-xs text-[var(--text-muted)]">comptroller.texas.gov · Form 01-117</div>
                </div>
              ))}
            </div>
          </div>

        </div>
      )}
    </div>
  );
}
