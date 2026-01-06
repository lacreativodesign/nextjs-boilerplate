"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import SalesDrawer from "@/components/sales/SalesDrawer";
import { formatDateTime } from "@/components/finance/financeUtils";
import { useIsDarkMode } from "@/lib/useIsDarkMode";

const STATUS_OPTIONS = ["All", "open", "done"] as const;

type FollowUpRecord = {
  id: string;
  leadId: string;
  title: string;
  dueAt: string | null;
  status: "open" | "done";
  createdAt: string | null;
  doneAt?: string | null;
};

type FollowUpResponse = { ok: boolean; followUps: FollowUpRecord[] };

type SortKey = "title" | "leadId" | "dueAt" | "status" | "createdAt";

type SortDir = "asc" | "desc";

type ErrorState = { title: string; message: string };

type FollowUpForm = {
  leadId: string;
  title: string;
  dueAt: string;
};

const defaultForm: FollowUpForm = {
  leadId: "",
  title: "",
  dueAt: "",
};

export default function SalesFollowUpsPage() {
  const isDark = useIsDarkMode();
  const [followUps, setFollowUps] = useState<FollowUpRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ErrorState | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<(typeof STATUS_OPTIONS)[number]>("All");
  const [sortKey, setSortKey] = useState<SortKey>("dueAt");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [form, setForm] = useState<FollowUpForm>(defaultForm);
  const [actionLoading, setActionLoading] = useState(false);

  const loadFollowUps = useCallback(async () => {
    try {
      setError(null);
      setLoading(true);
      const res = await fetch("/api/sales/followups/list", { cache: "no-store", credentials: "include" });
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
    if (statusFilter !== "All") {
      list = list.filter((item) => item.status === statusFilter);
    }
    if (q) {
      list = list.filter((item) => {
        const hay = [item.title, item.leadId].filter(Boolean).join(" ").toLowerCase();
        return hay.includes(q);
      });
    }
    return list;
  }, [followUps, query, statusFilter]);

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
    setForm(defaultForm);
    setDrawerOpen(true);
  };

  const handleSave = async () => {
    try {
      setActionLoading(true);
      const res = await fetch("/api/sales/followups/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          leadId: form.leadId,
          title: form.title,
          dueAt: form.dueAt,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data?.error || "Unable to save follow-up.");
      }
      setDrawerOpen(false);
      await loadFollowUps();
    } catch (err) {
      console.error("Follow-up save error", err);
      setError({ title: "Unable to save follow-up", message: "Please try again." });
    } finally {
      setActionLoading(false);
    }
  };

  const markDone = async (item: FollowUpRecord) => {
    try {
      setActionLoading(true);
      const res = await fetch("/api/sales/followups/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ followUpId: item.id }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data?.error || "Unable to complete follow-up.");
      }
      await loadFollowUps();
    } catch (err) {
      console.error("Follow-up update error", err);
      setError({ title: "Unable to update follow-up", message: "Please try again." });
    } finally {
      setActionLoading(false);
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
          <h3 style={{ fontSize: 20, fontWeight: 700 }}>Follow-Ups</h3>
          <p style={{ fontSize: 13, color: "var(--sidebar-text)" }}>
            Keep track of follow-ups by due date and completion status.
          </p>
        </div>
        <button className="btn" onClick={openCreate} style={{ borderRadius: 999 }}>
          + Create Follow-Up
        </button>
      </div>

      <div className="card" style={{ marginTop: 18, padding: 18, borderRadius: 18 }}>
        <div className="grid gap-4 md:grid-cols-[1.2fr_0.4fr]">
          <div>
            <label className="text-xs font-semibold text-slate-500">Search</label>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by title or lead"
              className="input mt-2"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500">Status</label>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as (typeof STATUS_OPTIONS)[number])}
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
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900, tableLayout: "fixed" }}>
              <thead>
                <tr style={{ background: isDark ? "rgba(30,30,30,0.9)" : "rgba(248,250,252,0.9)" }}>
                  <th style={headerCellStyle} onClick={() => toggleSort("title")}>
                    {headerLabel("Title", sortBadge("title"))}
                  </th>
                  <th style={headerCellStyle} onClick={() => toggleSort("leadId")}>
                    {headerLabel("Lead", sortBadge("leadId"))}
                  </th>
                  <th style={headerCellStyle} onClick={() => toggleSort("dueAt")}>
                    {headerLabel("Due", sortBadge("dueAt"))}
                  </th>
                  <th style={headerCellStyle} onClick={() => toggleSort("status")}>
                    {headerLabel("Status", sortBadge("status"))}
                  </th>
                  <th style={headerCellStyle} onClick={() => toggleSort("createdAt")}>
                    {headerLabel("Created", sortBadge("createdAt"))}
                  </th>
                  <th style={{ ...headerCellStyle, textAlign: "center" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={6} style={{ padding: 24, textAlign: "center" }}>
                      Loading follow-ups...
                    </td>
                  </tr>
                ) : sortedFollowUps.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ padding: 24, textAlign: "center" }}>
                      No follow-ups found.
                    </td>
                  </tr>
                ) : (
                  sortedFollowUps.map((item) => (
                    <tr key={item.id}>
                      <td style={{ ...cellStyle, whiteSpace: "normal" }}>{item.title || "Follow-up"}</td>
                      <td style={cellStyle}>{item.leadId || "-"}</td>
                      <td style={cellStyle}>{formatDateTime(item.dueAt)}</td>
                      <td style={cellStyle}>{item.status}</td>
                      <td style={cellStyle}>{formatDateTime(item.createdAt)}</td>
                      <td style={{ ...cellStyle, textAlign: "center" }}>
                        {item.status === "open" ? (
                          <button className="btn ghost" onClick={() => markDone(item)}>
                            Mark done
                          </button>
                        ) : (
                          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                            Done {formatDateTime(item.doneAt)}
                          </span>
                        )}
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
        <SalesDrawer title="Create Follow-Up" subtitle="Schedule a follow-up" onClose={() => setDrawerOpen(false)}>
          <div className="grid gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-500">Lead ID</label>
              <input
                className="input mt-2"
                value={form.leadId}
                onChange={(event) => setForm((prev) => ({ ...prev, leadId: event.target.value }))}
                placeholder="Lead document ID"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500">Title (optional)</label>
              <input
                className="input mt-2"
                value={form.title}
                onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500">Due date & time</label>
              <input
                className="input mt-2"
                type="datetime-local"
                value={form.dueAt}
                onChange={(event) => setForm((prev) => ({ ...prev, dueAt: event.target.value }))}
              />
            </div>
            <button className="btn" onClick={handleSave} disabled={actionLoading}>
              {actionLoading ? "Saving..." : "Save Follow-Up"}
            </button>
          </div>
        </SalesDrawer>
      )}
    </div>
  );
}
