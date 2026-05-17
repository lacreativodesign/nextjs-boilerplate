"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import EmptyState from "@/components/ui/EmptyState";
import LoadingButton from "@/components/ui/LoadingButton";
import { SkeletonTable } from "@/components/ui/Skeleton";
import { toastError, toastPromise } from "@/lib/toast";
import type { SearchFilter } from "@/types/search";

const AdvancedSearchDialog = dynamic(
  () => import("@/components/search/AdvancedSearchDialog").then((mod) => mod.AdvancedSearchDialog),
  {
    loading: () => null,
    ssr: false,
  },
);

type SalesStage =
  | "New Lead"
  | "Contacted"
  | "Qualified"
  | "Proposal Sent"
  | "Negotiation"
  | "Closed Won"
  | "Closed Lost";

type PaymentStatus = "Unpaid" | "Partially Paid" | "Paid" | "Refunded";
type RetainerStatus = "None" | "Active" | "Paused" | "Cancelled";

type ClientRecord = {
  id: string;

  companyName: string;
  website?: string;
  industry?: string;
  businessType?: string;
  country?: string;
  city?: string;
  timezone?: string;
  employeeCountRange?: string | null;
  yearsInBusinessRange?: string | null;

  segmentServices?: string[];
  segmentBusinessType?: string | null;
  segmentIndustry?: string | null;
  segmentGeo?: string | null;

  primaryContactName: string;
  primaryContactTitle?: string;
  primaryContactEmail: string;
  primaryContactPhone?: string;

  salesStage?: SalesStage | string;
  paymentStatus?: PaymentStatus | string;
  retainerStatus?: RetainerStatus | string;

  salesOwner?: string;
  accountManager?: string;
  productionOwner?: string;

  totalPaidUsd: number;
  orderId?: string;
  portalUserUid?: string | null;

  createdAt?: string | null;
  updatedAt?: string | null;
  lastActivity?: string | null;
};

type SortKey =
  | "orderId"
  | "companyName"
  | "primaryContactName"
  | "primaryContactEmail"
  | "primaryContactPhone"
  | "paymentStatus"
  | "totalPaidUsd"
  | "createdAt";

type SortDir = "asc" | "desc";

type FilterRow = {
  id: string;
  field: string;
  operator: string;
  value: string;
};

type SearchField = { name: string; label: string; type: "string" | "number" | "boolean" };

const clientSearchFields: SearchField[] = [
  { name: "orderId", label: "Order ID", type: "string" },
  { name: "companyName", label: "Company Name", type: "string" },
  { name: "primaryContactName", label: "Primary Contact", type: "string" },
  { name: "primaryContactEmail", label: "Primary Email", type: "string" },
  { name: "primaryContactPhone", label: "Primary Phone", type: "string" },
  { name: "paymentStatus", label: "Payment Status", type: "string" },
  { name: "totalPaidUsd", label: "Total Paid (USD)", type: "number" },
  { name: "createdAt", label: "Created At", type: "string" },
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

function fmtMoney(n: number) {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(Number(n || 0));
  } catch {
    return `$ ${Number(n || 0).toLocaleString()}`;
  }
}

function fmtDate(iso?: string | null) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("en-US");
}

function normalizeOrderId(orderId?: string) {
  const v = (orderId || "").trim();
  if (!v) return "";
  const up = v.toUpperCase();

  if (up.startsWith("LC-")) return up;
  if (up.startsWith("ORD-")) return `LC-${up.slice(4)}`;

  const digits = up.replace(/\D/g, "");
  if (digits) return `LC-${digits.padStart(4, "0")}`;

  return `LC-${up}`;
}

