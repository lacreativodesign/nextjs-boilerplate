'use client';

import { CSSProperties, FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { apiFetch } from '@/lib/api/client';

type TimeEntry = {
  id: string;
  userName: string;
  startAt: string;
  endAt: string | null;
  durationMinutes: number;
  breakMinutes: number;
  billable: boolean;
  projectName: string | null;
  taskName: string | null;
  notes: string | null;
  status: 'running' | 'completed';
};

type Timesheet = {
  id: string;
  userName: string;
  periodStart: string;
  periodEnd: string;
  totalMinutes: number;
  billableMinutes: number;
  nonBillableMinutes: number;
  overtimeMinutes: number;
  status: 'draft' | 'submitted' | 'approved' | 'rejected';
  rejectionReason: string | null;
};

function formatMinutes(totalMinutes: number) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${minutes}m`;
}

function toLocalDateTimeInputValue(date: Date) {
  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

export default function TimeTrackingDashboard({ canApprove }: { canApprove: boolean }) {
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [timesheets, setTimesheets] = useState<Timesheet[]>([]);
  const [loading, setLoading] = useState(true);
  const [runningEntryId, setRunningEntryId] = useState<string | null>(null);
  const [manualStartAt, setManualStartAt] = useState(
    toLocalDateTimeInputValue(new Date(Date.now() - 60 * 60 * 1000)),
  );
  const [manualEndAt, setManualEndAt] = useState(toLocalDateTimeInputValue(new Date()));
  const [manualBreakMinutes, setManualBreakMinutes] = useState('30');
  const [manualProject, setManualProject] = useState('');
  const [manualTask, setManualTask] = useState('');
  const [manualNotes, setManualNotes] = useState('');
  const [manualBillable, setManualBillable] = useState(true);
  const [clockOutBreakMinutes, setClockOutBreakMinutes] = useState('30');
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [entriesRes, sheetsRes] = await Promise.all([
        apiFetch('/api/hr/time-entries'),
        apiFetch('/api/hr/timesheets?mode=list&periodType=weekly'),
      ]);

      const entriesData = await entriesRes.json();
      const sheetsData = await sheetsRes.json();

      if (!entriesData.ok) {
        throw new Error(entriesData.error || 'Failed to load entries');
      }
      if (!sheetsData.ok) {
        throw new Error(sheetsData.error || 'Failed to load timesheets');
      }

      const loadedEntries = entriesData.entries as TimeEntry[];
      setEntries(loadedEntries);
      setTimesheets(sheetsData.timesheets as Timesheet[]);

      const running = loadedEntries.find((entry) => entry.status === 'running');
      setRunningEntryId(running?.id || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load time tracking data');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const dailyTotals = useMemo(() => {
    const map = new Map<string, number>();
    for (const entry of entries) {
      const day = entry.startAt.slice(0, 10);
      map.set(day, (map.get(day) || 0) + entry.durationMinutes);
    }
    return map;
  }, [entries]);

  async function handleClockIn() {
    setError(null);
    const res = await apiFetch('/api/hr/time-entries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source: 'clock',
        startAt: new Date().toISOString(),
        billable: false,
      }),
    });

    const data = await res.json();
    if (!data.ok) {
      setError(data.error || 'Clock-in failed');
      return;
    }

    await reload();
  }

  async function handleClockOut() {
    if (!runningEntryId) return;
    setError(null);
    const res = await apiFetch(`/api/hr/time-entries/${runningEntryId}/clock-out`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ breakMinutes: Number(clockOutBreakMinutes) || 0 }),
    });

    const data = await res.json();
    if (!data.ok) {
      setError(data.error || 'Clock-out failed');
      return;
    }

    await reload();
  }

  async function handleManualEntry(event: FormEvent) {
    event.preventDefault();
    setError(null);

    const res = await apiFetch('/api/hr/time-entries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source: 'manual',
        startAt: new Date(manualStartAt).toISOString(),
        endAt: new Date(manualEndAt).toISOString(),
        breakMinutes: Number(manualBreakMinutes) || 0,
        billable: manualBillable,
        projectName: manualProject || null,
        taskName: manualTask || null,
        notes: manualNotes || null,
      }),
    });

    const data = await res.json();
    if (!data.ok) {
      setError(data.error || 'Failed to save manual entry');
      return;
    }

    setManualNotes('');
    await reload();
  }

  async function handleGenerateWeeklyTimesheet() {
    setError(null);
    const res = await apiFetch('/api/hr/timesheets?periodType=weekly&mode=generate');
    const data = await res.json();
    if (!data.ok) {
      setError(data.error || 'Failed to generate timesheet');
      return;
    }
    await reload();
  }

  async function handleSubmitTimesheet(timesheetId: string) {
    setError(null);
    const res = await apiFetch(`/api/hr/timesheets/${timesheetId}/submit`, { method: 'PUT' });
    const data = await res.json();
    if (!data.ok) {
      setError(data.error || 'Submit failed');
      return;
    }
    await reload();
  }

  async function handleReviewTimesheet(timesheetId: string, approve: boolean) {
    const reason = approve
      ? undefined
      : window.prompt('Rejection reason', 'Missing details') || 'Rejected by manager';
    setError(null);
    const res = await apiFetch(`/api/hr/timesheets/${timesheetId}/approve`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ approve, rejectionReason: reason }),
    });
    const data = await res.json();
    if (!data.ok) {
      setError(data.error || 'Review failed');
      return;
    }
    await reload();
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <h1 style={{ fontSize: 24, fontWeight: 700 }}>Time Tracking & Timesheets</h1>
      {error ? (
        <div
          style={{
            background: 'var(--danger-bg)',
            color: 'var(--alert-error-text)',
            padding: 12,
            borderRadius: 8,
          }}
        >
          {error}
        </div>
      ) : null}

      <section style={cardStyle}>
        <h2 style={titleStyle}>Clock Widget</h2>
        <p>Current status: {runningEntryId ? 'Running' : 'Not clocked in'}</p>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button style={buttonStyle} onClick={handleClockIn} disabled={Boolean(runningEntryId)}>
            Clock In
          </button>
          <button style={buttonStyle} onClick={handleClockOut} disabled={!runningEntryId}>
            Clock Out
          </button>
          <label>
            Break minutes
            <input
              value={clockOutBreakMinutes}
              onChange={(e) => setClockOutBreakMinutes(e.target.value)}
              type="number"
              min={0}
              max={240}
              style={inputStyle}
            />
          </label>
        </div>
      </section>

      <section style={cardStyle}>
        <h2 style={titleStyle}>Manual Time Entry</h2>
        <form
          onSubmit={handleManualEntry}
          style={{
            display: 'grid',
            gap: 10,
            gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))',
          }}
        >
          <label>
            Start
            <input
              type="datetime-local"
              value={manualStartAt}
              onChange={(e) => setManualStartAt(e.target.value)}
              required
              style={inputStyle}
            />
          </label>
          <label>
            End
            <input
              type="datetime-local"
              value={manualEndAt}
              onChange={(e) => setManualEndAt(e.target.value)}
              required
              style={inputStyle}
            />
          </label>
          <label>
            Break minutes
            <input
              type="number"
              min={0}
              max={240}
              value={manualBreakMinutes}
              onChange={(e) => setManualBreakMinutes(e.target.value)}
              style={inputStyle}
            />
          </label>
          <label>
            Project
            <input
              value={manualProject}
              onChange={(e) => setManualProject(e.target.value)}
              style={inputStyle}
            />
          </label>
          <label>
            Task
            <input
              value={manualTask}
              onChange={(e) => setManualTask(e.target.value)}
              style={inputStyle}
            />
          </label>
          <label>
            Notes
            <input
              value={manualNotes}
              onChange={(e) => setManualNotes(e.target.value)}
              style={inputStyle}
            />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="checkbox"
              checked={manualBillable}
              onChange={(e) => setManualBillable(e.target.checked)}
            />
            Billable
          </label>
          <button type="submit" style={buttonStyle}>
            Save manual entry
          </button>
        </form>
      </section>

      <section style={cardStyle}>
        <h2 style={titleStyle}>Weekly Timesheet</h2>
        <button style={buttonStyle} onClick={handleGenerateWeeklyTimesheet}>
          Generate/Refresh Weekly Timesheet
        </button>
        <table style={{ width: '100%', marginTop: 12, borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={thStyle}>Day</th>
              <th style={thStyle}>Total</th>
            </tr>
          </thead>
          <tbody>
            {Array.from(dailyTotals.entries()).map(([day, minutes]) => (
              <tr key={day}>
                <td style={tdStyle}>{day}</td>
                <td style={tdStyle}>{formatMinutes(minutes)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section style={cardStyle}>
        <h2 style={titleStyle}>Time Entry History</h2>
        {loading ? <p>Loading...</p> : null}
        {!loading ? (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={thStyle}>Start</th>
                <th style={thStyle}>End</th>
                <th style={thStyle}>Duration</th>
                <th style={thStyle}>Break</th>
                <th style={thStyle}>Billable</th>
                <th style={thStyle}>Project/Task</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id}>
                  <td style={tdStyle}>{new Date(entry.startAt).toLocaleString()}</td>
                  <td style={tdStyle}>
                    {entry.endAt ? new Date(entry.endAt).toLocaleString() : 'Running'}
                  </td>
                  <td style={tdStyle}>{formatMinutes(entry.durationMinutes)}</td>
                  <td style={tdStyle}>{entry.breakMinutes}m</td>
                  <td style={tdStyle}>{entry.billable ? 'Yes' : 'No'}</td>
                  <td style={tdStyle}>
                    {entry.projectName || '-'} / {entry.taskName || '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </section>

      <section style={cardStyle}>
        <h2 style={titleStyle}>Manager Approval Dashboard</h2>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={thStyle}>Employee</th>
              <th style={thStyle}>Period</th>
              <th style={thStyle}>Totals</th>
              <th style={thStyle}>Overtime</th>
              <th style={thStyle}>Status</th>
              <th style={thStyle}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {timesheets.map((sheet) => (
              <tr key={sheet.id}>
                <td style={tdStyle}>{sheet.userName}</td>
                <td style={tdStyle}>
                  {sheet.periodStart.slice(0, 10)} - {sheet.periodEnd.slice(0, 10)}
                </td>
                <td style={tdStyle}>
                  Total {formatMinutes(sheet.totalMinutes)} / Billable{' '}
                  {formatMinutes(sheet.billableMinutes)}
                </td>
                <td style={tdStyle}>{formatMinutes(sheet.overtimeMinutes)}</td>
                <td style={tdStyle}>{sheet.status}</td>
                <td style={tdStyle}>
                  {sheet.status === 'draft' || sheet.status === 'rejected' ? (
                    <button style={buttonStyle} onClick={() => handleSubmitTimesheet(sheet.id)}>
                      Submit
                    </button>
                  ) : null}
                  {canApprove && sheet.status === 'submitted' ? (
                    <>
                      <button
                        style={{ ...buttonStyle, marginLeft: 8 }}
                        onClick={() => handleReviewTimesheet(sheet.id, true)}
                      >
                        Approve
                      </button>
                      <button
                        style={{ ...buttonStyle, marginLeft: 8, background: 'var(--danger-deep)' }}
                        onClick={() => handleReviewTimesheet(sheet.id, false)}
                      >
                        Reject
                      </button>
                    </>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

const cardStyle: CSSProperties = {
  background: 'var(--surface-card)',
  borderRadius: 10,
  padding: 16,
  border: '1px solid var(--surface-neutral)',
};
const titleStyle: CSSProperties = { fontSize: 18, fontWeight: 700, marginBottom: 10 };
const buttonStyle: CSSProperties = {
  background: 'var(--erp-blue)',
  color: 'var(--text-on-brand)',
  border: 'none',
  borderRadius: 8,
  padding: '8px 12px',
  cursor: 'pointer',
};
const inputStyle: CSSProperties = {
  border: '1px solid var(--border-muted)',
  borderRadius: 8,
  padding: '8px 10px',
  display: 'block',
  marginTop: 4,
  width: '100%',
};
const thStyle: CSSProperties = {
  textAlign: 'left',
  padding: 8,
  borderBottom: '1px solid var(--surface-neutral)',
};
const tdStyle: CSSProperties = {
  textAlign: 'left',
  padding: 8,
  borderBottom: '1px solid var(--border-faint)',
};
