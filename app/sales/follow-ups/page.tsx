"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import SalesDrawer from "@/components/sales/SalesDrawer";
import { formatDateTime } from "@/components/finance/financeUtils";
import { FOLLOW_UP_STATUS, FOLLOW_UP_TYPES, isOverdue, toInputDateTime } from "@/lib/sales/utils";
import { useIsDarkMode } from "@/lib/useIsDarkMode";

const TYPE_OPTIONS = ["All", ...FOLLOW_UP_TYPES];
const STATUS_OPTIONS = ["All", ...FOLLOW_UP_STATUS];

type FollowUpRecord = {
  id: string;
  relatedType: string;
  relatedId?: string | null;
  relatedName: string;
  type: string;
  dueDate?: string | null;
  ownerId?: string | null;
  ownerName?: string | null;
  status: string;
};

type FollowUpResponse = { ok: boolean; followUps: FollowUpRecord[] };

type SortKey = "relatedName" | "type" | "dueDate" | "status";

type SortDir = "asc" | "desc";

type ErrorState = { title: string; message: string };

type FollowUpForm = {
  id?: string;
  relatedType: string;
  relatedName: string;
  relatedId?: string | null;
  type: string;
  dueDate: string;
  status: string;
};

const defaultForm: FollowUpForm = {
  relatedType: "Lead",
  relatedName: "",
  type: FOLLOW_UP_TYPES[0],
  dueDate: "",
  status: "Open",
};

