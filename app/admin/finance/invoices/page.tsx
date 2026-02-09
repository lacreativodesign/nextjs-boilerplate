"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import MasterSelect from "@/components/ui/MasterSelect";
import LoadingButton from "@/components/ui/LoadingButton";
import { AdvancedSearchDialog } from "@/components/search/AdvancedSearchDialog";
import {
  formatDate,
  formatDateTime,
  formatUsd,
  useIsSystemDark,
} from "@/components/finance/financeUtils";
import type { InvoiceLineItem, InvoiceRecord } from "@/lib/finance/types";
import { toastError, toastPromise, toastWarning } from "@/lib/toast";
import type { SearchFilter } from "@/types/search";

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

type FilterRow = {
  id: string;
  field: string;
  operator: string;
  value: string;
};

type SearchField = { name: string; label: string; type: "string" | "number" | "boolean" };

const invoiceSearchFields: SearchField[] = [
  { name: "orderId", label: "Invoice / Order ID", type: "string" },
  { name: "clientName", label: "Client Name", type: "string" },
  { name: "clientId", label: "Client ID", type: "string" },
  { name: "status", label: "Status", type: "string" },
  { name: "amountTotalUsd", label: "Total Amount (USD)", type: "number" },
  { name: "dueDate", label: "Due Date", type: "string" },
  { name: "updatedAt", label: "Updated At", type: "string" },
];

