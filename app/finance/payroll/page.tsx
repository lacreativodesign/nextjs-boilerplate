"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import MasterSelect from "@/components/ui/MasterSelect";
import { formatDate, formatDateTime, formatPkr, useIsSystemDark } from "@/components/finance/financeUtils";
import type { PayrollRecord } from "@/lib/finance/types";

const STATUS_OPTIONS = ["", "Draft", "Approved", "Paid"].map((status) => ({
  label: status || "All Statuses",
  value: status,
}));

type SortKey = "userName" | "role" | "month" | "baseSalaryPkr" | "total" | "paidAt" | "status";

type SortDir = "asc" | "desc";

type CurrentUser = { uid: string; role: string; name?: string };

type ErrorState = { title: string; message: string };

export default function FinancePayrollPage() {
  const isDark = useIsSystemDark();
  const [payroll, setPayroll] = useState<PayrollRecord[]>([]);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ErrorState | null>(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [monthFilter, setMonthFilter] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("month");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [selected, setSelected] = useState<PayrollRecord | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [runMonth, setRunMonth] = useState("");

  const loadPayroll = useCallback(async () => {
    try {
      setError(null);
      setLoading(true);
      const res = await fetch("/api/admin/finance/payroll/list", { cache: "no-store", credentials: "include" });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data?.error || "Unable to load payroll.");
      }
      setPayroll(data.payroll || []);
      setCurrentUser(data.currentUser || null);
    } catch (err: any) {
      console.error("Payroll load error", err);
      setError({ title: "Unable to load payroll", message: "Please try again in a moment." });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPayroll();
  }, [loadPayroll]);

  const canUpdate = useMemo(() => {
    const role = (currentUser?.role || "").toLowerCase();
    return role === "finance" || role === "admin" || role === "super_admin";
  }, [currentUser?.role]);

  const filteredPayroll = useMemo(() => {
    return payroll.filter((row) => {
      if (statusFilter && row.status !== statusFilter) return false;
      if (monthFilter && row.month !== monthFilter) return false;
      return true;
    });
  }, [payroll, statusFilter, monthFilter]);

  const sortedPayroll = useMemo(() => {
    const list = [...filteredPayroll];
    list.sort((a, b) => {
      const dir = sortDir === "asc" ? 1 : -1;
      if (sortKey === "baseSalaryPkr") return (a.baseSalaryPkr - b.baseSalaryPkr) * dir;
      if (sortKey === "total") return (getTotal(a) - getTotal(b)) * dir;
      if (sortKey === "paidAt") return String(a.paidAt || "").localeCompare(String(b.paidAt || "")) * dir;
      return String(a[sortKey] || "").localeCompare(String(b[sortKey] || "")) * dir;
    });
    return list;
  }, [filteredPayroll, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const openDrawer = (row: PayrollRecord) => {
    setSelected(row);
    setDrawerOpen(true);
  };

  const closeDrawer = () => {
    setDrawerOpen(false);
    setSelected(null);
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

  const handleAction = async (row: PayrollRecord, action: "approve" | "mark_paid") => {
    try {
      setActionLoading(row.id);
      const res = await fetch("/api/admin/finance/payroll/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ id: row.id, action }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data?.error || "Unable to update payroll.");
      }
      await loadPayroll();
    } catch (err) {
      console.error("Payroll update error", err);
      setError({ title: "Unable to update payroll", message: "Please try again." });
    } finally {
      setActionLoading(null);
    }
  };

  const handleRunPayroll = async () => {
    if (!runMonth) return;
    try {
      setActionLoading("run");
      const res = await fetch("/api/admin/finance/payroll/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ month: runMonth }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data?.error || "Unable to run payroll.");
      }
      await loadPayroll();
    } catch (err) {
      console.error("Payroll run error", err);
      setError({ title: "Unable to run payroll", message: "Please try again." });
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
          <h3 style={{ fontSize: 20, fontWeight: 700 }}>Payroll</h3>
          <p style={{ fontSize: 13, color: "var(--sidebar-text)" }}>PKR salary runs, approvals, and payments.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input className="input" type="month" value={runMonth} onChange={(e) => setRunMonth(e.target.value)} />
          <button
            className="btn"
            onClick={handleRunPayroll}
            disabled={!runMonth || actionLoading === "run"}
            style={{ borderRadius: 999 }}
          >
            {actionLoading === "run" ? "Running" : "Run Payroll"}
          </button>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        <MasterSelect value={statusFilter} onChange={(value) => setStatusFilter(value)} options={STATUS_OPTIONS} />
        <input className="input" type="month" value={monthFilter} onChange={(e) => setMonthFilter(e.target.value)} />
        <button
          type="button"
          className="btn"
          onClick={() => {
            setStatusFilter("");
            setMonthFilter("");
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
                  <button type="button" onClick={() => toggleSort("userName")} style={headerButtonStyle}>
                    Employee {sortKey === "userName" ? (sortDir === "asc" ? "▲" : "▼") : ""}
                  </button>
                </th>
                <th style={{ textAlign: "left", padding: "14px 16px", fontWeight: 700 }}>
                  <button type="button" onClick={() => toggleSort("role")} style={headerButtonStyle}>
                    Role {sortKey === "role" ? (sortDir === "asc" ? "▲" : "▼") : ""}
                  </button>
                </th>
                <th style={{ textAlign: "left", padding: "14px 16px", fontWeight: 700 }}>
                  <button type="button" onClick={() => toggleSort("month")} style={headerButtonStyle}>
                    Month {sortKey === "month" ? (sortDir === "asc" ? "▲" : "▼") : ""}
                  </button>
                </th>
                <th style={{ textAlign: "left", padding: "14px 16px", fontWeight: 700 }}>
                  <button type="button" onClick={() => toggleSort("baseSalaryPkr")} style={headerButtonStyle}>
                    Base Salary (PKR) {sortKey === "baseSalaryPkr" ? (sortDir === "asc" ? "▲" : "▼") : ""}
                  </button>
                </th>
                <th style={{ textAlign: "left", padding: "14px 16px", fontWeight: 700 }}>
                  <button type="button" onClick={() => toggleSort("total")} style={headerButtonStyle}>
                    Total (PKR) {sortKey === "total" ? (sortDir === "asc" ? "▲" : "▼") : ""}
                  </button>
                </th>
                <th style={{ textAlign: "left", padding: "14px 16px", fontWeight: 700 }}>
                  <button type="button" onClick={() => toggleSort("paidAt")} style={headerButtonStyle}>
                    Paid At {sortKey === "paidAt" ? (sortDir === "asc" ? "▲" : "▼") : ""}
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
              {loading ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: "center", padding: 40 }}>
                    Loading payroll…
                  </td>
                </tr>
              ) : sortedPayroll.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: "center", padding: 40 }}>
                    No payroll entries found.
                  </td>
                </tr>
              ) : (
                sortedPayroll.map((row, idx) => {
                  const rowBg = idx % 2 === 0 ? (isDark ? "rgba(255,255,255,0.02)" : "rgba(15,23,42,0.02)") : "transparent";
                  return (
                    <tr key={row.id} style={{ background: rowBg }}>
                      <td style={{ padding: "14px 16px", textAlign: "left" }}>{row.userName}</td>
                      <td style={{ padding: "14px 16px", textAlign: "left" }}>{row.role}</td>
                      <td style={{ padding: "14px 16px", textAlign: "left" }}>{row.month}</td>
                      <td style={{ padding: "14px 16px", textAlign: "center" }}>{formatPkr(row.baseSalaryPkr)}</td>
                      <td style={{ padding: "14px 16px", textAlign: "center" }}>{formatPkr(getTotal(row))}</td>
                      <td style={{ padding: "14px 16px", textAlign: "center" }}>{formatDate(row.paidAt)}</td>
                      <td style={{ padding: "14px 16px", textAlign: "center" }}>{renderStatus(row.status, isDark)}</td>
                      <td style={{ padding: "14px 16px", textAlign: "center" }}>
                        <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
                          <button
                            type="button"
                            className="btn ghost"
                            onClick={() => openDrawer(row)}
                            style={{ padding: "6px 12px", borderRadius: 999, fontSize: 12 }}
                          >
                            View
                          </button>
                          {canUpdate && row.status === "Draft" && (
                            <button
                              type="button"
                              className="btn"
                              onClick={() => handleAction(row, "approve")}
                              disabled={actionLoading === row.id}
                              style={{ padding: "6px 12px", borderRadius: 999, fontSize: 12 }}
                            >
                              {actionLoading === row.id ? "Updating" : "Approve"}
                            </button>
                          )}
                          {canUpdate && row.status !== "Paid" && (
                            <button
                              type="button"
                              className="btn"
                              onClick={() => handleAction(row, "mark_paid")}
                              disabled={actionLoading === row.id}
                              style={{ padding: "6px 12px", borderRadius: 999, fontSize: 12 }}
                            >
                              {actionLoading === row.id ? "Updating" : "Mark Paid"}
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

      {drawerOpen && selected && (
        <PayrollDrawer
          row={selected}
          isDark={isDark}
          canUpdate={canUpdate}
          onClose={closeDrawer}
          onAction={handleAction}
          actionLoading={actionLoading === selected.id}
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

function getTotal(row: PayrollRecord) {
  return Number(row.baseSalaryPkr || 0) + Number(row.commissionPkr || 0);
}

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

function PayrollDrawer({
  row,
  isDark,
  canUpdate,
  onClose,
  onAction,
  actionLoading,
}: {
  row: PayrollRecord;
  isDark: boolean;
  canUpdate: boolean;
  onClose: () => void;
  onAction: (row: PayrollRecord, action: "approve" | "mark_paid") => void;
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
            <div style={{ fontSize: 20, fontWeight: 800 }}>{row.userName}</div>
            <div style={{ opacity: 0.7, fontSize: 12 }}>
              {row.month} · {row.role}
            </div>
          </div>
          <button className="btn ghost" onClick={onClose} style={{ height: 34, borderRadius: 999 }}>
            Close
          </button>
        </div>

        <div style={{ height: 16 }} />

        <div className="card" style={{ padding: 16, borderRadius: 14 }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Payroll Summary</div>
          <div style={{ display: "grid", gap: 8, fontSize: 14 }}>
            <Row label="Status" value={row.status} />
            <Row label="Base Salary" value={formatPkr(row.baseSalaryPkr)} />
            <Row label="Commission" value={formatPkr(row.commissionPkr || 0)} />
            <Row label="Total" value={formatPkr(getTotal(row))} />
            <Row label="Paid At" value={formatDateTime(row.paidAt)} />
          </div>
        </div>

        <div style={{ height: 18 }} />
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {canUpdate && row.status === "Draft" && (
            <button
              className="btn"
              onClick={() => onAction(row, "approve")}
              disabled={actionLoading}
              style={{ borderRadius: 999 }}
            >
              {actionLoading ? "Updating" : "Approve"}
            </button>
          )}
          {canUpdate && row.status !== "Paid" && (
            <button
              className="btn"
              onClick={() => onAction(row, "mark_paid")}
              disabled={actionLoading}
              style={{ borderRadius: 999 }}
            >
              {actionLoading ? "Updating" : "Mark Paid"}
            </button>
          )}
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
