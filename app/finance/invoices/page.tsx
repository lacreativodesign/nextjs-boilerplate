"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import MasterSelect from "@/components/ui/MasterSelect";
import EmptyState from "@/components/ui/EmptyState";
import LoadingButton from "@/components/ui/LoadingButton";
import { SkeletonTable } from "@/components/ui/Skeleton";
import { formatDate, formatDateTime, formatUsd } from "@/components/finance/financeUtils";
import type { InvoiceRecord } from "@/lib/finance/types";
import { SUPPORTED_CURRENCIES } from "@/lib/currency/currencyConverter";
import { toastError, toastPromise, toastWarning } from "@/lib/toast";
import { generatePaymentLink } from "@/lib/payments/payment-link";
import { SmartSearchBar } from "@/components/search/SmartSearchBar";
import { smartMatch } from "@/lib/search/smartMatch";
import { apiFetch } from "@/lib/api/client";

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

const getCurrencySymbol = (code?: string) => {
  return SUPPORTED_CURRENCIES.find((currency) => currency.code === code)?.symbol || code || "USD";
};

export default function FinanceInvoicesPage() {
  const router = useRouter();
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
      const res = await apiFetch("/api/finance/invoices/list", { cache: "no-store" });
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
      const res = await apiFetch("/api/finance/clients/list", { cache: "no-store" });
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
    const now = new Date();

    const list = invoices.filter((invoice) => {
      if (statusFilter && invoice.status !== statusFilter) return false;
      if (clientFilter && invoice.clientId !== clientFilter) return false;

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

    return smartMatch(list, query, (invoice) => [
      invoice.orderId,
      invoice.clientName,
      invoice.clientId,
    ]);
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
        apiFetch("/api/finance/invoices/mark-paid", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: invoice.id, isDeleted: true }),
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

  const handleDelete = async (invoice: InvoiceRecord) => {
    if (!canUpdate || !window.confirm("Delete this invoice?")) return;
    try {
      setActionLoading(`delete-${invoice.id}`);
      await toastPromise(
        apiFetch("/api/finance/invoices/update", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: invoice.id }),
        }).then(async (res) => {
          const data = await res.json().catch(() => null);
          if (!res.ok || !data?.ok) {
            throw new Error(data?.error || "Unable to delete invoice.");
          }
          return data;
        }),
        {
          loading: "Deleting invoice...",
          success: "Invoice deleted.",
          error: (err) => err?.message || "Unable to delete invoice.",
        }
      );
      if (selectedInvoice?.id === invoice.id) {
        closeDrawer();
      }
      await loadInvoices();
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

      <div>
        <h1 className="page-title">Invoices</h1>
        <p className="page-subtitle">USD invoicing with live Firestore sync.</p>
      </div>

      <div style={{ marginTop: 12 }}>
        <button className="btn" onClick={() => router.push("/admin/finance/invoices/create")} style={{ borderRadius: 999 }}>
          Create Invoice
        </button>
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        <div style={{ flex: "1 1 240px", minWidth: 220 }}>
          <SmartSearchBar value={query} onChange={setQuery} />
        </div>
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

      <div className="table-shell">
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
                  <th style={{ textAlign: "left", padding: "14px 16px", fontWeight: 700 }}>
                    <button type="button" onClick={() => toggleSort("amountTotalUsd")} className="table-sort">
                      Total (USD) {sortKey === "amountTotalUsd" ? (sortDir === "asc" ? "▲" : "▼") : ""}
                    </button>
                  </th>
                  <th style={{ textAlign: "left", padding: "14px 16px", fontWeight: 700 }}>
                    <button type="button" onClick={() => toggleSort("dueDate")} className="table-sort">
                      Due Date {sortKey === "dueDate" ? (sortDir === "asc" ? "▲" : "▼") : ""}
                    </button>
                  </th>
                  <th style={{ textAlign: "left", padding: "14px 16px", fontWeight: 700 }}>
                    <button type="button" onClick={() => toggleSort("updatedAt")} className="table-sort">
                      Updated {sortKey === "updatedAt" ? (sortDir === "asc" ? "▲" : "▼") : ""}
                    </button>
                  </th>
                  <th style={{ textAlign: "left", padding: "14px 16px", fontWeight: 700 }}>
                    <button type="button" onClick={() => toggleSort("status")} className="table-sort">
                      Status {sortKey === "status" ? (sortDir === "asc" ? "▲" : "▼") : ""}
                    </button>
                  </th>
                  <th style={{ textAlign: "center", padding: "14px 16px", fontWeight: 700 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {sortedInvoices.map((invoice) => {
                  return (
                    <tr key={invoice.id}>
                      <td style={{ padding: "14px 16px", textAlign: "left" }}>
                        <div style={{ fontWeight: 600 }}>{invoice.orderId || invoice.id}</div>
                        <div style={{ fontSize: 12, opacity: 0.65 }}>{invoice.clientId}</div>
                      </td>
                      <td style={{ padding: "14px 16px", textAlign: "left" }}>{invoice.clientName}</td>
                      <td style={{ padding: "14px 16px", textAlign: "center" }}><span>{getCurrencySymbol(invoice.currency)}{Number(invoice.amountTotal || invoice.amountTotalUsd || 0).toFixed(2)}</span></td>
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
                          {canUpdate && (
                            <LoadingButton
                              type="button"
                              className="btn ghost"
                              onClick={() => handleDelete(invoice)}
                              loading={actionLoading === `delete-${invoice.id}`}
                              loadingText="Deleting"
                              style={{ padding: "6px 12px", borderRadius: 999, fontSize: 12 }}
                            >
                              Delete
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
                    canUpdate={canUpdate}
          onClose={closeDrawer}
          onMarkPaid={handleMarkPaid}
          onDelete={handleDelete}
          actionLoading={actionLoading === selectedInvoice.id || actionLoading === `delete-${selectedInvoice.id}`}
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
  canUpdate,
  onClose,
  onMarkPaid,
  onDelete,
  actionLoading,
}: {
  invoice: InvoiceRecord;
  canUpdate: boolean;
  onClose: () => void;
  onMarkPaid: (invoice: InvoiceRecord) => void;
  onDelete: (invoice: InvoiceRecord) => void;
  actionLoading: boolean;
}) {
  const subtotal = Number(invoice.amountSubtotal || invoice.amountSubtotalUsd || 0);
  const tax = Number(invoice.amountTax || invoice.amountTaxUsd || 0);
  const total = Number(invoice.amountTotal || invoice.amountTotalUsd || 0);
  const [copied, setCopied] = useState(false);
  const normalizedStatus = String(invoice.status || "").toLowerCase();
  const canShowPaymentLink = normalizedStatus === "sent" || normalizedStatus === "pending";
  const paymentLink = canShowPaymentLink
    ? (() => {
        try {
          return generatePaymentLink(invoice.id);
        } catch {
          if (typeof window !== "undefined") {
            return `${window.location.origin}/pay/${invoice.id}`;
          }
          return `/pay/${invoice.id}`;
        }
      })()
    : "";

  const handleCopyLink = async () => {
    if (!paymentLink) return;
    try {
      await navigator.clipboard.writeText(paymentLink);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
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
          width: "min(520px, 100vw)",
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
                <div key={`${item.name}-${idx}`} style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}>
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


        <div style={{ height: 16 }} />

        {canShowPaymentLink && (
          <div className="card" style={{ padding: 16, borderRadius: 14 }}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>Payment Link</div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <code style={{ fontSize: 12, padding: "8px 10px", borderRadius: 8, background: "var(--surface-muted)" }}>{paymentLink}</code>
              <button type="button" className="btn ghost" style={{ borderRadius: 999, height: 32 }} onClick={handleCopyLink}>
                Copy Link
              </button>
              {copied && <span style={{ fontSize: 12, color: "#16a34a", fontWeight: 600 }}>Copied!</span>}
            </div>
          </div>
        )}

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
          {canUpdate && (
            <LoadingButton
              className="btn ghost"
              onClick={() => onDelete(invoice)}
              loading={actionLoading}
              loadingText="Deleting"
              style={{ borderRadius: 999 }}
            >
              Delete
            </LoadingButton>
          )}
          <a
            className="btn ghost"
            style={{ borderRadius: 999 }}
            href={`/api/admin/finance/invoices/${invoice.id}/pdf`}
            target="_blank"
            rel="noreferrer"
          >
            Download PDF
          </a>
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