const normalizeFilterValue = (value: string | undefined, type?: SearchField["type"]) => {
  if (value === undefined) return value;
  if (type === "number") {
    const numeric = Number(value);
    return Number.isNaN(numeric) ? value : numeric;
  }
  if (type === "boolean") {
    if (value.toLowerCase() === "true") return true;
    if (value.toLowerCase() === "false") return false;
  }
  return value;
};

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
  const [createOpen, setCreateOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [advancedActive, setAdvancedActive] = useState(false);

  const loadInvoices = useCallback(async () => {
    try {
      setError(null);
      setLoading(true);
      const res = await fetch("/api/admin/finance/invoices/list", { cache: "no-store" });
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
      const res = await fetch("/api/admin/clients/list", { cache: "no-store" });
      const data = await res.json();
      if (res.ok && data.ok) {
        setClients(data.clients || []);
      }
    } catch (err) {
      console.error("Failed to load clients", err);
      toastWarning("Unable to load clients. Refresh the page or try again shortly.");
    }
  }, []);

  const buildSearchFilters = useCallback((filters: FilterRow[]): SearchFilter[] => {
    const fieldMap = new Map(invoiceSearchFields.map((field) => [field.name, field]));

    return filters
      .filter((filter) => filter.field && filter.operator)
      .map((filter) => {
        const fieldConfig = fieldMap.get(filter.field);
        const trimmed = filter.value?.toString().trim();

        if (filter.operator === "isNull" || filter.operator === "isNotNull") {
          return { field: filter.field, operator: filter.operator as SearchFilter["operator"], value: null };
        }

        if (filter.operator === "between") {
          const parts = trimmed ? trimmed.split(",").map((part) => part.trim()).filter(Boolean) : [];
          const normalized = parts.slice(0, 2).map((part) => normalizeFilterValue(part, fieldConfig?.type));
          return { field: filter.field, operator: "between", value: normalized };
        }

        if (filter.operator === "in" || filter.operator === "notIn") {
          const parts = trimmed ? trimmed.split(",").map((part) => part.trim()).filter(Boolean) : [];
          const normalized = parts.map((part) => normalizeFilterValue(part, fieldConfig?.type));
          return { field: filter.field, operator: filter.operator as SearchFilter["operator"], value: normalized };
        }

        return {
          field: filter.field,
          operator: filter.operator as SearchFilter["operator"],
          value: normalizeFilterValue(trimmed, fieldConfig?.type),
        };
      });
  }, []);

  const handleAdvancedSearch = useCallback(
    async (filters: FilterRow[]) => {
      try {
        setError(null);
        setLoading(true);
        const payloadFilters = buildSearchFilters(filters);
        const res = await fetch("/api/invoices/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            filters: payloadFilters,
            sortBy: sortKey,
            sortOrder: sortDir,
            page: 1,
            limit: 200,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data?.error || "Unable to search invoices.");
        }
        setInvoices(Array.isArray(data?.results) ? data.results : []);
        setAdvancedActive(true);
        setQuery("");
        setStatusFilter("");
        setDueFilter("");
        setClientFilter("");
      } catch (err: any) {
        console.error("Advanced invoice search error", err);
        toastError(err?.message || "Unable to search invoices.");
        setError({
          title: "Unable to search invoices",
          message: "Please try again in a moment.",
        });
      } finally {
        setLoading(false);
      }
    },
    [buildSearchFilters, sortDir, sortKey]
  );

  const handleSaveSearch = useCallback(
    async (name: string, filters: FilterRow[]) => {
      const payloadFilters = buildSearchFilters(filters);
      await toastPromise(
        fetch("/api/saved-searches", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            module: "invoices",
            filters: payloadFilters,
            sortBy: sortKey,
            sortOrder: sortDir,
            isShared: false,
          }),
        }).then(async (res) => {
          const data = await res.json().catch(() => ({}));
          if (!res.ok) {
            throw new Error(data?.error || "Unable to save search.");
          }
          return data;
        }),
        {
          loading: "Saving search...",
          success: "Search saved.",
          error: (err) => err?.message || "Unable to save search.",
        }
      );
    },
    [buildSearchFilters, sortDir, sortKey]
  );

  const handleResetFilters = useCallback(async () => {
    setQuery("");
    setStatusFilter("");
    setDueFilter("");
    setClientFilter("");
    if (advancedActive) {
      setAdvancedActive(false);
      await loadInvoices();
    }
  }, [advancedActive, loadInvoices]);

  useEffect(() => {
    loadInvoices();
    loadClients();
  }, [loadInvoices, loadClients]);

  const canAdmin = useMemo(() => {
    const role = (currentUser?.role || "").toLowerCase();
    return role === "admin" || role === "super_admin";
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
    if (!drawerOpen && !createOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeDrawer();
        setCreateOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawerOpen, createOpen]);

  const handleMarkPaid = async (invoice: InvoiceRecord) => {
    if (!canAdmin) return;
    try {
      setActionLoading(invoice.id);
      await toastPromise(
        fetch("/api/admin/finance/invoices/update", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: invoice.id, action: "mark_paid" }),
        }).then(async (res) => {
          const data = await res.json();
          if (!res.ok || !data.ok) {
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
    } catch (err) {
      console.error("Mark paid error", err);
      setError({ title: "Unable to mark paid", message: "Please try again." });
    } finally {
      setActionLoading(null);
    }
  };

  const handleSendInvoice = async (invoice: InvoiceRecord) => {
    try {
      setActionLoading(invoice.id);
      await toastPromise(
        fetch("/api/admin/finance/invoices/update", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: invoice.id, action: "send" }),
        }).then(async (res) => {
          const data = await res.json();
          if (!res.ok || !data.ok) {
            throw new Error(data?.error || "Unable to send invoice.");
          }
          return data;
        }),
        {
          loading: "Sending invoice...",
          success: "Invoice sent successfully.",
          error: (err) => err?.message || "Unable to send invoice.",
        }
      );
      await loadInvoices();
    } catch (err) {
      console.error("Send invoice error", err);
      setError({ title: "Unable to send invoice", message: "Please try again." });
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

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 style={{ fontSize: 20, fontWeight: 700 }}>Invoices</h3>
          <p style={{ fontSize: 13, color: "var(--sidebar-text)" }}>
            USD invoicing with live Firestore sync.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn" onClick={() => setAdvancedOpen(true)} style={{ borderRadius: 999 }}>
            🔍 Advanced Search
          </button>
          <button className="btn" onClick={() => setCreateOpen(true)} style={{ borderRadius: 999 }}>
            Create Invoice
          </button>
        </div>
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
          onClick={handleResetFilters}
          style={{ borderRadius: 999, padding: "10px 16px", fontWeight: 500 }}
        >
          {advancedActive ? "Reset Search" : "Reset Filters"}
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
                  <button type="button" onClick={() => toggleSort("orderId")} style={headerButtonStyle}>
                    Invoice/Order {sortKey === "orderId" ? (sortDir === "asc" ? "▲" : "▼") : ""}
                  </button>
                </th>
                <th style={{ textAlign: "left", padding: "14px 16px", fontWeight: 700 }}>
                  <button type="button" onClick={() => toggleSort("clientName")} style={headerButtonStyle}>
                    Client {sortKey === "clientName" ? (sortDir === "asc" ? "▲" : "▼") : ""}
                  </button>
                </th>
                <th style={{ textAlign: "right", padding: "14px 16px", fontWeight: 700 }}>
                  <button type="button" onClick={() => toggleSort("amountTotalUsd")} style={headerButtonStyle}>
                    Total (USD) {sortKey === "amountTotalUsd" ? (sortDir === "asc" ? "▲" : "▼") : ""}
                  </button>
                </th>
                <th style={{ textAlign: "center", padding: "14px 16px", fontWeight: 700 }}>
                  <button type="button" onClick={() => toggleSort("dueDate")} style={headerButtonStyle}>
                    Due Date {sortKey === "dueDate" ? (sortDir === "asc" ? "▲" : "▼") : ""}
                  </button>
                </th>
                <th style={{ textAlign: "center", padding: "14px 16px", fontWeight: 700 }}>
                  <button type="button" onClick={() => toggleSort("updatedAt")} style={headerButtonStyle}>
                    Updated {sortKey === "updatedAt" ? (sortDir === "asc" ? "▲" : "▼") : ""}
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
                  <td colSpan={7} style={{ textAlign: "center", padding: 40 }}>
                    Loading invoices…
                  </td>
                </tr>
              ) : sortedInvoices.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: "center", padding: 40 }}>
                    No invoices found.
                  </td>
                </tr>
              ) : (
                sortedInvoices.map((invoice, idx) => {
                  const rowBg =
                    idx % 2 === 0
                      ? isDark
                        ? "rgba(255,255,255,0.02)"
                        : "rgba(15,23,42,0.02)"
                      : "transparent";
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
                      <td style={{ padding: "14px 16px", textAlign: "right" }}>{formatUsd(invoice.amountTotalUsd)}</td>
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
                          {canAdmin && invoice.status !== "Paid" && (
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
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <AdvancedSearchDialog
        open={advancedOpen}
        onClose={() => setAdvancedOpen(false)}
        module="invoices"
        fields={invoiceSearchFields}
        onSearch={handleAdvancedSearch}
        onSave={handleSaveSearch}
      />

      {drawerOpen && selectedInvoice && (
        <InvoiceDrawer
          invoice={selectedInvoice}
          isDark={isDark}
          canAdmin={canAdmin}
          onClose={closeDrawer}
          onSend={handleSendInvoice}
          onMarkPaid={handleMarkPaid}
          actionLoading={actionLoading === selectedInvoice.id}
        />
      )}

      {createOpen && (
        <CreateInvoiceDrawer
          isDark={isDark}
          clients={clients}
          onClose={() => setCreateOpen(false)}
          onCreated={() => {
            setCreateOpen(false);
            loadInvoices();
          }}
          submitting={submitting}
          setSubmitting={setSubmitting}
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
  canAdmin,
  onClose,
  onSend,
  onMarkPaid,
  actionLoading,
}: {
  invoice: InvoiceRecord;
  isDark: boolean;
  canAdmin: boolean;
  onClose: () => void;
  onSend: (invoice: InvoiceRecord) => void;
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
                <div
                  key={`${item.name}-${idx}`}
                  style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}
                >
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
          <LoadingButton
            className="btn"
            onClick={() => onSend(invoice)}
            loading={actionLoading}
            loadingText="Sending"
            style={{ borderRadius: 999 }}
          >
            Send Invoice
          </LoadingButton>
          <button className="btn ghost" style={{ borderRadius: 999 }} title="PDF download coming soon" disabled>
            Download PDF
          </button>
          {canAdmin && invoice.status !== "Paid" && (
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
        </div>
      </div>
    </div>
  );
}

function CreateInvoiceDrawer({
  isDark,
  clients,
  onClose,
  onCreated,
  submitting,
  setSubmitting,
}: {
  isDark: boolean;
  clients: ClientOption[];
  onClose: () => void;
  onCreated: () => void;
  submitting: boolean;
  setSubmitting: (value: boolean) => void;
}) {
  const [clientId, setClientId] = useState("");
  const [clientName, setClientName] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");
  const [tax, setTax] = useState("0");
  const [lineItems, setLineItems] = useState<InvoiceLineItem[]>([
    { name: "", qty: 1, unitPriceUsd: 0 },
  ]);
  const [error, setError] = useState<string | null>(null);

  const subtotal = lineItems.reduce((sum, item) => sum + item.qty * item.unitPriceUsd, 0);
  const total = subtotal + Number(tax || 0);

  const clientOptions = useMemo(
    () => [{ label: "Select Client", value: "" }, ...clients.map((c) => ({ label: c.companyName, value: c.id }))],
    [clients]
  );

  const updateClient = (value: string) => {
    setClientId(value);
    const found = clients.find((c) => c.id === value);
    setClientName(found?.companyName || "");
  };

  const updateLineItem = (idx: number, field: keyof InvoiceLineItem, value: string) => {
    setLineItems((prev) =>
      prev.map((item, index) => {
        if (index !== idx) return item;
        if (field === "name") return { ...item, name: value };
        if (field === "qty") return { ...item, qty: Number(value || 0) };
        return { ...item, unitPriceUsd: Number(value || 0) };
      })
    );
  };

  const addLineItem = () => {
    setLineItems((prev) => [...prev, { name: "", qty: 1, unitPriceUsd: 0 }]);
  };

  const removeLineItem = (idx: number) => {
    setLineItems((prev) => prev.filter((_, index) => index !== idx));
  };

  const handleSubmit = async () => {
    try {
      setError(null);
      setSubmitting(true);
      await toastPromise(
        fetch("/api/admin/finance/invoices/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            clientId,
            clientName,
            dueDate,
            notes,
            amountTaxUsd: Number(tax || 0),
            lineItems,
          }),
        }).then(async (res) => {
          const data = await res.json();
          if (!res.ok || !data.ok) {
            throw new Error(data?.error || "Unable to create invoice.");
          }
          return data;
        }),
        {
          loading: "Creating invoice...",
          success: "Invoice created successfully.",
          error: (err) => err?.message || "Unable to create invoice.",
        }
      );
      onCreated();
    } catch (err: any) {
      console.error("Create invoice error", err);
      setError("Unable to create invoice. Please check the form.");
    } finally {
      setSubmitting(false);
    }
  };

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
          width: "min(520px, 96vw)",
          height: "100%",
          padding: 18,
          background: "var(--card-bg)",
          borderLeft: isDark ? "1px solid rgba(255,255,255,0.10)" : "1px solid rgba(15,23,42,0.10)",
          overflowY: "auto",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 800 }}>Create Invoice</div>
            <div style={{ opacity: 0.7, fontSize: 12 }}>USD billing (client revenue).</div>
          </div>
          <button className="btn ghost" onClick={onClose} style={{ height: 34, borderRadius: 999 }}>
            Close
          </button>
        </div>

        <div style={{ height: 16 }} />

        {error && (
          <div
            className="card"
            style={{
              borderRadius: 12,
              padding: 12,
              border: "1px solid rgba(239,68,68,0.35)",
              background: isDark ? "rgba(127,29,29,0.2)" : "rgba(254,226,226,0.6)",
              color: isDark ? "#fecaca" : "#991b1b",
              fontWeight: 600,
              marginBottom: 12,
            }}
          >
            {error}
          </div>
        )}

        <div className="space-y-3">
          <MasterSelect value={clientId} onChange={(value) => updateClient(value)} options={clientOptions} />
          <input className="input" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          <textarea
            className="input"
            rows={3}
            placeholder="Notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        <div style={{ height: 16 }} />

        <div className="card" style={{ padding: 16, borderRadius: 14 }}>
          <div style={{ fontWeight: 700, marginBottom: 12 }}>Line Items</div>
          <div className="space-y-3">
            {lineItems.map((item, idx) => (
              <div key={idx} className="grid gap-2 md:grid-cols-5">
                <input
                  className="input md:col-span-2"
                  placeholder="Item name"
                  value={item.name}
                  onChange={(e) => updateLineItem(idx, "name", e.target.value)}
                />
                <input
                  className="input"
                  type="number"
                  min={1}
                  value={item.qty}
                  onChange={(e) => updateLineItem(idx, "qty", e.target.value)}
                />
                <input
                  className="input"
                  type="number"
                  min={0}
                  value={item.unitPriceUsd}
                  onChange={(e) => updateLineItem(idx, "unitPriceUsd", e.target.value)}
                />
                <div className="flex items-center justify-end">
                  {lineItems.length > 1 && (
                    <button className="btn ghost" onClick={() => removeLineItem(idx)} style={{ borderRadius: 999 }}>
                      Remove
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
          <div style={{ height: 12 }} />
          <button className="btn" onClick={addLineItem} style={{ borderRadius: 999 }}>
            Add Line Item
          </button>
        </div>

        <div style={{ height: 16 }} />

        <div className="card" style={{ padding: 16, borderRadius: 14 }}>
          <div className="space-y-2">
            <Row label="Subtotal" value={formatUsd(subtotal)} />
            <Row
              label="Tax (USD)"
              value={
                <input
                  className="input"
                  style={{ maxWidth: 140 }}
                  type="number"
                  min={0}
                  value={tax}
                  onChange={(e) => setTax(e.target.value)}
                />
              }
            />
            <Row label="Total" value={formatUsd(total)} />
          </div>
        </div>

        <div style={{ height: 16 }} />

        <LoadingButton
          className="btn"
          onClick={handleSubmit}
          loading={submitting}
          loadingText="Creating…"
          style={{ borderRadius: 999, width: "100%" }}
        >
          Create Invoice
        </LoadingButton>
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
