"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

type LeaveTypeCode = "vacation" | "sick" | "personal" | "unpaid" | "bereavement";
type LeaveStatus = "pending" | "approved" | "rejected" | "cancelled";

type LeaveBalance = {
  id: string;
  leaveType: LeaveTypeCode;
  accruedHours: number;
  usedHours: number;
  pendingHours: number;
  availableHours: number;
  carryOverHours: number;
};

type LeaveRequest = {
  id: string;
  employeeId: string;
  employeeName: string;
  leaveType: LeaveTypeCode;
  startDate: string;
  endDate: string;
  totalDays: number;
  totalHours: number;
  reason: string | null;
  status: LeaveStatus;
  rejectionReason: string | null;
  reviewerName: string | null;
};

const leaveTypeLabels: Record<LeaveTypeCode, string> = {
  vacation: "Vacation",
  sick: "Sick",
  personal: "Personal",
  unpaid: "Unpaid",
  bereavement: "Bereavement",
};

const cardStyle: React.CSSProperties = {
  border: "1px solid var(--border-subtle)",
  borderRadius: 12,
  padding: 16,
  background: "var(--surface-card)",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  border: "1px solid var(--border-subtle)",
  borderRadius: 8,
  padding: "8px 10px",
  marginTop: 6,
  background: "var(--surface-input)",
  color: "var(--text-primary)",
};

function dateOnly(input: string) {
  return input.slice(0, 10);
}

function buildMonthCells(date: Date) {
  const first = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  const start = new Date(first);
  start.setUTCDate(first.getUTCDate() - ((first.getUTCDay() + 6) % 7));

  const cells: Date[] = [];
  for (let i = 0; i < 42; i += 1) {
    const d = new Date(start);
    d.setUTCDate(start.getUTCDate() + i);
    cells.push(d);
  }
  return cells;
}

