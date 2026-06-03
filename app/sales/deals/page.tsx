"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import SalesDrawer from "@/components/sales/SalesDrawer";
import { formatDate, formatUsd } from "@/components/finance/financeUtils";
import { TableSkeleton } from "@/components/ui/Skeleton";

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
  listPriceUsd?: number;
  discountPct?: number;
  discountUsd?: number;
  finalPriceUsd?: number;
  discountReason?: string | null;
  discountApproved?: boolean;
  discountStatus?: string;
  probability: number;
  ownerId?: string | null;
  ownerName?: string | null;
  expectedCloseDate?: string | null;
  closedAt?: string | null;
};

type DealResponse = { ok: boolean; error?: string; deals: DealRecord[] };
type DealResponseWithSettings = DealResponse & { discountApprovalThresholdPct?: number };

type SortKey = "dealName" | "clientName" | "status" | "valueUsd" | "closedAt";

type SortDir = "asc" | "desc";

type ErrorState = { title: string; message: string };

export default function SalesDealsPage() {
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
  const [discountThreshold, setDiscountThreshold] = useState(0);
  const [discountPct, setDiscountPct] = useState(0);
  const [discountReason, setDiscountReason] = useState("");
  const [discountSaving, setDiscountSaving] = useState(false);
  const [discountError, setDiscountError] = useState<string | null>(null);

  const loadDeals = useCallback(async () => {
    try {
      setError(null);
      setLoading(true);
      const res = await fetch("/api/sales/deals/list", { cache: "no-store", credentials: "include" });
      const data = (await res.json()) as DealResponseWithSettings;
      if (!res.ok || !data.ok) {
        throw new Error(data?.error || "Unable to load deals.");
      }
      setDeals(data.deals || []);
      setDiscountThreshold(Number(data.discountApprovalThresholdPct ?? 0));
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

  useEffect(() => {
    if (!selected) return;
    const match = deals.find((deal) => deal.id === selected.id);
    if (match) {
      setSelected(match);
      setDiscountPct(match.discountPct ?? 0);
      setDiscountReason(match.discountReason || "");
    }
  }, [deals, selected?.id]);

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

  const headerCellStyle: React.CSSProperties = {
    padding: "12px 14px",
    fontSize: 11,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
    borderBottom: "1px solid var(--border-subtle)",
    cursor: "pointer",
    userSelect: "none",
    whiteSpace: "nowrap",
    textAlign: "left",
  };

  const cellStyle: React.CSSProperties = {
    padding: "12px 14px",
    borderBottom: "1px dashed var(--border-subtle)",
    color: "var(--text-primary)",
    whiteSpace: "nowrap",
    fontWeight: 400,
  };

  const openDrawer = (deal: DealRecord) => {
    setSelected(deal);
    setDrawerOpen(true);
    setDiscountPct(deal.discountPct ?? 0);
    setDiscountReason(deal.discountReason || "");
    setDiscountError(null);
  };

  const closeDeal = async (deal: DealRecord, status: "Won" | "Lost") => {
    try {
      setActionLoading(deal.id + status);
      const res = await fetch("/api/sales/deals/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ id: deal.id, status, stage: status === "Won" ? "Closed Won" : "Closed Lost" }),
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

  const saveDiscount = async () => {
    if (!selected) return;
    try {
      setDiscountSaving(true);
      setDiscountError(null);
      const res = await fetch("/api/sales/deals/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          id: selected.id,
          discountPct,
          discountReason,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data?.error || "Unable to update discount.");
      }
      await loadDeals();
    } catch (err: any) {
      console.error("Discount update error", err);
      setDiscountError(err?.message || "Unable to update discount.");
    } finally {
      setDiscountSaving(false);
    }
  };

  const discountStatusLabel = (deal: DealRecord) => {
    const status = (deal.discountStatus || "none").toLowerCase();
    if (status === "auto_approved") return "Auto-approved";
    if (status === "pending") return "Pending approval";
    if (status === "approved") return "Approved";
    if (status === "rejected") return "Rejected";
    return "None";
  };

  const discountStatusTone = (deal: DealRecord) => {
    const status = (deal.discountStatus || "none").toLowerCase();
    if (status === "pending") return { background: "rgba(251,191,36,0.15)", color: "#b45309" };
    if (status === "approved" || status === "auto_approved") return { background: "rgba(34,197,94,0.15)", color: "#15803d" };
    if (status === "rejected") return { background: "rgba(248,113,113,0.15)", color: "#b91c1c" };
    return { background: "rgba(148,163,184,0.15)", color: "var(--text-muted)" };
  };

  const isDiscountBlocked = (deal: DealRecord) => {
    const status = (deal.discountStatus || "none").toLowerCase();
    const pct = Number(deal.discountPct || 0);
    if (status === "pending" || status === "rejected") return true;
    if (pct > discountThreshold && !deal.discountApproved) return true;
    return false;
  };

  const previewFinalPrice = (deal: DealRecord, pct: number) => {
    const listPrice = Number(deal.listPriceUsd ?? deal.valueUsd ?? 0);
    const discountUsd = (listPrice * pct) / 100;
    return Math.max(listPrice - discountUsd, 0);
  };

  const deleteDeal = async (id: string) => {
    if (!window.confirm("Delete this deal?")) return;
    try {
      setActionLoading(`delete-${id}`);
      const res = await fetch("/api/sales/deals/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ id, isDeleted: true }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data?.error || "Unable to delete deal.");
      await loadDeals();
    } catch (err) {
      console.error("Deal delete error", err);
      setError({ title: "Unable to delete deal", message: "Please try again." });
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="page-frame w-full">
      {error && (
        <div
          className="card"
          style={{
            borderRadius: 14,
            padding: 16,
            border: "1px solid rgba(239,68,68,0.35)",
            background: "var(--danger-soft)",
            color: "var(--danger)",
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
            <label className="text-xs font-semibold text-[var(--text-muted)]">Search</label>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search keyword"
              className="input mt-2"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-[var(--text-muted)]">Status</label>
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
        <div className="table-shell">
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 980 }}>
              <thead>
                <tr style={{ background: "var(--surface-muted)" }}>
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
                    <td colSpan={7} style={{ padding: 24 }}>
                      <TableSkeleton rows={6} columns={7} />
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
                            disabled={actionLoading === deal.id + "Won" || isDiscountBlocked(deal)}
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
                          <button
                            className="btn ghost"
                            onClick={() => deleteDeal(deal.id)}
                            disabled={actionLoading === `delete-${deal.id}`}
                            style={{ borderRadius: 999 }}
                          >
                            {actionLoading === `delete-${deal.id}` ? "Deleting" : "Delete"}
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
              <span className="text-[var(--text-muted)]">Client</span>
              <span>{selected.clientName || "-"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--text-muted)]">Stage</span>
              <span>{selected.stage || "Open"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--text-muted)]">Value</span>
              <span>{formatUsd(selected.valueUsd)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--text-muted)]">Probability</span>
              <span>{selected.probability}%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--text-muted)]">Expected Close</span>
              <span>{formatDate(selected.expectedCloseDate)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[var(--text-muted)]">Discount Status</span>
              <span
                style={{
                  padding: "4px 10px",
                  borderRadius: 999,
                  fontSize: 12,
                  fontWeight: 600,
                  ...discountStatusTone(selected),
                }}
              >
                {discountStatusLabel(selected)}
              </span>
            </div>
          </div>

          <div className="mt-5 border-t border-slate-200/40 pt-4">
            <div className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Discount Controls</div>
            {discountError && <div className="mt-2 text-xs text-red-400">{discountError}</div>}
            <div className="mt-3 grid gap-3 text-sm">
              <div className="flex justify-between">
                <span className="text-[var(--text-muted)]">List Price (USD)</span>
                <span>{formatUsd(selected.listPriceUsd ?? selected.valueUsd)}</span>
              </div>
              <label className="grid gap-2">
                <span className="text-[var(--text-muted)]">Discount %</span>
                <input
                  className="input"
                  type="number"
                  min={0}
                  max={80}
                  value={discountPct}
                  onChange={(e) => setDiscountPct(Number(e.target.value))}
                />
              </label>
              {discountPct > 0 && (
                <label className="grid gap-2">
                  <span className="text-[var(--text-muted)]">Reason</span>
                  <textarea
                    className="input"
                    rows={3}
                    value={discountReason}
                    onChange={(e) => setDiscountReason(e.target.value)}
                  />
                </label>
              )}
              <div className="flex justify-between">
                <span className="text-[var(--text-muted)]">Final Price</span>
                <span>{formatUsd(previewFinalPrice(selected, discountPct))}</span>
              </div>
            </div>
            <div className="mt-3 flex justify-end">
              <button
                className="btn"
                onClick={saveDiscount}
                disabled={discountSaving || (discountPct > 0 && !discountReason.trim())}
                style={{ borderRadius: 999 }}
              >
                {discountSaving
                  ? "Saving..."
                  : discountPct > discountThreshold
                  ? "Request Approval"
                  : "Save Discount"}
              </button>
            </div>
          </div>
        </SalesDrawer>
      )}
    </div>
  );
}
