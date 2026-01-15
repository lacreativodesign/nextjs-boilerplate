"use client";

import { useEffect, useMemo, useState } from "react";
import { formatUsd } from "@/components/finance/financeUtils";
import MasterSelect from "@/components/ui/MasterSelect";
import { CardShell, ErrorCard, KpiCard, useSortableData } from "@/app/admin/reports/_components/ReportsUI";

type ProfitLossSummary = {
  revenueUsd: number;
  expenseUsd: number;
  profitUsd: number;
  marginPct: number;
  source: "snapshot" | "live";
};

type CashflowSummary = {
  invoicesIssuedUsd: number;
  paymentsReceivedUsd: number;
  outstandingBalanceUsd: number;
  overdueInvoicesCount: number;
};

type ClientProfitRow = {
  clientId: string;
  clientName: string;
  revenueUsd: number;
  estimatedCostUsd: number;
  profitUsd: number;
  marginPct: number;
  flagLowMargin: boolean;
};

type ReportsState = {
  profitLoss: ProfitLossSummary | null;
  cashflow: CashflowSummary | null;
  clientProfitability: ClientProfitRow[];
};

const rangeOptions = [
  { label: "Today", value: "today" },
  { label: "Last 7 days", value: "7d" },
  { label: "Last 30 days", value: "30d" },
  { label: "Custom", value: "custom" },
];

