"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import MasterSelect from "@/components/ui/MasterSelect";
import {
  formatDate,
  formatDateTime,
  formatUsd,
  useIsSystemDark,
} from "@/components/finance/financeUtils";
import type { PaymentRecord } from "@/lib/finance/types";
import { TableSkeleton } from "@/components/ui/Skeleton";

const STATUS_OPTIONS = [
  "",
  "Pending",
  "Paid",
  "Failed",
  "Refunded",
].map((status) => ({ label: status || "All Statuses", value: status }));

const METHOD_OPTIONS = [
  "",
  "Card",
  "Bank",
  "Cash",
  "PayPal",
  "Wise",
  "Other",
].map((method) => ({ label: method || "All Methods", value: method }));

type ClientOption = { id: string; companyName: string };

type SortKey = "id" | "clientName" | "method" | "amountUsd" | "paidAt" | "createdAt" | "status";

type SortDir = "asc" | "desc";

type CurrentUser = { uid: string; role: string; name?: string };

type ErrorState = { title: string; message: string };

export default function FinancePaymentsPage() {
  const isDark = useIsSystemDark();
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ErrorState | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [methodFilter, setMethodFilter] = useState("");
  const [clientFilter, setClientFilter] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("createdAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [selectedPayment, setSelectedPayment] = useState<PaymentRecord | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const loadPayments = useCallback(async () => {
    try {
      setError(null);
      setLoading(true);
      const res = await fetch("/api/admin/finance/payments/list", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data?.error || "Unable to load payments.");
      }
      setPayments(data.payments || []);
      setCurrentUser(data.currentUser || null);
    } catch (err: any) {
      console.error("Payments load error", err);
      setError({ title: "Unable to load payments", message: "Please try again in a moment." });
    } finally {
      setLoading(false);
    }
  }, []);

  const loadClients = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/clients/list", { cache: "no-store" });
      const data = await res.json();
      if (res.ok && data.ok) {
        setClients(data.clients || []);
      }
    } catch (err) {
      console.error("Failed to load clients", err);
    }
  }, []);

  useEffect(() => {
    loadPayments();
    loadClients();
  }, [loadPayments, loadClients]);

  const canAdmin = useMemo(() => {
    const role = (currentUser?.role || "").toLowerCase();
    return role === "admin" || role === "super_admin";
  }, [currentUser?.role]);

  const filteredPayments = useMemo(() => {
    const q = query.trim().toLowerCase();
    const start = startDate ? new Date(startDate).getTime() : null;
    const end = endDate ? new Date(endDate).getTime() : null;

    return payments.filter((payment) => {
      if (statusFilter && payment.status !== statusFilter) return false;
      if (methodFilter && payment.method !== methodFilter) return false;
      if (clientFilter && payment.clientId !== clientFilter) return false;
      if (q) {
        const hay = [payment.id, payment.clientName, payment.method, payment.orderId]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      const paidAt = payment.paidAt ? new Date(payment.paidAt).getTime() : null;
      if (start && (!paidAt || paidAt < start)) return false;
      if (end && (!paidAt || paidAt > end + 86400000)) return false;
      return true;
    });
  }, [payments, query, statusFilter, methodFilter, clientFilter, startDate, endDate]);

  const sortedPayments = useMemo(() => {
    const list = [...filteredPayments];
    list.sort((a, b) => {
      const dir = sortDir === "asc" ? 1 : -1;
      if (sortKey === "amountUsd") return (a.amountUsd - b.amountUsd) * dir;
      if (sortKey === "paidAt") return String(a.paidAt || "").localeCompare(String(b.paidAt || "")) * dir;
      if (sortKey === "createdAt") return String(a.createdAt || "").localeCompare(String(b.createdAt || "")) * dir;
      return String(a[sortKey] || "").localeCompare(String(b[sortKey] || "")) * dir;
    });
    return list;
  }, [filteredPayments, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const openDrawer = (payment: PaymentRecord) => {
    setSelectedPayment(payment);
    setDrawerOpen(true);
  };

  const closeDrawer = () => {
    setDrawerOpen(false);
    setSelectedPayment(null);
  };

  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeDrawer();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawerOpen]);

  const handleAction = async (payment: PaymentRecord, action: "mark_paid" | "refund") => {
    try {
      setActionLoading(payment.id);
      const res = await fetch("/api/admin/finance/payments/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: payment.id, action }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data?.error || "Unable to update payment.");
      }
      await loadPayments();
    } catch (err) {
      console.error("Payment update error", err);
      setError({ title: "Unable to update payment", message: "Please try again." });
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div>
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

      <div>
        <h3 style={{ fontSize: 20, fontWeight: 700 }}>Payments</h3>
        <p style={{ fontSize: 13, color: "var(--sidebar-text)" }}>
          USD receipts, methods, and settlement status.
        </p>
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        <input
          className="input"
          placeholder="Search keyword"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ minWidth: 220 }}
        />
        <MasterSelect value={statusFilter} onChange={(value) => setStatusFilter(value)} options={STATUS_OPTIONS} />
        <MasterSelect value={methodFilter} onChange={(value) => setMethodFilter(value)} options={METHOD_OPTIONS} />
        <MasterSelect
          value={clientFilter}
          onChange={(value) => setClientFilter(value)}
          options={[{ label: "All Clients", value: "" }, ...clients.map((c) => ({ label: c.companyName, value: c.id }))]}
        />
        <input className="input" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        <input className="input" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        <button
          type="button"
          className="btn"
          onClick={() => {
            setQuery("");
            setStatusFilter("");
            setMethodFilter("");
            setClientFilter("");
            setStartDate("");
            setEndDate("");
          }}
          style={{ borderRadius: 999, padding: "10px 16px", fontWeight: 500 }}
        >
          Reset Filters
        </button>
      </div>

      <div
        className="card"
        style={{
          marginTop: 20,
          padding: 0,
          borderRadius: 18,
          background: isDark ? "rgba(20,20,20,0.92)" : "rgba(255,255,255,0.95)",
          border: isDark ? "1px solid rgba(255,255,255,0.08)" : "1px solid rgba(15,23,42,0.08)",
          boxShadow: isDark ? "0 18px 40px rgba(0,0,0,0.35)" : "0 18px 40px rgba(15,23,42,0.08)",
          overflow: "hidden",
        }}
      >
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 960 }}>
            <thead>
              <tr style={{ background: isDark ? "rgba(30,30,30,0.9)" : "rgba(248,250,252,0.9)" }}>
                <th style={{ textAlign: "left", padding: "14px 16px", fontWeight: 700 }}>
                  <button type="button" onClick={() => toggleSort("id")} style={headerButtonStyle}>
                    Payment ID {sortKey === "id" ? (sortDir === "asc" ? "▲" : "▼") : ""}
                  </button>
                </th>
                <th style={{ textAlign: "left", padding: "14px 16px", fontWeight: 700 }}>
                  <button type="button" onClick={() => toggleSort("clientName")} style={headerButtonStyle}>
                    Client {sortKey === "clientName" ? (sortDir === "asc" ? "▲" : "▼") : ""}
                  </button>
                </th>
                <th style={{ textAlign: "left", padding: "14px 16px", fontWeight: 700 }}>
                  <button type="button" onClick={() => toggleSort("method")} style={headerButtonStyle}>
                    Method {sortKey === "method" ? (sortDir === "asc" ? "▲" : "▼") : ""}
                  </button>
                </th>
                <th style={{ textAlign: "right", padding: "14px 16px", fontWeight: 700 }}>
                  <button type="button" onClick={() => toggleSort("amountUsd")} style={headerButtonStyle}>
                    Amount (USD) {sortKey === "amountUsd" ? (sortDir === "asc" ? "▲" : "▼") : ""}
                  </button>
                </th>
                <th style={{ textAlign: "center", padding: "14px 16px", fontWeight: 700 }}>
                  <button type="button" onClick={() => toggleSort("paidAt")} style={headerButtonStyle}>
                    Paid At {sortKey === "paidAt" ? (sortDir === "asc" ? "▲" : "▼") : ""}
                  </button>
                </th>
                <th style={{ textAlign: "center", padding: "14px 16px", fontWeight: 700 }}>
                  <button type="button" onClick={() => toggleSort("createdAt")} style={headerButtonStyle}>
                    Created {sortKey === "createdAt" ? (sortDir === "asc" ? "▲" : "▼") : ""}
                  </button>
                </th>
                <th style={{ textAlign: "center", padding: "14px 16px", fontWeight: 700 }}>
                  <button type="button" onClick={() => toggleSort("status")} style={headerButtonStyle}>
                    Status {sortKey === "status" ? (sortDir === "asc" ? "▲" : "▼") : ""}
                  </button>
                </th>
                <th style={{ textAlign: "center", padding: "14px 16px", fontWeight: 700 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} style={{ padding: 24 }}>
                    <TableSkeleton rows={7} columns={8} />
                  </td>
                </tr>
              ) : sortedPayments.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: "center", padding: 40 }}>
                    No payments found.
                  </td>
                </tr>
              ) : (
                sortedPayments.map((payment, idx) => {
                  const rowBg =
                    idx % 2 === 0
                      ? isDark
                        ? "rgba(255,255,255,0.02)"
                        : "rgba(15,23,42,0.02)"
                      : "transparent";
                  const hoverBg = isDark ? "rgba(255,255,255,0.05)" : "rgba(15,23,42,0.03)";
                  return (
                    <tr
                      key={payment.id}
                      style={{ background: rowBg, transition: "background 120ms ease" }}
                      onMouseEnter={(event) => {
                        (event.currentTarget as HTMLTableRowElement).style.background = hoverBg;
                      }}
                      onMouseLeave={(event) => {
                        (event.currentTarget as HTMLTableRowElement).style.background = rowBg;
                      }}
                    >
                      <td style={{ padding: "14px 16px", textAlign: "left" }}>
                        <div style={{ fontWeight: 600 }}>{payment.id}</div>
                        <div style={{ fontSize: 12, opacity: 0.65 }}>{payment.orderId || payment.invoiceId || ""}</div>
                      </td>
                      <td style={{ padding: "14px 16px", textAlign: "left" }}>{payment.clientName}</td>
                      <td style={{ padding: "14px 16px", textAlign: "left" }}>{payment.method}</td>
                      <td style={{ padding: "14px 16px", textAlign: "right" }}>{formatUsd(payment.amountUsd)}</td>
                      <td style={{ padding: "14px 16px", textAlign: "center" }}>{formatDate(payment.paidAt)}</td>
                      <td style={{ padding: "14px 16px", textAlign: "center" }}>{formatDate(payment.createdAt)}</td>
                      <td style={{ padding: "14px 16px", textAlign: "center" }}>{renderStatus(payment.status, isDark)}</td>
                      <td style={{ padding: "14px 16px", textAlign: "center" }}>
                        <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
                          <button
                            type="button"
                            className="btn ghost"
                            onClick={() => openDrawer(payment)}
                            style={{ padding: "6px 12px", borderRadius: 999, fontSize: 12 }}
                          >
                            View
                          </button>
                          {canAdmin && payment.status === "Pending" && (
                            <button
                              type="button"
                              className="btn"
                              onClick={() => handleAction(payment, "mark_paid")}
                              disabled={actionLoading === payment.id}
                              style={{ padding: "6px 12px", borderRadius: 999, fontSize: 12 }}
                            >
                              {actionLoading === payment.id ? "Updating" : "Mark Paid"}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {drawerOpen && selectedPayment && (
        <PaymentDrawer
          payment={selectedPayment}
          isDark={isDark}
          canAdmin={canAdmin}
          onClose={closeDrawer}
          onAction={handleAction}
          actionLoading={actionLoading === selectedPayment.id}
        />
      )}
    </div>
  );
}

const headerButtonStyle = {
  background: "none",
  border: "none",
  fontWeight: 700,
  cursor: "pointer",
} as const;

function renderStatus(status: string, isDark: boolean) {
  const base = {
    padding: "4px 10px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 600,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minWidth: 90,
  } as const;

  const token = status.toLowerCase();
  if (token.includes("paid")) {
    return (
      <span
        style={{
          ...base,
          color: isDark ? "#bbf7d0" : "#047857",
          background: isDark ? "rgba(34,197,94,0.18)" : "rgba(34,197,94,0.12)",
          border: "1px solid rgba(34,197,94,0.3)",
        }}
      >
        {status}
      </span>
    );
  }

  if (token.includes("failed") || token.includes("refund")) {
    return (
      <span
        style={{
          ...base,
          color: isDark ? "#fecaca" : "#b91c1c",
          background: isDark ? "rgba(239,68,68,0.18)" : "rgba(239,68,68,0.12)",
          border: "1px solid rgba(239,68,68,0.35)",
        }}
      >
        {status}
      </span>
    );
  }

  return (
    <span
      style={{
        ...base,
        color: isDark ? "#e2e8f0" : "#1f2937",
        background: isDark ? "rgba(148,163,184,0.15)" : "rgba(148,163,184,0.2)",
        border: "1px solid rgba(148,163,184,0.3)",
      }}
    >
      {status}
    </span>
  );
}

function PaymentDrawer({
  payment,
  isDark,
  canAdmin,
  onClose,
  onAction,
  actionLoading,
}: {
  payment: PaymentRecord;
  isDark: boolean;
  canAdmin: boolean;
  onClose: () => void;
  onAction: (payment: PaymentRecord, action: "mark_paid" | "refund") => void;
  actionLoading: boolean;
}) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 60,
        background: isDark ? "rgba(0,0,0,0.55)" : "rgba(15,23,42,0.35)",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          width: "min(480px, 94vw)",
          height: "100%",
          padding: 18,
          background: "var(--card-bg)",
          borderLeft: isDark ? "1px solid rgba(255,255,255,0.10)" : "1px solid rgba(15,23,42,0.10)",
          overflowY: "auto",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 800 }}>{payment.id}</div>
            <div style={{ opacity: 0.7, fontSize: 12 }}>{payment.clientName}</div>
          </div>
          <button className="btn ghost" onClick={onClose} style={{ height: 34, borderRadius: 999 }}>
            Close
          </button>
        </div>

        <div style={{ height: 16 }} />

        <div className="card" style={{ padding: 16, borderRadius: 14 }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Payment Summary</div>
          <div style={{ display: "grid", gap: 8, fontSize: 14 }}>
            <Row label="Status" value={payment.status} />
            <Row label="Method" value={payment.method} />
            <Row label="Amount" value={formatUsd(payment.amountUsd)} />
            <Row label="Paid At" value={formatDateTime(payment.paidAt)} />
            <Row label="Created" value={formatDateTime(payment.createdAt)} />
          </div>
        </div>

        <div style={{ height: 18 }} />
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {canAdmin && payment.status === "Pending" && (
            <button
              className="btn"
              onClick={() => onAction(payment, "mark_paid")}
              disabled={actionLoading}
              style={{ borderRadius: 999 }}
            >
              {actionLoading ? "Updating" : "Mark Paid"}
            </button>
          )}
          <button
            className="btn ghost"
            onClick={() => onAction(payment, "refund")}
            disabled={actionLoading}
            style={{ borderRadius: 999 }}
          >
            Refund (stub)
          </button>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}>
      <span style={{ opacity: 0.7 }}>{label}</span>
      <span style={{ fontWeight: 600 }}>{value}</span>
    </div>
  );
}
