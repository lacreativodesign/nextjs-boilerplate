"use client";

import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import MasterSelect from "@/components/ui/MasterSelect";
import LoadingButton from "@/components/ui/LoadingButton";
import {
  formatDate,
  formatDateTime,
  formatUsd,
  } from "@/components/finance/financeUtils";
import type { InvoiceLineItem, InvoiceRecord } from "@/lib/finance/types";
import { CurrencyCode } from "@/lib/finance/currencies";
import { SUPPORTED_CURRENCIES } from "@/lib/currency/currencyConverter";
import { CurrencyDisplay } from "@/components/finance/CurrencyDisplay";
import { CurrencySelector } from "@/components/finance/CurrencySelector";
import { InvoiceDownloadButton } from "@/components/finance/InvoiceDownloadButton";
import { TaxRateSelector } from "@/components/finance/TaxRateSelector";
import { calculateTax } from "@/lib/tax/calculator";
import { toastError, toastPromise, toastWarning } from "@/lib/toast";
import { TableSkeleton } from "@/components/ui/Skeleton";
import type { SearchFilter } from "@/types/search";

const AdvancedSearchDialog = dynamic(
  () => import("@/components/search/AdvancedSearchDialog").then((mod) => mod.AdvancedSearchDialog),
  {
    loading: () => null,
    ssr: false,
  },
);

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

const getCurrencySymbol = (code?: string) => {
  return SUPPORTED_CURRENCIES.find((currency) => currency.code === code)?.symbol || code || "USD";
};

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
  return (
    <Suspense fallback={null}>
      <FinanceInvoicesContent />
    </Suspense>
  );
}

