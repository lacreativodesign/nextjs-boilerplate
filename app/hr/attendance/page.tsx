'use client';

import { useEffect, useState } from 'react';
import dayjs from 'dayjs';

type DaySummary = {
  date: string;
  firstLoginAt: string | null;
  lastLogoutAt: string | null;
  loginCount: number;
  hours: number | null;
};

/** userId -> date -> summary, exactly as /api/hr/attendance returns it. */
type AttendanceByUser = Record<string, Record<string, DaySummary>>;

type RosterMember = { id: string; name: string; role?: string; department?: string };

/**
 * S12: the API returns one summarised record per person per day. This page used to
 * receive a stream of { type: 'login' | 'logout' } events and pair them up here — a shape
 * the S11 writer does not produce — so the grid would have stayed blank even once real
 * attendance was being recorded. The arithmetic now lives server-side in
 * lib/attendance/query, and this is a lookup.
 */
export default function AttendanceDashboard() {
  const [days, setDays] = useState<AttendanceByUser>({});
  const [loading, setLoading] = useState(true);
  const [month, setMonth] = useState(dayjs());
  const [employees, setEmployees] = useState<RosterMember[]>([]);

  const start = month.startOf('month');
  const end = month.endOf('month');
  const daysInMonth = end.date();

  useEffect(() => {
    fetchData();
  }, [month]);

  async function fetchData() {
    setLoading(true);
    try {
      const res = await fetch(`/api/hr/attendance?month=${month.format('YYYY-MM')}`);
      const data = await res.json();

      if (data.success) {
        setDays(data.days || {});
        setEmployees(data.employees || []);
      }
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }

  function getDayAttendance(empId: string, day: number): DaySummary | null {
    return days[empId]?.[month.date(day).format('YYYY-MM-DD')] || null;
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <p>Loading...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* HEADER */}
      <div
        style={{
          marginBottom: 30,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: 'var(--surface-card)',
          padding: 20,
          borderRadius: 10,
          border: '1px solid var(--border-subtle)',
        }}
      >
        <h2 style={{ fontSize: 24, fontWeight: 700 }}>Attendance — {month.format('MMMM YYYY')}</h2>

        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => setMonth(month.subtract(1, 'month'))} style={btn}>
            Prev
          </button>
          <button onClick={() => setMonth(dayjs())} style={btn}>
            Today
          </button>
          <button onClick={() => setMonth(month.add(1, 'month'))} style={btn}>
            Next
          </button>
        </div>
      </div>

      {/* TABLE */}
      <div
        className="w-full overflow-x-auto rounded-xl"
        style={{ border: '1px solid var(--border-subtle)', background: 'var(--surface-card)' }}
      >
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead style={{ background: 'var(--surface-muted)' }}>
            <tr>
              <th style={th}>Employee</th>
              {Array.from({ length: daysInMonth }).map((_, i) => (
                <th key={i} style={th}>
                  {i + 1}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {employees.map((emp) => (
              <tr key={emp.id}>
                <td style={tdLabel}>{emp.name}</td>

                {Array.from({ length: daysInMonth }).map((_, dayIndex) => {
                  const info = getDayAttendance(emp.id, dayIndex + 1);
                  const isWeekend =
                    month.date(dayIndex + 1).day() === 0 || month.date(dayIndex + 1).day() === 6;

                  let bg = 'var(--surface-card)';
                  let text = 'var(--text-primary)';

                  if (isWeekend) {
                    bg = 'var(--surface-muted)';
                  }

                  // Present is a recorded sign-in. Hours only exist once a sign-out has
                  // closed the day, so someone still working shows as present with a dot
                  // rather than vanishing from the grid.
                  if (info?.firstLoginAt) {
                    bg = 'var(--status-success-bg)';
                    text = 'var(--status-success-text)';
                  }

                  return (
                    <td key={dayIndex} style={{ ...td, background: bg, color: text }}>
                      {info?.hours != null ? info.hours.toFixed(1) : info?.firstLoginAt ? '•' : ''}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const btn = {
  padding: '8px 16px',
  background: 'var(--erp-blue)',
  color: 'var(--text-on-brand)',
  border: 'none',
  borderRadius: 8,
  cursor: 'pointer',
};

const th = {
  padding: 10,
  fontSize: 13,
  minWidth: '80px',
  fontWeight: 600,
  borderBottom: '1px solid var(--border-subtle)',
  whiteSpace: 'nowrap' as const,
};

const td = {
  padding: 10,
  fontSize: 13,
  textAlign: 'center' as const,
  borderBottom: '1px solid var(--border-subtle)',
};

const tdLabel = {
  padding: 10,
  fontSize: 14,
  fontWeight: 600,
  borderBottom: '1px solid var(--border-subtle)',
  whiteSpace: 'nowrap' as const,
};