export default function FinancialReports({ apiPrefix }: { apiPrefix: string }) {
  const [range, setRange] = useState("30d");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [data, setData] = useState<ReportsState>({
    profitLoss: null,
    cashflow: null,
    clientProfitability: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<keyof ClientProfitRow>("profitUsd");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

  const queryParams = useMemo(() => {
    const params = new URLSearchParams();
    if (range) params.set("range", range);
    if (range === "custom") {
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);
    }
    return params.toString();
  }, [range, dateFrom, dateTo]);

  const loadReports = async () => {
    try {
      setLoading(true);
      setError(null);
      const [plRes, cashRes, clientRes] = await Promise.all([
        fetch(`${apiPrefix}/profit-loss?${queryParams}`, { cache: "no-store", credentials: "include" }),
        fetch(`${apiPrefix}/cashflow?${queryParams}`, { cache: "no-store", credentials: "include" }),
        fetch(`${apiPrefix}/client-profitability?${queryParams}`, { cache: "no-store", credentials: "include" }),
      ]);

      const [plJson, cashJson, clientJson] = await Promise.all([plRes.json(), cashRes.json(), clientRes.json()]);

      if (!plRes.ok || !plJson?.ok) throw new Error(plJson?.error || "Unable to load P&L.");
      if (!cashRes.ok || !cashJson?.ok) throw new Error(cashJson?.error || "Unable to load cashflow.");
      if (!clientRes.ok || !clientJson?.ok) throw new Error(clientJson?.error || "Unable to load client profitability.");

      setData({
        profitLoss: plJson.summary || null,
        cashflow: cashJson.summary || null,
        clientProfitability: clientJson.clients || [],
      });
    } catch (err: any) {
      console.error("financial reports load error", err);
      setError(err?.message || "Unable to load reports right now.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReports();
  }, [queryParams]);

  const sortedClients = useSortableData(data.clientProfitability, sortKey, sortDirection);

  const downloadCsv = (path: string) => {
    const url = queryParams ? `${path}?${queryParams}` : path;
    window.open(url, "_blank");
  };

  return (
    <div className="space-y-6">
      {error && <ErrorCard message={error} />}

      <CardShell>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div style={{ fontWeight: 700 }}>Report filters</div>
            <div className="text-xs text-[var(--text-muted)]">
              P&L snapshots are used when a full month range is selected.
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <MasterSelect value={range} onChange={setRange} options={rangeOptions} />
            {range === "custom" && (
              <>
                <input className="input" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
                <input className="input" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
              </>
            )}
            <button className="btn" onClick={loadReports} style={{ borderRadius: 999 }}>
              Refresh
            </button>
          </div>
        </div>
      </CardShell>

      <section>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div style={{ fontSize: 16, fontWeight: 700 }}>Profit &amp; Loss (USD)</div>
          <div className="flex flex-wrap gap-2">
            <button className="btn" onClick={() => downloadCsv(`${apiPrefix}/exports/profit-loss`)} style={{ borderRadius: 999 }}>
              Export CSV
            </button>
            <button
              className="btn ghost"
              onClick={() => downloadCsv(`${apiPrefix}/exports/finance-pdf`)}
              style={{ borderRadius: 999 }}
            >
              Export PDF
            </button>
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4" style={{ marginTop: 12 }}>
          <KpiCard title="Revenue" value={loading ? "—" : formatUsd(data.profitLoss?.revenueUsd || 0)} />
          <KpiCard title="Expenses" value={loading ? "—" : formatUsd(data.profitLoss?.expenseUsd || 0)} />
          <KpiCard title="Gross Profit" value={loading ? "—" : formatUsd(data.profitLoss?.profitUsd || 0)} />
          <KpiCard
            title="Margin %"
            value={loading ? "—" : `${(data.profitLoss?.marginPct || 0).toFixed(1)}%`}
            subtitle={data.profitLoss?.source === "snapshot" ? "Snapshot" : "Live"}
          />
        </div>
      </section>

      <section>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div style={{ fontSize: 16, fontWeight: 700 }}>Cashflow</div>
          <button className="btn" onClick={() => downloadCsv(`${apiPrefix}/exports/cashflow`)} style={{ borderRadius: 999 }}>
            Export CSV
          </button>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4" style={{ marginTop: 12 }}>
          <KpiCard title="Invoices issued" value={loading ? "—" : formatUsd(data.cashflow?.invoicesIssuedUsd || 0)} />
          <KpiCard title="Payments received" value={loading ? "—" : formatUsd(data.cashflow?.paymentsReceivedUsd || 0)} />
          <KpiCard title="Outstanding balance" value={loading ? "—" : formatUsd(data.cashflow?.outstandingBalanceUsd || 0)} />
          <KpiCard title="Overdue invoices" value={loading ? "—" : `${data.cashflow?.overdueInvoicesCount || 0}`} />
        </div>
      </section>

      <section>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div style={{ fontSize: 16, fontWeight: 700 }}>Client Profitability</div>
          <div className="flex flex-wrap gap-2">
            <button
              className="btn"
              onClick={() => downloadCsv(`${apiPrefix}/exports/client-profitability`)}
              style={{ borderRadius: 999 }}
            >
              Export CSV
            </button>
            <button className="btn ghost" onClick={() => downloadCsv(`${apiPrefix}/exports/invoices`)} style={{ borderRadius: 999 }}>
              Export invoices
            </button>
          </div>
        </div>

        <div className="card" style={{ padding: 0, borderRadius: 18, overflow: "hidden", marginTop: 12 }}>
          <div style={{ overflowX: "auto" }}>
            <table className="table" style={{ minWidth: 760 }}>
              <thead>
                <tr>
                  <th>Client</th>
                  <th className="text-right">Revenue</th>
                  <th className="text-right">Estimated Cost</th>
                  <th className="text-right">
                    <button
                      type="button"
                      className="btn ghost"
                      style={{ padding: 0, height: "auto" }}
                      onClick={() => {
                        if (sortKey === "profitUsd") {
                          setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
                        } else {
                          setSortKey("profitUsd");
                          setSortDirection("desc");
                        }
                      }}
                    >
                      Profit
                    </button>
                  </th>
                  <th className="text-right">Margin %</th>
                  <th>Flag</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td colSpan={6} className="text-sm text-[var(--text-muted)]">
                      Loading client profitability...
                    </td>
                  </tr>
                )}
                {!loading && sortedClients.length === 0 && (
                  <tr>
                    <td colSpan={6} className="text-sm text-[var(--text-muted)]">
                      No client profitability data for this range.
                    </td>
                  </tr>
                )}
                {!loading &&
                  sortedClients.map((client) => (
                    <tr key={client.clientId}>
                      <td>{client.clientName}</td>
                      <td className="text-right">{formatUsd(client.revenueUsd)}</td>
                      <td className="text-right">{formatUsd(client.estimatedCostUsd)}</td>
                      <td className="text-right">{formatUsd(client.profitUsd)}</td>
                      <td className="text-right">{client.marginPct.toFixed(1)}%</td>
                      <td>{client.flagLowMargin ? "Below 20%" : "—"}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}