export default function LeaveManagementDashboard({ canApprove }: { canApprove: boolean }) {
  const [balances, setBalances] = useState<LeaveBalance[]>([]);
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [leaveType, setLeaveType] = useState<LeaveTypeCode>("vacation");
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(new Date().toISOString().slice(0, 10));
  const [reason, setReason] = useState("");

  const [calendarMonth, setCalendarMonth] = useState(new Date());

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [balanceRes, requestRes] = await Promise.all([fetch("/api/hr/leave/balance"), fetch("/api/hr/leave/requests")]);
      const balanceData = await balanceRes.json();
      const requestData = await requestRes.json();

      if (!balanceData.ok) throw new Error(balanceData.error || "Failed to load balances");
      if (!requestData.ok) throw new Error(requestData.error || "Failed to load requests");

      setBalances(balanceData.balances || []);
      setRequests(requestData.requests || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load leave data");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const approvedRequests = useMemo(() => requests.filter((req) => req.status === "approved"), [requests]);
  const pendingQueue = useMemo(() => requests.filter((req) => req.status === "pending"), [requests]);

  const monthCells = useMemo(() => buildMonthCells(calendarMonth), [calendarMonth]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    const response = await fetch("/api/hr/leave/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        leaveType,
        startDate: new Date(`${startDate}T00:00:00.000Z`).toISOString(),
        endDate: new Date(`${endDate}T00:00:00.000Z`).toISOString(),
        reason: reason || null,
      }),
    });

    const data = await response.json();
    if (!data.ok) {
      setError(data.error || "Unable to submit leave request");
      return;
    }

    setReason("");
    await loadData();
  }

  async function handleApprove(id: string) {
    setError(null);
    const response = await fetch(`/api/hr/leave/requests/${id}/approve`, { method: "PUT" });
    const data = await response.json();
    if (!data.ok) {
      setError(data.error || "Unable to approve leave request");
      return;
    }
    await loadData();
  }

  async function handleReject(id: string) {
    const rejectionReason = window.prompt("Rejection reason", "Insufficient staffing coverage");
    if (!rejectionReason) return;

    setError(null);
    const response = await fetch(`/api/hr/leave/requests/${id}/reject`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: rejectionReason }),
    });
    const data = await response.json();
    if (!data.ok) {
      setError(data.error || "Unable to reject leave request");
      return;
    }
    await loadData();
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <h1 style={{ fontSize: 24, fontWeight: 700 }}>Leave Management</h1>
      {error ? <div style={{ background: "var(--status-error-bg, #fee2e2)", color: "var(--status-error-text, #7f1d1d)", padding: 12, borderRadius: 8 }}>{error}</div> : null}

      <section style={cardStyle}>
        <h2 style={{ margin: 0, marginBottom: 12 }}>Leave Request Form</h2>
        <form onSubmit={handleSubmit} style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))" }}>
          <label>
            Leave Type
            <select value={leaveType} onChange={(e) => setLeaveType(e.target.value as LeaveTypeCode)} style={inputStyle}>
              {Object.entries(leaveTypeLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Start Date
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={inputStyle} required />
          </label>
          <label>
            End Date
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} style={inputStyle} required />
          </label>
          <label style={{ gridColumn: "1 / -1" }}>
            Reason
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} style={{ ...inputStyle, minHeight: 80 }} />
          </label>
          <button type="submit" style={{ ...inputStyle, cursor: "pointer", background: "var(--surface-inverse)", color: "var(--text-on-inverse, #fff)", maxWidth: 220 }}>
            Submit Request
          </button>
        </form>
      </section>

      <section style={cardStyle}>
        <h2 style={{ marginTop: 0 }}>Leave Balance Dashboard</h2>
        {loading ? (
          <p>Loading balances...</p>
        ) : (
          <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))" }}>
            {balances.map((balance) => (
              <div key={balance.id} style={{ border: "1px solid var(--border-subtle)", borderRadius: 8, padding: 10 }}>
                <strong>{leaveTypeLabels[balance.leaveType]}</strong>
                <div>Available: {balance.availableHours}h</div>
                <div>Accrued: {balance.accruedHours}h</div>
                <div>Used: {balance.usedHours}h</div>
                <div>Pending: {balance.pendingHours}h</div>
                <div>Carry-over: {balance.carryOverHours}h</div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section style={cardStyle}>
        <h2 style={{ marginTop: 0 }}>Team Leave Calendar</h2>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
          <button onClick={() => setCalendarMonth(new Date(Date.UTC(calendarMonth.getUTCFullYear(), calendarMonth.getUTCMonth() - 1, 1)))} style={{ cursor: "pointer" }}>
            Previous
          </button>
          <strong>
            {calendarMonth.toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" })}
          </strong>
          <button onClick={() => setCalendarMonth(new Date(Date.UTC(calendarMonth.getUTCFullYear(), calendarMonth.getUTCMonth() + 1, 1)))} style={{ cursor: "pointer" }}>
            Next
          </button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7,minmax(0,1fr))", gap: 6 }}>
          {monthCells.map((day) => {
            const iso = day.toISOString().slice(0, 10);
            const entries = approvedRequests.filter((req) => iso >= dateOnly(req.startDate) && iso <= dateOnly(req.endDate));
            const isCurrentMonth = day.getUTCMonth() === calendarMonth.getUTCMonth();

            return (
              <div key={iso} style={{ border: "1px solid var(--border-subtle)", borderRadius: 8, minHeight: 90, padding: 6, background: isCurrentMonth ? "var(--surface-card)" : "var(--surface-muted)" }}>
                <div style={{ fontSize: 12, marginBottom: 4 }}>{day.getUTCDate()}</div>
                {entries.slice(0, 2).map((entry) => (
                  <div key={entry.id} style={{ fontSize: 11, borderRadius: 6, padding: "2px 6px", background: "var(--status-info-bg, #dbeafe)", marginBottom: 3 }}>
                    {entry.employeeName} · {leaveTypeLabels[entry.leaveType]}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </section>

      <section style={cardStyle}>
        <h2 style={{ marginTop: 0 }}>Manager Approval Queue</h2>
        {pendingQueue.length === 0 ? (
          <p>No pending requests.</p>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {pendingQueue.map((req) => (
              <div key={req.id} style={{ border: "1px solid var(--border-subtle)", borderRadius: 8, padding: 10 }}>
                <div>
                  <strong>{req.employeeName}</strong> requested {req.totalDays} day(s) ({leaveTypeLabels[req.leaveType]})
                </div>
                <div>
                  {dateOnly(req.startDate)} → {dateOnly(req.endDate)}
                </div>
                {canApprove ? (
                  <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                    <button onClick={() => handleApprove(req.id)} style={{ cursor: "pointer" }}>
                      Approve
                    </button>
                    <button onClick={() => handleReject(req.id)} style={{ cursor: "pointer" }}>
                      Reject
                    </button>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </section>

      <section style={cardStyle}>
        <h2 style={{ marginTop: 0 }}>Leave History</h2>
        <div style={{ display: "grid", gap: 8 }}>
          {requests.map((req) => (
            <div key={req.id} style={{ border: "1px solid var(--border-subtle)", borderRadius: 8, padding: 10 }}>
              <div>
                <strong>{req.employeeName}</strong> · {leaveTypeLabels[req.leaveType]} · {req.status}
              </div>
              <div>
                {dateOnly(req.startDate)} → {dateOnly(req.endDate)} ({req.totalHours}h)
              </div>
              {req.rejectionReason ? <div style={{ color: "var(--status-error-text, #7f1d1d)" }}>Reason: {req.rejectionReason}</div> : null}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