export default function ClientsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<ClientRecord[]>([]);

  const [sortKey, setSortKey] = useState<SortKey>("createdAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selected, setSelected] = useState<ClientRecord | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [activationSending, setActivationSending] = useState(false);
  const [addingClient, setAddingClient] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [advancedActive, setAdvancedActive] = useState(false);
  const [segmentMap, setSegmentMap] = useState<Record<string, { name: string; type: string }>>({});

  const buildSearchFilters = useCallback((filters: FilterRow[]): SearchFilter[] => {
    const fieldMap = new Map(clientSearchFields.map((field) => [field.name, field]));

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

  // Load Clients from API
  useEffect(() => {
    let alive = true;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const res = await fetch("/api/admin/clients/list", {
          method: "GET",
          cache: "no-store",
          credentials: "include",
        });

        const json = await res.json().catch(() => ({}));

        if (!res.ok || !json?.ok) {
          throw new Error(json?.error || res.statusText || "Failed to load clients");
        }

        const list: ClientRecord[] = Array.isArray(json?.clients) ? json.clients : [];
        if (!alive) return;
        setRows(list);
      } catch (e: any) {
        if (!alive) return;
        const message = e?.message || "Failed to load clients";
        setError(message);
        toastError(message);
        setRows([]);
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    }

    load();
    return () => {
      alive = false;
    };
  }, []);

  const handleAdvancedSearch = useCallback(
    async (filters: FilterRow[]) => {
      setLoading(true);
      setError(null);
      try {
        const payloadFilters = buildSearchFilters(filters);
        const res = await fetch("/api/clients/search", {
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
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(json?.error || "Failed to search clients");
        }
        const list: ClientRecord[] = Array.isArray(json?.results) ? json.results : [];
        setRows(list);
        setQuery("");
        setAdvancedActive(true);
      } catch (e: any) {
        const message = e?.message || "Failed to search clients";
        setError(message);
        toastError(message);
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
            module: "clients",
            filters: payloadFilters,
            sortBy: sortKey,
            sortOrder: sortDir,
            isShared: false,
          }),
        }).then(async (res) => {
          const data = await res.json().catch(() => ({}));
          if (!res.ok) {
            throw new Error(data?.error || "Failed to save search");
          }
          return data;
        }),
        {
          loading: "Saving search...",
          success: "Search saved.",
          error: (err) => err?.message || "Failed to save search.",
        }
      );
    },
    [buildSearchFilters, sortDir, sortKey]
  );

  const handleResetSearch = useCallback(() => {
    setQuery("");
    if (advancedActive) {
      setAdvancedActive(false);
      setLoading(true);
      fetch("/api/admin/clients/list", {
        method: "GET",
        cache: "no-store",
        credentials: "include",
      })
        .then(async (res) => {
          const json = await res.json().catch(() => ({}));
          if (!res.ok || !json?.ok) {
            throw new Error(json?.error || res.statusText || "Failed to load clients");
          }
          const list: ClientRecord[] = Array.isArray(json?.clients) ? json.clients : [];
          setRows(list);
        })
        .catch((e: any) => {
          const message = e?.message || "Failed to load clients";
          setError(message);
          toastError(message);
          setRows([]);
        })
        .finally(() => {
          setLoading(false);
        });
    }
  }, [advancedActive]);

  useEffect(() => {
    let alive = true;

    async function loadSegments() {
      try {
        const res = await fetch("/api/admin/clients/segments/list", {
          method: "GET",
          cache: "no-store",
          credentials: "include",
        });

        const json = await res.json().catch(() => ({}));
        if (!res.ok || !json?.ok) return;
        const segments = Array.isArray(json?.segments) ? json.segments : [];

        const map: Record<string, { name: string; type: string }> = {};
        segments.forEach((seg: any) => {
          if (seg?.slug) map[seg.slug] = { name: seg.name || seg.slug, type: seg.type || "" };
        });

        if (!alive) return;
        setSegmentMap(map);
      } catch {
        if (!alive) return;
        setSegmentMap({});
        toastError("Unable to load client segments.");
      }
    }

    loadSegments();
    return () => {
      alive = false;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows || [];

    return (rows || []).filter((c) => {
      const oid = normalizeOrderId(c.orderId);
      const hay = [
        c.companyName,
        c.primaryContactName,
        c.primaryContactEmail,
        c.primaryContactPhone,
        c.paymentStatus,
        c.orderId,
        oid,
        String(c.totalPaidUsd ?? ""),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return hay.includes(q);
    });
  }, [rows, query]);

  const sorted = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;

    const getVal = (c: ClientRecord) => {
      switch (sortKey) {
        case "orderId":
          return normalizeOrderId(c.orderId) || "";
        case "companyName":
          return c.companyName || "";
        case "primaryContactName":
          return c.primaryContactName || "";
        case "primaryContactEmail":
          return c.primaryContactEmail || "";
        case "primaryContactPhone":
          return c.primaryContactPhone || "";
        case "paymentStatus":
          return c.paymentStatus || "";
        case "totalPaidUsd":
          return Number(c.totalPaidUsd || 0);
        case "createdAt":
          return c.createdAt || "";
        default:
          return "";
      }
    };

    const arr = [...filtered];
    arr.sort((a, b) => {
      const av = getVal(a);
      const bv = getVal(b);

      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    });

    return arr;
  }, [filtered, sortKey, sortDir]);

  function toggleSort(k: SortKey) {
    if (k === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(k);
      setSortDir(k === "totalPaidUsd" ? "desc" : "asc");
    }
  }

  const sortBadge = (k: SortKey) => (k !== sortKey ? "" : sortDir === "asc" ? "▲" : "▼");

  function openDrawer(c: ClientRecord) {
    setSelected(c);
    setDrawerOpen(true);
    setActivationSending(false);
  }

  function closeDrawer() {
    setDrawerOpen(false);
    setSelected(null);
    setActivationSending(false);
  }

  async function sendActivationInvite() {
    if (!selected) return;
    setActivationSending(true);
    try {
      await toastPromise(
        fetch("/api/admin/clients/activation", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ clientId: selected.id }),
        }).then(async (res) => {
          const payload = await res.json().catch(() => ({}));
          if (!res.ok || !payload?.ok) {
            throw new Error(payload?.error || "Unable to send activation email.");
          }
          return payload;
        }),
        {
          loading: "Sending activation email...",
          success: "Activation email sent.",
          error: (err) => err?.message || "Unable to send activation email.",
        }
      );
    } catch (err) {
      console.error(err);
    } finally {
      setActivationSending(false);
    }
  }

  async function handleDelete(id: string) {
    const confirmed = window.confirm("Delete this client? This will archive the record for now.");
    if (!confirmed) return;

    try {
      setDeletingId(id);
      await toastPromise(
        fetch("/api/admin/clients/delete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ id }),
        }).then(async (res) => {
          const json = await res.json().catch(() => ({}));
          if (!res.ok || !json?.ok) throw new Error(json?.error || "Failed to delete client");
          return json;
        }),
        {
          loading: "Deleting client...",
          success: "Client deleted successfully.",
          error: (err) => err?.message || "Failed to delete client.",
        }
      );

      setRows((prev) => prev.filter((c) => c.id !== id));
      if (selected?.id === id) {
        setSelected(null);
        setDrawerOpen(false);
      }
    } catch (e: any) {
      console.error(e);
    } finally {
      setDeletingId((prev) => (prev === id ? null : prev));
    }
  }

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
    color: "var(--text-muted)",
    whiteSpace: "nowrap",
    fontWeight: 400, // IMPORTANT: body text regular (not bold)
  };

  const headerLabel = (label: string, badge?: string) => (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <span>{label}</span>
      {/* reserve space so sorting doesn't shift layout */}
      <span style={{ width: 14, display: "inline-block", textAlign: "center", opacity: badge ? 1 : 0.35 }}>
        {badge || "•"}
      </span>
    </span>
  );

  return (
    <div style={{ width: "100%" }}>
      <div className="page-header">
        <div>
          <h1 className="page-title">All Clients</h1>

          <div className="page-subtitle" style={{ marginBottom: 18 }}>
            Track leads and clients — pipeline, payments, ownership, retainers — in one control panel.
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button
            type="button"
            className="btn"
            onClick={() => setAdvancedOpen(true)}
            style={{ borderRadius: 999, padding: "10px 16px", fontWeight: 600 }}
          >
            🔍 Advanced Search
          </button>
          <LoadingButton
            type="button"
            className="btn"
            loading={addingClient}
            loadingText="Opening..."
            onClick={() => {
              setAddingClient(true);
              router.push("/clients/add");
            }}
            style={{ borderRadius: 999, padding: "10px 20px", fontWeight: 600 }}
          >
            + Add Client
          </LoadingButton>
        </div>
      </div>

      <div
        className="card"
        style={{
          marginBottom: 16,
          padding: 14,
          borderRadius: 16,
          background: "var(--surface-card)",
          border: "1px solid var(--border-subtle)",
          boxShadow: "var(--shadow-md)",
          display: "grid",
          gridTemplateColumns: "minmax(220px, 1.3fr) repeat(auto-fit, minmax(160px, 1fr))",
          gap: 12,
          alignItems: "center",
        }}
      >
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <input className="input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search keyword" />
          <button
            type="button"
            className="btn"
            onClick={handleResetSearch}
            style={{ borderRadius: 999, padding: "8px 16px", fontWeight: 600 }}
          >
            {advancedActive ? "Reset Search" : "Reset Filters"}
          </button>
        </div>
        <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
          {loading ? "Loading..." : `${sorted.length} client(s)`}
        </div>
      </div>

      <div className="table-shell">
        <div>
        {/* Loading state: keep table structure stable with skeletons. */}
        {loading ? (
          <SkeletonTable rows={6} columns={6} />
        ) : error ? (
          <p style={{ fontSize: 14, color: "#FCA5A5" }}>{error}</p>
        ) : sorted.length === 0 ? (
          <EmptyState
            title="No clients found"
            description="Add your first client to start tracking pipeline and payments."
            action={{ label: "Add Client", onClick: () => router.push("/clients/add") }}
          />
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14, minWidth: 1080 }}>
              <thead>
                <tr>
                  <th style={headerCellStyle} onClick={() => toggleSort("orderId")}>
                    {headerLabel("Order ID", sortBadge("orderId"))}
                  </th>
                  <th style={headerCellStyle} onClick={() => toggleSort("companyName")}>
                    {headerLabel("Company", sortBadge("companyName"))}
                  </th>
                  <th style={headerCellStyle} onClick={() => toggleSort("primaryContactName")}>
                    {headerLabel("Contact", sortBadge("primaryContactName"))}
                  </th>
                  <th style={headerCellStyle} onClick={() => toggleSort("primaryContactEmail")}>
                    {headerLabel("Email", sortBadge("primaryContactEmail"))}
                  </th>
                  <th style={headerCellStyle} onClick={() => toggleSort("primaryContactPhone")}>
                    {headerLabel("Phone", sortBadge("primaryContactPhone"))}
                  </th>
                  <th style={{ ...headerCellStyle, textAlign: "center", cursor: "default" }}>
                    {headerLabel("Action")}
                  </th>
                </tr>
              </thead>

              <tbody>
                {sorted.map((c) => {
                  return (
                    <tr key={c.id} onClick={() => openDrawer(c)}>
                      <td style={cellStyle}>{normalizeOrderId(c.orderId) || "-"}</td>
                      <td style={{ ...cellStyle, whiteSpace: "normal" }}>{c.companyName || "-"}</td>
                      <td style={cellStyle}>{c.primaryContactName || "-"}</td>
                      <td style={cellStyle}>{c.primaryContactEmail || "-"}</td>
                      <td style={cellStyle}>{c.primaryContactPhone || "-"}</td>
                      <td style={{ ...cellStyle, textAlign: "center" }}>
                        <div style={{ display: "flex", justifyContent: "center" }}>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              openDrawer(c);
                            }}
                            className="btn ghost"
                            style={{ padding: "8px 14px", borderRadius: 999, fontWeight: 500 }}
                          >
                            View
                          </button>
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
      </div>

      <AdvancedSearchDialog
        open={advancedOpen}
        onClose={() => setAdvancedOpen(false)}
        module="clients"
        fields={clientSearchFields}
        onSearch={handleAdvancedSearch}
        onSave={handleSaveSearch}
      />

      {drawerOpen && selected && (
        <div className="drawer-overlay" onClick={closeDrawer}>
          <div
            className="drawer-panel drawer-panel--sm client-detail-drawer"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="client-detail-drawer__scroll">
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <div>
                  <div style={{ fontSize: 20, fontWeight: 900, color: "var(--text-primary)" }}>
                    {selected.companyName}
                  </div>
                  <div style={{ opacity: 0.75, fontSize: 12, color: "var(--text-muted)" }}>
                    {selected.primaryContactName} · {selected.primaryContactEmail}
                  </div>
                </div>

                <button
                  className="btn ghost"
                  onClick={closeDrawer}
                  style={{ height: 34, borderRadius: 999, fontWeight: 400 }}
                >
                  Close
                </button>
              </div>

              <div style={{ height: 14 }} />

              <Section title="Company">
                <Row label="Order ID" value={normalizeOrderId(selected.orderId) || "-"} />
                <Row label="Website" value={selected.website || "-"} />
                <Row label="Industry" value={selected.industry || "-"} />
                <Row label="Business Type" value={selected.businessType || "-"} />
                <Row label="Country" value={selected.country || "-"} />
                <Row label="City" value={selected.city || "-"} />
                <Row label="Timezone" value={selected.timezone || "-"} />
              </Section>

              <div style={{ height: 12 }} />

              <Section title="Profile">
                <Row
                  label="Services"
                  value={
                    (selected.segmentServices || [])
                      .map((slug) => segmentMap[slug]?.name || slug)
                      .filter(Boolean)
                      .join(", ") || "-"
                  }
                />
                <Row
                  label="Segment (Industry)"
                  value={segmentMap[selected.segmentIndustry || ""]?.name || selected.segmentIndustry || "-"}
                />
                <Row
                  label="Segment (Business)"
                  value={segmentMap[selected.segmentBusinessType || ""]?.name || selected.segmentBusinessType || "-"}
                />
                <Row
                  label="Segment (Geo)"
                  value={segmentMap[selected.segmentGeo || ""]?.name || selected.segmentGeo || "-"}
                />
                <Row label="Employee Count" value={selected.employeeCountRange || "-"} />
                <Row label="Years in Business" value={selected.yearsInBusinessRange || "-"} />
              </Section>

              <div style={{ height: 12 }} />

              <Section title="Contact">
                <Row label="Name" value={selected.primaryContactName || "-"} />
                <Row label="Title" value={selected.primaryContactTitle || "-"} />
                <Row label="Email" value={selected.primaryContactEmail || "-"} />
                <Row label="Phone" value={selected.primaryContactPhone || "-"} />
              </Section>

              <div style={{ height: 12 }} />

              <Section title="Finance">
                <Row label="Payment Status" value={(selected.paymentStatus as string) || "-"} />
                <Row label="Total Paid (USD)" value={fmtMoney(Number(selected.totalPaidUsd || 0))} />
                <Row label="Created" value={fmtDate(selected.createdAt)} />
                <Row label="Last Activity" value={fmtDate(selected.lastActivity)} />
              </Section>

              <div style={{ height: 12 }} />

              <Section title="Ownership">
                <Row label="Sales Owner" value={selected.salesOwner || "-"} />
                <Row label="Account Manager" value={selected.accountManager || "-"} />
                <Row label="Production Owner" value={selected.productionOwner || "-"} />
              </Section>

              <div style={{ height: 12 }} />

              <Section title="Pipeline">
                <Row label="Sales Stage" value={(selected.salesStage as string) || "-"} />
                <Row label="Payment Status" value={(selected.paymentStatus as string) || "-"} />
                <Row label="Retainer Status" value={(selected.retainerStatus as string) || "-"} />
              </Section>

              <div style={{ height: 12 }} />

              <div
                className="client-detail-drawer__actions"
                style={{ display: "flex", justifyContent: "flex-end", gap: 10, flexWrap: "wrap" }}
              >
                {!selected.portalUserUid && (
                  <LoadingButton
                    type="button"
                    className="btn ghost"
                    style={{ borderRadius: 12, fontWeight: 400 }}
                    onClick={sendActivationInvite}
                    loading={activationSending}
                    loadingText="Sending..."
                  >
                    Send Client Activation Email
                  </LoadingButton>
                )}
                <button
                  type="button"
                  className="btn"
                  style={{ borderRadius: 12, fontWeight: 400 }}
                  onClick={() => router.push(`/clients/${selected.id}/edit`)}
                >
                  Edit Client
                </button>
                <LoadingButton
                  type="button"
                  className="btn btn-danger client-detail-drawer__delete"
                  onClick={() => handleDelete(selected.id)}
                  loading={deletingId === selected.id}
                  loadingText="Deleting..."
                  style={{
                    borderRadius: 12,
                    fontWeight: 400,
                    opacity: deletingId === selected.id ? 0.7 : 1,
                  }}
                >
                  Delete Client
                </LoadingButton>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="card"
      style={{
        padding: 14,
        borderRadius: 14,
        background: "var(--surface-muted)",
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 500, letterSpacing: "0.06em", opacity: 0.75 }}>{title}</div>
      <div style={{ marginTop: 10, display: "grid", gap: 10 }}>{children}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        padding: 12,
        borderRadius: 12,
        border: "1px solid var(--border-subtle)",
        display: "flex",
        justifyContent: "space-between",
        gap: 12,
      }}
    >
      <div style={{ fontSize: 11, opacity: 0.7, fontWeight: 400 }}>{label}</div>
      <div style={{ fontWeight: 400, textAlign: "right" }}>{value}</div>
    </div>
  );
}
