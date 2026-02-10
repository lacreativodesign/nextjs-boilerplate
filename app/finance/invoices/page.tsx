"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import MasterSelect from "@/components/ui/MasterSelect";
import EmptyState from "@/components/ui/EmptyState";
import LoadingButton from "@/components/ui/LoadingButton";
import { SkeletonTable } from "@/components/ui/Skeleton";
import { formatDate, formatDateTime, formatUsd, useIsSystemDark } from "@/components/finance/financeUtils";
import type { InvoiceRecord } from "@/lib/finance/types";
import { toastError, toastPromise, toastWarning } from "@/lib/toast";

const STATUS_OPTIONS = [
  "",
  "Draft",
  "Sent",
  "Partially Paid",
  "Paid",
  "Overdue",
  "Void",
].map((status) => ({ label: status || "All Statuses", value: status }));

const DUE_OPTIONS = [
  { label: "All Due Dates", value: "" },
  { label: "Overdue", value: "overdue" },
  { label: "Due in 7 days", value: "due_7" },
  { label: "Due in 30 days", value: "due_30" },
];

type ClientOption = { id: string; companyName: string };

type SortKey = "orderId" | "clientName" | "amountTotalUsd" | "dueDate" | "updatedAt" | "status";

type SortDir = "asc" | "desc";

type CurrentUser = { uid: string; role: string; name?: string };

type ErrorState = { title: string; message: string };

