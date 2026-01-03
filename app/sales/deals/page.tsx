"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import SalesDrawer from "@/components/sales/SalesDrawer";
import { formatDate, formatUsd } from "@/components/finance/financeUtils";
import { useIsDarkMode } from "@/lib/useIsDarkMode";

const STATUS_OPTIONS = ["All", "Open", "Won", "Lost"];

type DealRecord = {
  id: string;
  dealName: string;
  clientName: string;
  leadName: string;
  leadId?: string | null;
  stage: string;
  status: string;
  valueUsd: number;
  probability: number;
  ownerId?: string | null;
  ownerName?: string | null;
  expectedCloseDate?: string | null;
  closedAt?: string | null;
};

type DealResponse = { ok: boolean; deals: DealRecord[] };

type SortKey = "dealName" | "clientName" | "status" | "valueUsd" | "closedAt";

type SortDir = "asc" | "desc";

type ErrorState = { title: string; message: string };

export default function SalesDealsPage() {
  const isDark = useIsDarkMode();
  const [deals, setDeals] = useState<DealRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ErrorState | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [sortKey, setSortKey] = useState<SortKey>("closedAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [selected, setSelected] = useState<DealRecord | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const loadDeals = useCallback(async () => {
    try {
      setError(null);
      setLoading(true);
      const res = await fetch("/api/sales/deals/list", { cache: "no-store", credentials: "include" });
      const data = (await res.json()) as DealResponse;
      if (!res.ok || !data.ok) {
        throw new Error(data?.error || "Unable to load deals.");
      }
      setDeals(data.deals || []);
    } catch (err) {
      console.error("Deals load error", err);
      setError({ title: "Unable to load deals", message: "Please try again in a moment." });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDeals();
  }, [loadDeals]);

  const filteredDeals = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = [...deals];
    if (statusFilter !== "All") {
      list = list.filter((deal) => deal.status === statusFilter || deal.stage === `Closed ${statusFilter}`);
    }
    if (q) {
      list = list.filter((deal) => {
        const hay = [deal.dealName, deal.clientName, deal.leadName, deal.ownerName]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return hay.includes(q);
      });
    }
    return list;
  }, [deals, query, statusFilter]);

  const sortedDeals = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    const list = [...filteredDeals];
    list.sort((a, b) => {
      const valA = String(a[sortKey] ?? "");
      const valB = String(b[sortKey] ?? "");
      return valA.localeCompare(valB) * dir;
    });
    return list;
  }, [filteredDeals, sortDir, sortKey]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const sortBadge = (key: SortKey) => {
    if (sortKey !== key) return "";
    return sortDir === "asc" ? "▲" : "▼";
  };

  const headerLabel = (label: string, badge?: string) => (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <span>{label}</span>
      <span style={{ width: 14, display: "inline-block", textAlign: "center", opacity: badge ? 1 : 0.35 }}>
        {badge || "•"}
      </span>
    </span>
  );

  const tableShellStyle: React.CSSProperties = {
    borderRadius: 20,
    padding: 14,
    border: isDark ? "1px solid rgba(255,255,255,0.08)" : "1px solid rgba(15,23,42,0.10)",
    background: isDark ? "rgba(20,20,20,0.92)" : "rgba(255,255,255,0.85)",
    boxShadow: isDark ? "0 18px 40px rgba(0,0,0,0.45)" : "0 18px 55px rgba(15,23,42,0.10)",
  };

  const headerCellStyle: React.CSSProperties = {
    padding: "12px 14px",
    fontSize: 11,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: isDark ? "rgba(226,232,240,0.66)" : "rgba(15,23,42,0.55)",
    borderBottom: isDark ? "1px solid rgba(255,255,255,0.08)" : "1px solid rgba(15,23,42,0.10)",
    cursor: "pointer",
    userSelect: "none",
    whiteSpace: "nowrap",
    textAlign: "left",
  };

  const cellStyle: React.CSSProperties = {
    padding: "12px 14px",
    borderBottom: isDark ? "1px solid rgba(255,255,255,0.06)" : "1px dashed rgba(15,23,42,0.10)",
    color: isDark ? "rgba(226,232,240,0.86)" : "rgba(15,23,42,0.85)",
    whiteSpace: "nowrap",
    fontWeight: 400,
  };

  const openDrawer = (deal: DealRecord) => {
    setSelected(deal);
    setDrawerOpen(true);
  };

  const closeDeal = async (deal: DealRecord, status: "Won" | "Lost") => {
    try {
      setActionLoading(deal.id + status);
      const res = await fetch("/api/sales/deals/close", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ id: deal.id, status }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data?.error || "Unable to close deal.");
      }
      await loadDeals();
    } catch (err) {
      console.error("Deal close error", err);
      setError({ title: "Unable to close deal", message: "Please try again." });
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="w-full">
      {error && (
        <div
          className="card"
          style={{
            borderRadius: 14,
            padding: 16,
            border: "1px solid rgba(239,68,68,0.35)",
            background: isDark ? "rgba(127,29,29,0.2)" : "rgba(254,226,226,0.6)",
            color: isDark ? "#fecaca" : "#991b1b",
            fontWeight: 600,
            marginBottom: 16,
          }}
        >
          <div style={{ fontWeight: 700 }}>{error.title}</div>
          <div style={{ fontSize: 13, opacity: 0.9 }}>{error.message}</div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 style={{ fontSize: 20, fontWeight: 700 }}>Deals</h3>
          <p style={{ fontSize: 13, color: "var(--sidebar-text)" }}>
            Track closed outcomes and trigger downstream automation.
          </p>
        </div>
      </div>

      <div className="card" style={{ marginTop: 18, padding: 18, borderRadius: 18 }}>
        <div className="grid gap-4 md:grid-cols-[1.4fr_0.6fr]">
          <div>
            <label className="text-xs font-semibold text-slate-500">Search</label>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search keyword"
              className="input mt-2"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500">Status</label>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="input mt-2"
            >
              {STATUS_OPTIONS.map((status) => (
                <option key={status} value={status}>
                  {status === "All" ? "All statuses" : status}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div style={{ marginTop: 20 }}>
        <div style={tableShellStyle}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 980 }}>
              <thead>
                <tr style={{ background: isDark ? "rgba(30,30,30,0.9)" : "rgba(248,250,252,0.9)" }}>
                  <th style={headerCellStyle} onClick={() => toggleSort("dealName")}>
                    {headerLabel("Deal", sortBadge("dealName"))}
                  </th>
                  <th style={headerCellStyle} onClick={() => toggleSort("clientName")}>
                    {headerLabel("Client", sortBadge("clientName"))}
                  </th>
                  <th style={headerCellStyle}>Owner</th>
                  <th style={{ ...headerCellStyle, textAlign: "center" }} onClick={() => toggleSort("status")}>
                    {headerLabel("Status", sortBadge("status"))}
                  </th>
                  <th style={{ ...headerCellStyle, textAlign: "left" }} onClick={() => toggleSort("valueUsd")}>
                    {headerLabel("Value", sortBadge("valueUsd"))}
                  </th>
                  <th style={{ ...headerCellStyle, textAlign: "left" }} onClick={() => toggleSort("closedAt")}>
                    {headerLabel("Closed", sortBadge("closedAt"))}
                  </th>
                  <th style={{ ...headerCellStyle, textAlign: "center" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={7} style={{ padding: 24, textAlign: "center" }}>
                      Loading deals...
                    </td>
                  </tr>
                ) : sortedDeals.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ padding: 24, textAlign: "center" }}>
                      No deals found.
                    </td>
                  </tr>
                ) : (
                  sortedDeals.map((deal) => (
                    <tr key={deal.id}>
                      <td style={cellStyle}>{deal.dealName || deal.leadName || "-"}</td>
                      <td style={cellStyle}>{deal.clientName || "-"}</td>
                      <td style={cellStyle}>{deal.ownerName || "Unassigned"}</td>
                      <td style={{ ...cellStyle, textAlign: "center" }}>{deal.status || "Open"}</td>
                      <td style={{ ...cellStyle, textAlign: "center" }}>{formatUsd(deal.valueUsd)}</td>
                      <td style={{ ...cellStyle, textAlign: "center" }}>{formatDate(deal.closedAt)}</td>
                      <td style={{ ...cellStyle, textAlign: "center" }}>
                        <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
                          <button className="btn ghost" onClick={() => openDrawer(deal)} style={{ borderRadius: 999 }}>
                            View
                          </button>
                          <button
                            className="btn"
                            onClick={() => closeDeal(deal, "Won")}
                            disabled={actionLoading === deal.id + "Won"}
                            style={{ borderRadius: 999 }}
                          >
                            {actionLoading === deal.id + "Won" ? "Closing" : "Closed Won"}
                          </button>
                          <button
                            className="btn ghost"
                            onClick={() => closeDeal(deal, "Lost")}
                            disabled={actionLoading === deal.id + "Lost"}
                            style={{ borderRadius: 999 }}
                          >
                            {actionLoading === deal.id + "Lost" ? "Closing" : "Closed Lost"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {drawerOpen && selected && (
        <SalesDrawer
          title={selected.dealName || "Deal"}
          subtitle="Deal snapshot"
          onClose={() => setDrawerOpen(false)}
        >
          <div className="grid gap-3 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-500">Client</span>
              <span>{selected.clientName || "-"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Stage</span>
              <span>{selected.stage || "Open"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Value</span>
              <span>{formatUsd(selected.valueUsd)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Probability</span>
              <span>{selected.probability}%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Expected Close</span>
              <span>{formatDate(selected.expectedCloseDate)}</span>
            </div>
          </div>
        </SalesDrawer>
      )}
    </div>
  );
}
