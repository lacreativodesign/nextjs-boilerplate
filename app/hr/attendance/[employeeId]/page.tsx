'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import dayjs from 'dayjs';

/**
 * S12: one summarised record per day, as /api/hr/attendance/employee returns it. This
 * page used to receive a stream of { type: 'login' | 'logout' } events and pair them up
 * here — a shape the S11 writer does not produce — so every day would have read Absent
 * even once real attendance was being recorded.
 */
type DaySummary = {
  date: string;
  firstLoginAt: string | null;
  lastLogoutAt: string | null;
  loginCount: number;
  hours: number | null;
};

type Employee = {
  id: string;
  name: string;
  email?: string;
  role?: string;
};

export const dynamic = 'force-dynamic';

export default function EmployeeAttendanceDetail() {
  const params = useParams() as { employeeId: string };
  const router = useRouter();
  const [month, setMonth] = useState(dayjs());
  const [days, setDays] = useState<Record<string, DaySummary>>({});
  const [summary, setSummary] = useState({ daysPresent: 0, totalHours: 0 });
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [loading, setLoading] = useState(true);

  const start = month.startOf('month');
  const end = month.endOf('month');
  const daysInMonth = end.date();

  useEffect(() => {
    if (!params.employeeId) return;
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month, params.employeeId]);

  async function fetchData() {
    try {
      setLoading(true);
      const res = await fetch(
        `/api/hr/attendance/employee?userId=${params.employeeId}&month=${month.format('YYYY-MM')}`,
      );
      const data = await res.json();

      if (data.success) {
        setDays(data.days || {});
        setSummary(data.summary || { daysPresent: 0, totalHours: 0 });
        setEmployee(data.employee || null);
      }
    } catch (err) {
      console.error('Employee attendance load error:', err);
    } finally {
      setLoading(false);
    }
  }

  function computeDayInfo(day: number): DaySummary | null {
    return days[month.date(day).format('YYYY-MM-DD')] || null;
  }
  if (loading) {
    return (
      <div className="space-y-6">
        <p>Loading...</p>
      </div>
    );
  }

  if (!employee) {
    return (
      <div className="space-y-6">
        <p>Employee not found.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Employee Attendance</h1>
        <p className="page-subtitle mt-2">Daily attendance record for this employee.</p>
      </div>

      {/* TOP BAR */}
      <div
        style={{
          marginBottom: 20,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 16,
        }}
      >
        <button
          onClick={() => router.push('/hr/attendance')}
          style={{
            padding: '8px 14px',
            borderRadius: 8,
            border: '1px solid var(--border-subtle)',
            background: 'var(--surface-card)',
            cursor: 'pointer',
            fontSize: 13,
            color: 'var(--text-primary)',
          }}
        >
          ← Back to Attendance
        </button>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
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

      {/* EMPLOYEE CARD */}
      <div
        style={{
          marginBottom: 24,
          padding: 20,
          borderRadius: 12,
          border: '1px solid var(--border-subtle)',
          background: 'var(--surface-card)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 16,
        }}
      >
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>{employee.name}</h2>
          {employee.email && (
            <p style={{ fontSize: 14, color: 'var(--text-muted)' }}>{employee.email}</p>
          )}
          {employee.role && (
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
              Role: {employee.role}
            </p>
          )}
        </div>

        <div
          style={{
            display: 'flex',
            gap: 16,
            alignItems: 'center',
            flexWrap: 'wrap',
          }}
        >
          <div style={statCard}>
            <span style={statLabel}>Month</span>
            <span style={statValue}>{month.format('MMMM YYYY')}</span>
          </div>
          <div style={statCard}>
            <span style={statLabel}>Days Present</span>
            <span style={statValue}>{summary.daysPresent}</span>
          </div>
          <div style={statCard}>
            <span style={statLabel}>Total Hours</span>
            <span style={statValue}>{summary.totalHours.toFixed(1)}</span>
          </div>
        </div>
      </div>

      {/* DAILY TABLE */}
      <div
        style={{
          borderRadius: 12,
          border: '1px solid var(--border-subtle)',
          background: 'var(--surface-card)',
          overflow: 'hidden',
        }}
      >
        <div className="overflow-x-auto">
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead style={{ background: 'var(--surface-muted)' }}>
              <tr>
                <th style={th}>Date</th>
                <th style={th}>Day</th>
                <th style={th}>Status</th>
                <th style={th}>First Login</th>
                <th style={th}>Last Logout</th>
                <th style={th}>Hours</th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: daysInMonth }).map((_, index) => {
                const day = index + 1;
                const dateObj = month.date(day);
                const info = computeDayInfo(day);

                const isWeekend = dateObj.day() === 0 || dateObj.day() === 6; // Sun / Sat

                let status = 'Absent';
                let badgeBg = 'rgba(239,68,68,0.12)';
                let badgeColor = 'var(--danger)';

                if (isWeekend) {
                  status = 'Weekend';
                  badgeBg = 'var(--surface-muted)';
                  badgeColor = 'var(--text-muted)';
                }

                // Present is a recorded sign-in. Hours only exist once a sign-out has
                // closed the day, so someone still working reads as present.
                if (info?.firstLoginAt) {
                  status = 'Present';
                  badgeBg = 'rgba(34,197,94,0.12)';
                  badgeColor = 'var(--success)';
                }

                const rowBg = index % 2 === 0 ? 'var(--surface-card)' : 'var(--surface-muted)';

                return (
                  <tr key={day} style={{ background: rowBg }}>
                    <td style={td}>{dateObj.format('YYYY-MM-DD')}</td>
                    <td style={td}>{dateObj.format('ddd')}</td>
                    <td style={td}>
                      <span
                        style={{
                          padding: '2px 8px',
                          borderRadius: 999,
                          fontSize: 12,
                          background: badgeBg,
                          color: badgeColor,
                          fontWeight: 500,
                        }}
                      >
                        {status}
                      </span>
                    </td>
                    <td style={td}>
                      {info?.firstLoginAt ? dayjs(info.firstLoginAt).format('HH:mm') : '-'}
                    </td>
                    <td style={td}>
                      {info?.lastLogoutAt ? dayjs(info.lastLogoutAt).format('HH:mm') : '-'}
                    </td>
                    <td style={td}>{info?.hours != null ? info.hours.toFixed(2) : '-'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

const btn = {
  padding: '8px 14px',
  background: 'var(--erp-blue)',
  color: 'var(--text-on-brand)',
  border: 'none',
  borderRadius: 8,
  cursor: 'pointer',
  fontSize: 13,
};

const th: React.CSSProperties = {
  padding: 10,
  fontSize: 12,
  fontWeight: 600,
  borderBottom: '1px solid var(--border-subtle)',
  color: 'var(--text-muted)',
  textAlign: 'left',
  whiteSpace: 'nowrap',
};

const td: React.CSSProperties = {
  padding: 10,
  fontSize: 13,
  borderBottom: '1px solid var(--border-subtle)',
  color: 'var(--text-primary)',
  whiteSpace: 'nowrap',
};

const statCard: React.CSSProperties = {
  padding: '8px 14px',
  borderRadius: 10,
  background: 'var(--surface-muted)',
  border: '1px solid var(--border-subtle)',
  minWidth: 110,
};

const statLabel: React.CSSProperties = {
  fontSize: 11,
  textTransform: 'uppercase',
  letterSpacing: 0.5,
  color: 'var(--text-muted)',
};

const statValue: React.CSSProperties = {
  fontSize: 16,
  fontWeight: 700,
  color: 'var(--text-primary)',
};
