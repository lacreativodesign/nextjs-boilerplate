'use client';

import { useEffect, useState } from 'react';
import dayjs from 'dayjs';

type PayrollRow = {
  id: string;
  name: string;
  email?: string;
  role?: string;
  hourlyRate: number;
  hours: number;
  salary: number;
};

export const dynamic = 'force-dynamic';

export default function PayrollSummary() {
  const [month, setMonth] = useState(dayjs());
  const [rows, setRows] = useState<PayrollRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPayroll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month]);

  async function loadPayroll() {
    try {
      setLoading(true);
      const res = await fetch(`/api/finance/payroll/list?month=${month.format('YYYY-MM')}`, {
        credentials: 'include',
      });
      const data = await res.json();

      if (data.success) {
        setRows(data.rows);
      }
    } catch (err) {
      console.error('Payroll fetch error:', err);
    } finally {
      setLoading(false);
    }
  }

  const th: React.CSSProperties = {
    padding: 12,
    fontSize: 13,
    fontWeight: 700,
    borderBottom: '1px solid var(--border-subtle)',
    textAlign: 'left',
  };

  const td: React.CSSProperties = {
    padding: 12,
    fontSize: 14,
    borderBottom: '1px solid var(--border-subtle)',
  };

  return (
    <div className="space-y-6">
      {/* TOP BAR */}
      <div style={{ marginBottom: 20, display: 'flex', justifyContent: 'space-between' }}>
        <h2 style={{ fontSize: 24, fontWeight: 600 }}>Payroll — {month.format('MMMM YYYY')}</h2>

        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => setMonth(month.subtract(1, 'month'))} className="btn">
            Prev
          </button>
          <button onClick={() => setMonth(dayjs())} className="btn">
            Current
          </button>
          <button onClick={() => setMonth(month.add(1, 'month'))} className="btn">
            Next
          </button>
        </div>
      </div>

      {/* TABLE */}
      <div
        className="w-full overflow-x-auto"
        style={{
          borderRadius: 12,
          border: '1px solid var(--border-subtle)',
          background: 'var(--surface-card)',
        }}
      >
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead style={{ background: 'var(--surface-muted)' }}>
            <tr>
              <th style={th}>Employee</th>
              <th style={th}>Email</th>
              <th style={th}>Role</th>
              <th style={th}>Hourly Rate</th>
              <th style={th}>Hours</th>
              <th style={th}>Total Salary</th>
            </tr>
          </thead>

          <tbody>
            {rows.length === 0 && (
              <tr>
                <td style={td} colSpan={6}>
                  No attendance found for this month.
                </td>
              </tr>
            )}

            {rows.map((r) => (
              <tr
                key={r.id}
                style={{ cursor: 'pointer' }}
                onClick={() => (window.location.href = `/hr/attendance/${r.id}`)}
              >
                <td style={td}>{r.name}</td>
                <td style={td}>{r.email || '-'}</td>
                <td style={td}>{r.role || '-'}</td>
                <td style={td}>${r.hourlyRate}</td>
                <td style={td}>{r.hours}</td>
                <td style={td}>= ${r.salary.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
