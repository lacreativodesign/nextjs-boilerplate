"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type EventRecord = {
  id: string;
  type: string;
  title: string;
  description: string;
  entityType: string | null;
  entityId: string | null;
  actorUid: string | null;
  actorName: string | null;
  createdAt: string | null;
  metadata: Record<string, unknown>;
};

type ActivityPageProps = {
  apiPath: string;
};

type DateRangeOption = "7" | "30" | "90" | "all";

const DATE_RANGE_OPTIONS: Array<{ value: DateRangeOption; label: string }> = [
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
  { value: "all", label: "All time" },
];

function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString();
}

function resolveEntityRoute(entityType?: string | null) {
  if (!entityType) return null;
  const normalized = entityType.toLowerCase();
  if (normalized === "deal") return "/sales_manager/deals";
  if (normalized === "change_request") return "/admin/projects/change-requests";
  if (normalized === "invoice") return "/admin/finance/invoices";
  if (normalized === "payment") return "/admin/finance/payments";
  if (normalized === "project") return "/admin/projects";
  if (normalized === "client") return "/admin/clients";
  return null;
}

export default function ActivityPage({ apiPath }: ActivityPageProps) {
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [entityFilter, setEntityFilter] = useState("");
  const [dateRange, setDateRange] = useState<DateRangeOption>("30");
  const [selected, setSelected] = useState<EventRecord | null>(null);

  const buildDateFrom = (range: DateRangeOption) => {
    if (range === "all") return null;
    const days = Number(range);
    if (!Number.isFinite(days)) return null;
    const date = new Date();
    date.setDate(date.getDate() - days);
    return date.toISOString();
  };

  const fetchEvents = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams();
      if (search.trim()) params.set("q", search.trim());
      if (typeFilter) params.set("type", typeFilter);
      if (entityFilter) params.set("entityType", entityFilter);
      const dateFrom = buildDateFrom(dateRange);
      if (dateFrom) params.set("dateFrom", dateFrom);
      params.set("limit", "100");

      const res = await fetch(`${apiPath}?${params.toString()}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "Unable to load activity.");
      }
      setEvents(Array.isArray(data.events) ? data.events : []);
    } catch (err: any) {
      console.error("Activity fetch error", err);
      setError(err?.message || "Unable to load activity.");
    } finally {
      setLoading(false);
    }
  }, [apiPath, search, typeFilter, entityFilter, dateRange]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  const typeOptions = useMemo(() => {
    const set = new Set<string>();
    events.forEach((event) => {
      if (event.type) set.add(event.type);
    });
    return Array.from(set).sort();
  }, [events]);

  const entityOptions = useMemo(() => {
    const set = new Set<string>();
    events.forEach((event) => {
      if (event.entityType) set.add(event.entityType);
    });
    return Array.from(set).sort();
  }, [events]);

  return (
    <div className="w-full">
      <div className="page-header" style={{ marginBottom: 16 }}>
        <div>
          <h1 className="page-title">Activity</h1>
          <p className="page-subtitle" style={{ marginTop: 6 }}>
            Tenant-scoped audit activity across core workflows.
          </p>
        </div>
        <button className="btn" onClick={fetchEvents} style={{ borderRadius: 999 }}>
          Refresh
        </button>
      </div>

      <div className="card" style={{ padding: 16, borderRadius: 16 }}>
        <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
          <input
            className="input"
            placeholder="Search activity..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <select className="input" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
            <option value="">All types</option>
            {typeOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          <select className="input" value={entityFilter} onChange={(event) => setEntityFilter(event.target.value)}>
            <option value="">All entities</option>
            {entityOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          <select className="input" value={dateRange} onChange={(event) => setDateRange(event.target.value as DateRangeOption)}>
            {DATE_RANGE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="table-shell" style={{ marginTop: 16 }}>
        <div style={{ overflowX: "auto" }}>
          <table className="table" style={{ minWidth: 760 }}>
            <thead>
              <tr>
                <th>Time</th>
                <th>Type</th>
                <th>Title</th>
                <th>Actor</th>
                <th>Entity</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={6} className="text-sm text-[var(--text-muted)]">
                    Loading activity...
                  </td>
                </tr>
              )}
              {!loading && events.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-sm text-[var(--text-muted)]">
                    No activity found for this tenant.
                  </td>
                </tr>
              )}
              {!loading &&
                events.map((event) => (
                  <tr key={event.id}>
                    <td>{formatDate(event.createdAt)}</td>
                    <td>{event.type || "—"}</td>
                    <td>{event.title || "—"}</td>
                    <td>{event.actorName || event.actorUid || "—"}</td>
                    <td>
                      {event.entityType || "—"}
                      {event.entityId ? ` · ${event.entityId}` : ""}
                    </td>
                    <td>
                      <button className="btn ghost" onClick={() => setSelected(event)}>
                        View
                      </button>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        {error && <div className="text-sm text-red-500" style={{ marginTop: 12 }}>{error}</div>}
      </div>

      {selected && (
        <div className="drawer-overlay" onClick={() => setSelected(null)}>
          <div className="drawer-panel drawer-panel--md" onClick={(event) => event.stopPropagation()}>
            <div className="drawer-title">Activity Details</div>
            <div className="drawer-subtitle" style={{ marginTop: 4 }}>
              {selected.type}
            </div>
            <div style={{ marginTop: 16, display: "grid", gap: 12 }}>
              <div>
                <div className="text-xs text-[var(--text-muted)]">Title</div>
                <div>{selected.title || "—"}</div>
              </div>
              <div>
                <div className="text-xs text-[var(--text-muted)]">Description</div>
                <div>{selected.description || "—"}</div>
              </div>
              <div>
                <div className="text-xs text-[var(--text-muted)]">Actor</div>
                <div>{selected.actorName || selected.actorUid || "—"}</div>
              </div>
              <div>
                <div className="text-xs text-[var(--text-muted)]">Entity</div>
                <div>
                  {selected.entityType || "—"}
                  {selected.entityId ? ` · ${selected.entityId}` : ""}
                </div>
              </div>
              <div>
                <div className="text-xs text-[var(--text-muted)]">Metadata</div>
                {Object.keys(selected.metadata || {}).length === 0 ? (
                  <div className="text-sm text-[var(--text-muted)]">No metadata.</div>
                ) : (
                  <div className="space-y-2">
                    {Object.entries(selected.metadata).map(([key, value]) => (
                      <div key={key} style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                        <span className="text-xs text-[var(--text-muted)]">{key}</span>
                        <span className="text-sm">{String(value)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              {resolveEntityRoute(selected.entityType) && (
                <div>
                  <a className="btn" href={resolveEntityRoute(selected.entityType) || "#"}>
                    Open related record
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