function FinanceInvoicesContent() {
  const searchParams = useSearchParams();
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

  useEffect(() => {
    if (searchParams.get("create") === "true") {
      setCreateOpen(true);
    }
  }, [searchParams]);

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
        <div className="rounded-xl border border-[var(--danger)] bg-[var(--danger-soft)] p-4 text-sm text-[var(--danger)] mb-4">
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

      <div className="table-shell">
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 960 }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", padding: "14px 16px", fontWeight: 700 }}>
                  <button type="button" onClick={() => toggleSort("orderId")} className="table-sort">
                    Invoice/Order {sortKey === "orderId" ? (sortDir === "asc" ? "▲" : "▼") : ""}
                  </button>
                </th>
                <th style={{ textAlign: "left", padding: "14px 16px", fontWeight: 700 }}>
                  <button type="button" onClick={() => toggleSort("clientName")} className="table-sort">
                    Client {sortKey === "clientName" ? (sortDir === "asc" ? "▲" : "▼") : ""}
                  </button>
                </th>
                <th style={{ textAlign: "right", padding: "14px 16px", fontWeight: 700 }}>
                  <button type="button" onClick={() => toggleSort("amountTotalUsd")} className="table-sort">
                    Total (USD) {sortKey === "amountTotalUsd" ? (sortDir === "asc" ? "▲" : "▼") : ""}
                  </button>
                </th>
                <th style={{ textAlign: "center", padding: "14px 16px", fontWeight: 700 }}>
                  <button type="button" onClick={() => toggleSort("dueDate")} className="table-sort">
                    Due Date {sortKey === "dueDate" ? (sortDir === "asc" ? "▲" : "▼") : ""}
                  </button>
                </th>
                <th style={{ textAlign: "center", padding: "14px 16px", fontWeight: 700 }}>
                  <button type="button" onClick={() => toggleSort("updatedAt")} className="table-sort">
                    Updated {sortKey === "updatedAt" ? (sortDir === "asc" ? "▲" : "▼") : ""}
                  </button>
                </th>
                <th style={{ textAlign: "center", padding: "14px 16px", fontWeight: 700 }}>
                  <button type="button" onClick={() => toggleSort("status")} className="table-sort">
                    Status {sortKey === "status" ? (sortDir === "asc" ? "▲" : "▼") : ""}
                  </button>
                </th>
                <th style={{ textAlign: "center", padding: "14px 16px", fontWeight: 700 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} style={{ padding: 24 }}>
                    <TableSkeleton rows={7} columns={7} />
                  </td>
                </tr>
              ) : sortedInvoices.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: "center", padding: 40 }}>
                    No invoices found.
                  </td>
                </tr>
              ) : (
                sortedInvoices.map((invoice) => {
                  return (
                    <tr key={invoice.id}>
                      <td style={{ padding: "14px 16px", textAlign: "left" }}>
                        <div style={{ fontWeight: 600 }}>{invoice.orderId || invoice.id}</div>
                        <div style={{ fontSize: 12, opacity: 0.65 }}>{invoice.clientId}</div>
                      </td>
                      <td style={{ padding: "14px 16px", textAlign: "left" }}>{invoice.clientName}</td>
                      <td style={{ padding: "14px 16px", textAlign: "right" }}><span>{getCurrencySymbol(invoice.currency)}{Number(invoice.amountTotal || invoice.amountTotalUsd || 0).toFixed(2)}</span></td>
                      <td style={{ padding: "14px 16px", textAlign: "center" }}>{formatDate(invoice.dueDate)}</td>
                      <td style={{ padding: "14px 16px", textAlign: "center" }}>{formatDate(invoice.updatedAt)}</td>
                      <td style={{ padding: "14px 16px", textAlign: "center" }}>{renderStatus(invoice.status)}</td>
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
                    canAdmin={canAdmin}
          onClose={closeDrawer}
          onSend={handleSendInvoice}
          onMarkPaid={handleMarkPaid}
          actionLoading={actionLoading === selectedInvoice.id}
        />
      )}

      {createOpen && (
        <CreateInvoiceDrawer
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


function renderStatus(status: string) {
  const base = "inline-flex items-center justify-center rounded-full px-3 py-1 text-xs font-semibold min-w-[80px]";
  const t = (status || "").toLowerCase();
  if (t.includes("paid") || t.includes("completed") || t.includes("approved") || t.includes("active"))
    return <span className={`${base} bg-green-500/10 text-green-600`}>{status}</span>;
  if (t.includes("overdue") || t.includes("failed") || t.includes("rejected") || t.includes("void"))
    return <span className={`${base} bg-red-500/10 text-red-500`}>{status}</span>;
  if (t.includes("pending") || t.includes("draft") || t.includes("processing") || t.includes("sent"))
    return <span className={`${base} bg-amber-500/10 text-amber-600`}>{status}</span>;
  if (t.includes("partial"))
    return <span className={`${base} bg-purple-500/10 text-purple-600`}>{status}</span>;
  return <span className={`${base} bg-[var(--surface-muted)] text-[var(--text-muted)]`}>{status}</span>;
}


function InvoiceDrawer({
  invoice,
  canAdmin,
  onClose,
  onSend,
  onMarkPaid,
  actionLoading,
}: {
  invoice: InvoiceRecord;
  canAdmin: boolean;
  onClose: () => void;
  onSend: (invoice: InvoiceRecord) => void;
  onMarkPaid: (invoice: InvoiceRecord) => void;
  actionLoading: boolean;
}) {
  const subtotal = Number(invoice.amountSubtotal || invoice.amountSubtotalUsd || 0);
  const tax = Number(invoice.amountTax || invoice.amountTaxUsd || 0);
  const total = Number(invoice.amountTotal || invoice.amountTotalUsd || 0);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 60,
        background: "rgba(0,0,0,0.45)",
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
          borderLeft: "1px solid var(--border-subtle)",
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
                  <span>{getCurrencySymbol(invoice.currency)}{(item.qty * item.unitPriceUsd).toFixed(2)}</span>
                </div>
              ))
            )}
          </div>
          <div style={{ height: 10 }} />
          <Row label="Subtotal" value={<span>{getCurrencySymbol(invoice.currency)}{subtotal.toFixed(2)}</span>} />
          <Row label="Tax" value={<span>{getCurrencySymbol(invoice.currency)}{tax.toFixed(2)}</span>} />
          <Row label="Total" value={<span>{getCurrencySymbol(invoice.currency)}{total.toFixed(2)}</span>} />
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
          <InvoiceDownloadButton invoiceId={invoice.id} invoiceNumber={invoice.orderId || invoice.id} />
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
  clients,
  onClose,
  onCreated,
  submitting,
  setSubmitting,
}: {
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
  const [applyTax, setApplyTax] = useState(false);
  const [taxRateId, setTaxRateId] = useState<string | null>(null);
  const [selectedTaxRate, setSelectedTaxRate] = useState<{ id: string; name: string; rate: number; inclusive: boolean } | null>(null);
  const [lineItems, setLineItems] = useState<InvoiceLineItem[]>([
    { name: "", qty: 1, unitPriceUsd: 0 },
  ]);
  const [error, setError] = useState<string | null>(null);
  const [currency, setCurrency] = useState<CurrencyCode>("USD");

  const taxPreview = calculateTax(
    lineItems.map((item) => ({ description: item.name || "Item", quantity: item.qty, unitPrice: item.unitPriceUsd })),
    applyTax && selectedTaxRate ? [selectedTaxRate] : [],
    { roundToTwoDecimals: true },
  );
  const subtotal = taxPreview.subtotal;
  const taxAmount = taxPreview.taxAmount;
  const total = taxPreview.total;

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
            taxRateId: applyTax ? taxRateId : null,
            currency,
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
        background: "rgba(0,0,0,0.45)",
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
          borderLeft: "1px solid var(--border-subtle)",
          overflowY: "auto",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 800 }}>Create Invoice</div>
            <div style={{ opacity: 0.7, fontSize: 12 }}>Multi-currency billing for international clients.</div>
          </div>
          <button className="btn ghost" onClick={onClose} style={{ height: 34, borderRadius: 999 }}>
            Close
          </button>
        </div>

        <div style={{ height: 16 }} />

        {error && (
          <div className="rounded-xl border border-[var(--danger)] bg-[var(--danger-soft)] p-4 text-sm text-[var(--danger)] mb-4">
            {error}
          </div>
        )}

        <div className="space-y-3">
          <MasterSelect value={clientId} onChange={(value) => updateClient(value)} options={clientOptions} />
          <CurrencySelector value={currency} onChange={setCurrency} className="mb-2" />
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
                <div className="space-y-1">
                  <input
                    className="input"
                    type="number"
                    min={0}
                    value={item.unitPriceUsd}
                    onChange={(e) => updateLineItem(idx, "unitPriceUsd", e.target.value)}
                  />
                  <CurrencyDisplay amount={item.unitPriceUsd} currency={currency} className="text-xs opacity-70" showCode />
                </div>
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
            <Row label="Subtotal" value={<CurrencyDisplay amount={subtotal} currency={currency} />} />
            <div className="space-y-2">
              <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input type="checkbox" checked={applyTax} onChange={(e) => { setApplyTax(e.target.checked); if (!e.target.checked) { setTaxRateId(null); setSelectedTaxRate(null); } }} />
                Apply Tax
              </label>
              {applyTax ? (
                <TaxRateSelector
                  value={taxRateId}
                  onChange={async (value) => {
                    setTaxRateId(value);
                    if (!value) { setSelectedTaxRate(null); return; }
                    const res = await fetch(`/api/finance/tax-rates/${value}`, { cache: "no-store" });
                    const data = await res.json().catch(() => null);
                    if (res.ok && data?.ok && data.taxRate) {
                      setSelectedTaxRate({ id: data.taxRate.id, name: data.taxRate.name, rate: Number(data.taxRate.rate || 0), inclusive: Boolean(data.taxRate.inclusive) });
                    }
                  }}
                />
              ) : null}
            </div>
            <Row label={selectedTaxRate ? `Tax (${selectedTaxRate.rate}%):` : `Tax (${currency})`} value={<CurrencyDisplay amount={taxAmount} currency={currency} />} />
            <Row label="Total" value={<CurrencyDisplay amount={total} currency={currency} />} />
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