export default function FinanceInvoicesPage() {
  const isDark = useIsSystemDark();
  const [invoices, setInvoices] = useState<InvoiceRecord[]>([]);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ErrorState | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [dueFilter, setDueFilter] = useState("");
  const [clientFilter, setClientFilter] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("updatedAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceRecord | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const loadInvoices = useCallback(async () => {
    try {
      setError(null);
      setLoading(true);
      const res = await fetch("/api/finance/invoices/list", { cache: "no-store", credentials: "include" });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data?.error || "Unable to load invoices.");
      }
      setInvoices(data.invoices || []);
      setCurrentUser(data.currentUser || null);
    } catch (err: any) {
      console.error("Invoices load error", err);
      toastError("Unable to load invoices. Please try again in a moment.");
      setError({
        title: "Unable to load invoices",
        message: "Please try again in a moment.",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  const loadClients = useCallback(async () => {
    try {
      const res = await fetch("/api/finance/clients/list", { cache: "no-store", credentials: "include" });
      const data = await res.json();
      if (res.ok && data.ok) {
        setClients(data.clients || []);
      }
    } catch (err) {
      console.error("Failed to load clients", err);
      toastWarning("Unable to load clients. Refresh the page or try again shortly.");
    }
  }, []);

  useEffect(() => {
    loadInvoices();
    loadClients();
  }, [loadInvoices, loadClients]);

  const canUpdate = useMemo(() => {
    const role = (currentUser?.role || "").toLowerCase();
    return role === "finance" || role === "admin" || role === "super_admin";
  }, [currentUser?.role]);

  const filteredInvoices = useMemo(() => {
    const q = query.trim().toLowerCase();
    const now = new Date();

    return invoices.filter((invoice) => {
      if (statusFilter && invoice.status !== statusFilter) return false;
      if (clientFilter && invoice.clientId !== clientFilter) return false;
      if (q) {
        const hay = [invoice.orderId, invoice.clientName, invoice.clientId]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }

      if (dueFilter) {
        const due = invoice.dueDate ? new Date(invoice.dueDate) : null;
        if (!due || Number.isNaN(due.getTime())) return false;
        const diffDays = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        if (dueFilter === "overdue" && diffDays >= 0) return false;
        if (dueFilter === "due_7" && (diffDays < 0 || diffDays > 7)) return false;
        if (dueFilter === "due_30" && (diffDays < 0 || diffDays > 30)) return false;
      }

      return true;
    });
  }, [invoices, query, statusFilter, clientFilter, dueFilter]);

  const sortedInvoices = useMemo(() => {
    const list = [...filteredInvoices];
    list.sort((a, b) => {
      const dir = sortDir === "asc" ? 1 : -1;
      if (sortKey === "amountTotalUsd") return (a.amountTotalUsd - b.amountTotalUsd) * dir;
      if (sortKey === "dueDate") return String(a.dueDate || "").localeCompare(String(b.dueDate || "")) * dir;
      if (sortKey === "updatedAt") return String(a.updatedAt || "").localeCompare(String(b.updatedAt || "")) * dir;
      return String(a[sortKey] || "").localeCompare(String(b[sortKey] || "")) * dir;
    });
    return list;
  }, [filteredInvoices, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const openDrawer = (invoice: InvoiceRecord) => {
    setSelectedInvoice(invoice);
    setDrawerOpen(true);
  };

  const closeDrawer = () => {
    setDrawerOpen(false);
    setSelectedInvoice(null);
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

  const handleMarkPaid = async (invoice: InvoiceRecord) => {
    if (!canUpdate) return;
    try {
      setActionLoading(invoice.id);
      await toastPromise(
        fetch("/api/finance/invoices/update", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ id: invoice.id, action: "mark_paid" }),
        }).then(async (res) => {
          const data = await res.json().catch(() => null);
          if (!res.ok || !data?.ok) {
            throw new Error(data?.error || "Unable to mark paid.");
          }
          return data;
        }),
        {
          loading: "Updating invoice...",
          success: "Invoice marked as paid.",
          error: (err) => err?.message || "Unable to mark invoice paid.",
        }
      );
      await loadInvoices();
    } catch (err: any) {
      console.error("Mark paid error", err);
      setError({ title: "Unable to mark paid", message: "Please try again." });
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
        <h3 style={{ fontSize: 20, fontWeight: 700 }}>Invoices</h3>
        <p style={{ fontSize: 13, color: "var(--sidebar-text)" }}>USD invoicing with live Firestore sync.</p>
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
        <MasterSelect value={dueFilter} onChange={(value) => setDueFilter(value)} options={DUE_OPTIONS} />
        <MasterSelect
          value={clientFilter}
          onChange={(value) => setClientFilter(value)}
          options={[{ label: "All Clients", value: "" }, ...clients.map((c) => ({ label: c.companyName, value: c.id }))]}
        />
        <button
          type="button"
          className="btn"
          onClick={() => {
            setQuery("");
            setStatusFilter("");
            setDueFilter("");
            setClientFilter("");
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
        {/* Loading state: show skeleton table to avoid blank flashes. */}
        {loading ? (
          <div className="p-4">
            <SkeletonTable rows={6} columns={7} />
          </div>
        ) : sortedInvoices.length === 0 ? (
          <div className="p-6">
            <EmptyState title="No invoices found" description="Try adjusting filters or create a new invoice." />
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 960 }}>
              <thead>
                <tr style={{ background: isDark ? "rgba(30,30,30,0.9)" : "rgba(248,250,252,0.9)" }}>
                  <th style={{ textAlign: "left", padding: "14px 16px", fontWeight: 700 }}>
                    <button type="button" onClick={() => toggleSort("orderId")} style={headerButtonStyle}>
                      Invoice/Order {sortKey === "orderId" ? (sortDir === "asc" ? "▲" : "▼") : ""}
                    </button>
                  </th>
                  <th style={{ textAlign: "left", padding: "14px 16px", fontWeight: 700 }}>
                    <button type="button" onClick={() => toggleSort("clientName")} style={headerButtonStyle}>
                      Client {sortKey === "clientName" ? (sortDir === "asc" ? "▲" : "▼") : ""}
                    </button>
                  </th>
                  <th style={{ textAlign: "left", padding: "14px 16px", fontWeight: 700 }}>
                    <button type="button" onClick={() => toggleSort("amountTotalUsd")} style={headerButtonStyle}>
                      Total (USD) {sortKey === "amountTotalUsd" ? (sortDir === "asc" ? "▲" : "▼") : ""}
                    </button>
                  </th>
                  <th style={{ textAlign: "left", padding: "14px 16px", fontWeight: 700 }}>
                    <button type="button" onClick={() => toggleSort("dueDate")} style={headerButtonStyle}>
                      Due Date {sortKey === "dueDate" ? (sortDir === "asc" ? "▲" : "▼") : ""}
                    </button>
                  </th>
                  <th style={{ textAlign: "left", padding: "14px 16px", fontWeight: 700 }}>
                    <button type="button" onClick={() => toggleSort("updatedAt")} style={headerButtonStyle}>
                      Updated {sortKey === "updatedAt" ? (sortDir === "asc" ? "▲" : "▼") : ""}
                    </button>
                  </th>
                  <th style={{ textAlign: "left", padding: "14px 16px", fontWeight: 700 }}>
                    <button type="button" onClick={() => toggleSort("status")} style={headerButtonStyle}>
                      Status {sortKey === "status" ? (sortDir === "asc" ? "▲" : "▼") : ""}
                    </button>
                  </th>
                  <th style={{ textAlign: "center", padding: "14px 16px", fontWeight: 700 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {sortedInvoices.map((invoice, idx) => {
                  const rowBg = idx % 2 === 0 ? (isDark ? "rgba(255,255,255,0.02)" : "rgba(15,23,42,0.02)") : "transparent";
                  const hoverBg = isDark ? "rgba(255,255,255,0.05)" : "rgba(15,23,42,0.03)";
                  return (
                    <tr
                      key={invoice.id}
                      style={{ background: rowBg, transition: "background 120ms ease" }}
                      onMouseEnter={(event) => {
                        (event.currentTarget as HTMLTableRowElement).style.background = hoverBg;
                      }}
                      onMouseLeave={(event) => {
                        (event.currentTarget as HTMLTableRowElement).style.background = rowBg;
                      }}
                    >
                      <td style={{ padding: "14px 16px", textAlign: "left" }}>
                        <div style={{ fontWeight: 600 }}>{invoice.orderId || invoice.id}</div>
                        <div style={{ fontSize: 12, opacity: 0.65 }}>{invoice.clientId}</div>
                      </td>
                      <td style={{ padding: "14px 16px", textAlign: "left" }}>{invoice.clientName}</td>
                      <td style={{ padding: "14px 16px", textAlign: "center" }}>{formatUsd(invoice.amountTotalUsd)}</td>
                      <td style={{ padding: "14px 16px", textAlign: "center" }}>{formatDate(invoice.dueDate)}</td>
                      <td style={{ padding: "14px 16px", textAlign: "center" }}>{formatDate(invoice.updatedAt)}</td>
                      <td style={{ padding: "14px 16px", textAlign: "center" }}>{renderStatus(invoice.status, isDark)}</td>
                      <td style={{ padding: "14px 16px", textAlign: "center" }}>
                        <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
                          <button
                            type="button"
                            className="btn ghost"
                            onClick={() => openDrawer(invoice)}
                            style={{ padding: "6px 12px", borderRadius: 999, fontSize: 12 }}
                          >
                            View
                          </button>
                          {canUpdate && invoice.status !== "Paid" && (
                            <LoadingButton
                              type="button"
                              className="btn"
                              onClick={() => handleMarkPaid(invoice)}
                              loading={actionLoading === invoice.id}
                              loadingText="Updating"
                              style={{ padding: "6px 12px", borderRadius: 999, fontSize: 12 }}
                            >
                              Mark Paid
                            </LoadingButton>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {drawerOpen && selectedInvoice && (
        <InvoiceDrawer
          invoice={selectedInvoice}
          isDark={isDark}
          canUpdate={canUpdate}
          onClose={closeDrawer}
          onMarkPaid={handleMarkPaid}
          actionLoading={actionLoading === selectedInvoice.id}
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

  if (token.includes("overdue")) {
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

function InvoiceDrawer({
  invoice,
  isDark,
  canUpdate,
  onClose,
  onMarkPaid,
  actionLoading,
}: {
  invoice: InvoiceRecord;
  isDark: boolean;
  canUpdate: boolean;
  onClose: () => void;
  onMarkPaid: (invoice: InvoiceRecord) => void;
  actionLoading: boolean;
}) {
  const subtotal = invoice.amountSubtotalUsd;
  const tax = invoice.amountTaxUsd;
  const total = invoice.amountTotalUsd;

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
          width: "min(520px, 100vw)",
          height: "100%",
          padding: 18,
          background: "var(--card-bg)",
          borderLeft: isDark ? "1px solid rgba(255,255,255,0.10)" : "1px solid rgba(15,23,42,0.10)",
          overflowY: "auto",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 800 }}>{invoice.orderId || invoice.id}</div>
            <div style={{ opacity: 0.7, fontSize: 12 }}>{invoice.clientName}</div>
          </div>
          <button className="btn ghost" onClick={onClose} style={{ height: 34, borderRadius: 999 }}>
            Close
          </button>
        </div>

        <div style={{ height: 16 }} />

        <div className="card" style={{ padding: 16, borderRadius: 14 }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Invoice Summary</div>
          <div style={{ display: "grid", gap: 8, fontSize: 14 }}>
            <Row label="Status" value={invoice.status} />
            <Row label="Issued" value={formatDate(invoice.issuedAt)} />
            <Row label="Due" value={formatDate(invoice.dueDate)} />
            <Row label="Updated" value={formatDateTime(invoice.updatedAt)} />
          </div>
        </div>

        <div style={{ height: 16 }} />

        <div className="card" style={{ padding: 16, borderRadius: 14 }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Line Items</div>
          <div className="space-y-2">
            {invoice.lineItems.length === 0 ? (
              <div style={{ fontSize: 13, opacity: 0.7 }}>No line items.</div>
            ) : (
              invoice.lineItems.map((item, idx) => (
                <div key={`${item.name}-${idx}`} style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}>
                  <span>
                    {item.name} × {item.qty}
                  </span>
                  <span>{formatUsd(item.qty * item.unitPriceUsd)}</span>
                </div>
              ))
            )}
          </div>
          <div style={{ height: 10 }} />
          <Row label="Subtotal" value={formatUsd(subtotal)} />
          <Row label="Tax" value={formatUsd(tax)} />
          <Row label="Total" value={formatUsd(total)} />
        </div>

        {invoice.notes && (
          <>
            <div style={{ height: 16 }} />
            <div className="card" style={{ padding: 16, borderRadius: 14 }}>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>Notes</div>
              <div style={{ fontSize: 14, opacity: 0.8 }}>{invoice.notes}</div>
            </div>
          </>
        )}

        <div style={{ height: 18 }} />
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {canUpdate && invoice.status !== "Paid" && (
            <LoadingButton
              className="btn"
              onClick={() => onMarkPaid(invoice)}
              loading={actionLoading}
              loadingText="Updating"
              style={{ borderRadius: 999 }}
            >
              Mark Paid
            </LoadingButton>
          )}
          <button className="btn ghost" style={{ borderRadius: 999 }} title="PDF download coming soon" disabled>
            Download PDF
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