export default function SalesFollowUpsPage() {
  const isDark = useIsDarkMode();
  const [followUps, setFollowUps] = useState<FollowUpRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ErrorState | null>(null);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [sortKey, setSortKey] = useState<SortKey>("dueDate");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState<"create" | "edit">("create");
  const [form, setForm] = useState<FollowUpForm>(defaultForm);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const loadFollowUps = useCallback(async () => {
    try {
      setError(null);
      setLoading(true);
      const res = await fetch("/api/admin/sales/follow-ups/list", { cache: "no-store", credentials: "include" });
      const data = (await res.json()) as FollowUpResponse;
      if (!res.ok || !data.ok) {
        throw new Error(data?.error || "Unable to load follow-ups.");
      }
      setFollowUps(data.followUps || []);
    } catch (err) {
      console.error("Follow-ups load error", err);
      setError({ title: "Unable to load follow-ups", message: "Please try again in a moment." });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFollowUps();
  }, [loadFollowUps]);

  const filteredFollowUps = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = [...followUps];
    if (typeFilter !== "All") {
      list = list.filter((item) => item.type === typeFilter);
    }
    if (statusFilter !== "All") {
      list = list.filter((item) => item.status === statusFilter);
    }
    if (q) {
      list = list.filter((item) => {
        const hay = [item.relatedName, item.type, item.ownerName].filter(Boolean).join(" ").toLowerCase();
        return hay.includes(q);
      });
    }
    return list;
  }, [followUps, query, typeFilter, statusFilter]);

  const sortedFollowUps = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    const list = [...filteredFollowUps];
    list.sort((a, b) => {
      const valA = String(a[sortKey] ?? "");
      const valB = String(b[sortKey] ?? "");
      return valA.localeCompare(valB) * dir;
    });
    return list;
  }, [filteredFollowUps, sortDir, sortKey]);

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

  const openCreate = () => {
    setDrawerMode("create");
    setForm(defaultForm);
    setDrawerOpen(true);
  };

  const openEdit = (item: FollowUpRecord) => {
    setDrawerMode("edit");
    setForm({
      id: item.id,
      relatedType: item.relatedType,
      relatedName: item.relatedName,
      relatedId: item.relatedId || null,
      type: item.type,
      dueDate: toInputDateTime(item.dueDate),
      status: item.status,
    });
    setDrawerOpen(true);
  };

  const handleSave = async () => {
    if (!form.dueDate) {
      setError({ title: "Due date required", message: "Follow-ups require both date and time." });
      return;
    }
    try {
      setActionLoading("save");
      const endpoint = drawerMode === "create" ? "/api/admin/sales/follow-ups/create" : "/api/admin/sales/follow-ups/update";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          ...form,
          dueDate: form.dueDate || null,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data?.error || "Unable to save follow-up.");
      }
      setDrawerOpen(false);
      setError(null);
      await loadFollowUps();
    } catch (err) {
      console.error("Follow-up save error", err);
      setError({ title: "Unable to save follow-up", message: "Please try again." });
    } finally {
      setActionLoading(null);
    }
  };

  const markDone = async (item: FollowUpRecord) => {
    try {
      setActionLoading(item.id);
      const res = await fetch("/api/admin/sales/follow-ups/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ id: item.id, status: "Done" }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data?.error || "Unable to update follow-up.");
      }
      await loadFollowUps();
    } catch (err) {
      console.error("Follow-up update error", err);
      setError({ title: "Unable to update follow-up", message: "Please try again." });
    } finally {
      setActionLoading(null);
    }
  };

  const deleteFollowUp = async (item: FollowUpRecord) => {
    if (!window.confirm("Delete this follow-up?")) return;
    try {
      setActionLoading(item.id);
      const res = await fetch("/api/admin/sales/follow-ups/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ id: item.id }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data?.error || "Unable to delete follow-up.");
      }
      await loadFollowUps();
    } catch (err) {
      console.error("Follow-up delete error", err);
      setError({ title: "Unable to delete follow-up", message: "Please try again." });
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
          <h3 style={{ fontSize: 20, fontWeight: 700 }}>Follow-ups</h3>
          <p style={{ fontSize: 13, color: "var(--sidebar-text)" }}>
            Track your scheduled touchpoints and due dates.
          </p>
        </div>
        <button className="btn" onClick={openCreate} style={{ borderRadius: 999 }}>
          + Add Follow-up
        </button>
      </div>

      <div className="card" style={{ marginTop: 18, padding: 18, borderRadius: 18 }}>
        <div className="grid gap-4 md:grid-cols-[1.2fr_0.6fr_0.6fr]">
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
            <label className="text-xs font-semibold text-slate-500">Type</label>
            <select
              value={typeFilter}
              onChange={(event) => setTypeFilter(event.target.value)}
              className="input mt-2"
            >
              {TYPE_OPTIONS.map((type) => (
                <option key={type} value={type}>
                  {type === "All" ? "All types" : type}
                </option>
              ))}
            </select>
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
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 960 }}>
              <thead>
                <tr style={{ background: isDark ? "rgba(30,30,30,0.9)" : "rgba(248,250,252,0.9)" }}>
                  <th style={headerCellStyle} onClick={() => toggleSort("relatedName")}>
                    {headerLabel("Lead/Deal", sortBadge("relatedName"))}
                  </th>
                  <th style={headerCellStyle} onClick={() => toggleSort("type")}>
                    {headerLabel("Type", sortBadge("type"))}
                  </th>
                  <th style={{ ...headerCellStyle, textAlign: "left" }} onClick={() => toggleSort("dueDate")}>
                    {headerLabel("Due Date", sortBadge("dueDate"))}
                  </th>
                  <th style={{ ...headerCellStyle, textAlign: "center" }} onClick={() => toggleSort("status")}>
                    {headerLabel("Status", sortBadge("status"))}
                  </th>
                  <th style={{ ...headerCellStyle, textAlign: "center" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={5} style={{ padding: 24, textAlign: "center" }}>
                      Loading follow-ups...
                    </td>
                  </tr>
                ) : sortedFollowUps.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ padding: 24, textAlign: "center" }}>
                      No follow-ups found.
                    </td>
                  </tr>
                ) : (
                  sortedFollowUps.map((item) => (
                    <tr key={item.id}>
                      <td style={cellStyle}>{item.relatedName || "-"}</td>
                      <td style={cellStyle}>{item.type}</td>
                      <td style={{ ...cellStyle, textAlign: "center" }}>
                        <span className={isOverdue(item.dueDate) ? "text-red-500" : ""}>
                          {formatDateTime(item.dueDate)}
                        </span>
                      </td>
                      <td style={{ ...cellStyle, textAlign: "center" }}>{item.status}</td>
                      <td style={{ ...cellStyle, textAlign: "center" }}>
                        <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
                          <button className="btn ghost" onClick={() => openEdit(item)} style={{ borderRadius: 999 }}>
                            View
                          </button>
                          {item.status !== "Done" && (
                            <button
                              className="btn"
                              onClick={() => markDone(item)}
                              disabled={actionLoading === item.id}
                              style={{ borderRadius: 999 }}
                            >
                              {actionLoading === item.id ? "Updating" : "Mark Done"}
                            </button>
                          )}
                          <button
                            className="btn ghost"
                            onClick={() => deleteFollowUp(item)}
                            disabled={actionLoading === item.id}
                            style={{ borderRadius: 999 }}
                          >
                            {actionLoading === item.id ? "Deleting" : "Delete"}
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

      {drawerOpen && (
        <SalesDrawer
          title={drawerMode === "create" ? "Add Follow-up" : "Follow-up Details"}
          subtitle={drawerMode === "create" ? "Schedule a new follow-up" : "Update follow-up"}
          onClose={() => setDrawerOpen(false)}
          actions={
            <button className="btn" onClick={handleSave} disabled={actionLoading === "save"}>
              {actionLoading === "save" ? "Saving..." : "Save Follow-up"}
            </button>
          }
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-xs font-semibold text-slate-500">Related Type</label>
              <select
                className="input mt-2"
                value={form.relatedType}
                onChange={(event) => setForm((prev) => ({ ...prev, relatedType: event.target.value }))}
              >
                <option value="Lead">Lead</option>
                <option value="Deal">Deal</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500">Related Name</label>
              <input
                className="input mt-2"
                value={form.relatedName}
                onChange={(event) => setForm((prev) => ({ ...prev, relatedName: event.target.value }))}
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500">Type</label>
              <select
                className="input mt-2"
                value={form.type}
                onChange={(event) => setForm((prev) => ({ ...prev, type: event.target.value }))}
              >
                {FOLLOW_UP_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500">Due Date & Time</label>
              <input
                className="input mt-2"
                type="datetime-local"
                value={form.dueDate}
                onChange={(event) => setForm((prev) => ({ ...prev, dueDate: event.target.value }))}
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500">Status</label>
              <select
                className="input mt-2"
                value={form.status}
                onChange={(event) => setForm((prev) => ({ ...prev, status: event.target.value }))}
              >
                {FOLLOW_UP_STATUS.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </SalesDrawer>
      )}
    </div>
  );
}
