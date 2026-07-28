'use client';

import { useMemo, useState } from 'react';
import { toastError, toastWarning } from '@/lib/toast';
import { Download, FileText } from 'lucide-react';
import dynamic from 'next/dynamic';

// QUAL-07: load the recharts-based chart lazily so recharts is not in the route's initial bundle.
const ExpenseBreakdownChart = dynamic(() => import('@/components/finance/ExpenseBreakdownChart'), {
  ssr: false,
  loading: () => <div style={{ height: 300 }} />,
});
import { exportProfitLossToPDF } from '@/lib/exports/pdfExport';
import type { ProfitLossReport } from '@/lib/reports/profitLoss';

const REPORTS = [
  {
    title: 'Revenue by Client (USD)',
    description: 'Total paid invoice revenue grouped by client.',
    endpoint: '/api/admin/finance/reports/revenue-by-client',
    filename: 'finance-revenue-by-client.csv',
  },
  {
    title: 'Payments by Month (USD)',
    description: 'Paid payments aggregated by month.',
    endpoint: '/api/admin/finance/reports/payments-by-month',
    filename: 'finance-payments-by-month.csv',
  },
  {
    title: 'Outstanding AR (USD)',
    description: 'Unpaid invoices with due dates and amounts.',
    endpoint: '/api/admin/finance/reports/outstanding-ar',
    filename: 'finance-outstanding-ar.csv',
  },
  {
    title: 'Payroll Totals by Month (PKR)',
    description: 'Monthly payroll totals including commissions.',
    endpoint: '/api/admin/finance/reports/payroll-by-month',
    filename: 'finance-payroll-by-month.csv',
  },
  {
    title: 'Expenses by Category (PKR)',
    description: 'Operating expenses grouped by category.',
    endpoint: '/api/admin/finance/reports/expenses-by-category',
    filename: 'finance-expenses-by-category.csv',
  },
];

function formatCurrency(amount: number) {
  return `$${amount.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function toIsoDateInput(value: Date) {
  return value.toISOString().split('T')[0];
}

export default function FinanceReportsPage() {
  const defaultStart = useMemo(() => toIsoDateInput(new Date(new Date().getFullYear(), 0, 1)), []);
  const defaultEnd = useMemo(() => toIsoDateInput(new Date()), []);

  const [startDate, setStartDate] = useState(defaultStart);
  const [endDate, setEndDate] = useState(defaultEnd);
  const [reportType, setReportType] = useState<'profit-loss' | 'balance-sheet' | 'cash-flow'>(
    'profit-loss',
  );
  const [profitLossReport, setProfitLossReport] = useState<ProfitLossReport | null>(null);
  const [loading, setLoading] = useState(false);

  const handleDownload = (endpoint: string) => {
    const url = new URL(endpoint, window.location.origin);
    if (startDate) {
      url.searchParams.set('startDate', startDate);
    }
    if (endDate) {
      url.searchParams.set('endDate', endDate);
    }
    window.open(url.toString(), '_blank');
  };

  const generateReport = async () => {
    if (reportType !== 'profit-loss') {
      toastWarning('Balance Sheet and Cash Flow reports are scheduled next.');
      return;
    }

    setLoading(true);
    try {
      const params = new URLSearchParams({ startDate, endDate });
      const response = await fetch(`/api/admin/finance/reports/profit-loss?${params.toString()}`, {
        method: 'GET',
        cache: 'no-store',
      });

      const payload = await response.json();
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error || 'Failed to generate report');
      }

      setProfitLossReport(payload.report as ProfitLossReport);
    } catch (error) {
      console.error('Error generating Profit & Loss:', error);
      toastError(error instanceof Error ? error.message : 'Failed to generate report');
    } finally {
      setLoading(false);
    }
  };

  const exportToPDF = async () => {
    if (!profitLossReport) {
      return;
    }
    await exportProfitLossToPDF(profitLossReport, { name: 'Bizosto' });
  };

  const exportToExcel = () => {
    if (!profitLossReport) {
      return;
    }

    const rows: string[][] = [
      ['Period Start', profitLossReport.period.start],
      ['Period End', profitLossReport.period.end],
      [],
      ['Revenue Category', 'Amount'],
      ...profitLossReport.revenue.breakdown.map((item) => [item.category, item.amount.toString()]),
      ['Total Revenue', profitLossReport.revenue.total.toString()],
      [],
      ['Expense Category', 'Amount'],
      ...profitLossReport.expenses.breakdown.map((item) => [item.category, item.amount.toString()]),
      ['Total Expenses', profitLossReport.expenses.total.toString()],
      [],
      ['Net Income', profitLossReport.netIncome.toString()],
      ['Net Margin %', profitLossReport.netMargin.toFixed(2)],
    ];

    const csv = rows
      .map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `Profit-Loss-${toIsoDateInput(new Date())}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(link.href);
  };

  return (
    <div>
      <div>
        <h3 style={{ fontSize: 20, fontWeight: 700 }}>Reports</h3>
        <p style={{ fontSize: 13, color: 'var(--sidebar-text)' }}>
          Generate period-based financial reporting and export documents for leadership reviews.
        </p>
      </div>

      <div className="card mt-4" style={{ padding: 18, borderRadius: 16 }}>
        <div style={{ fontWeight: 700, marginBottom: 10 }}>Enhanced Financial Reports</div>
        <div className="grid gap-3 md:grid-cols-4">
          <label style={{ fontSize: 13 }}>
            <span style={{ display: 'block', marginBottom: 6 }}>Report Type</span>
            <select
              className="input"
              value={reportType}
              onChange={(event) =>
                setReportType(event.target.value as 'profit-loss' | 'balance-sheet' | 'cash-flow')
              }
            >
              <option value="profit-loss">Profit &amp; Loss</option>
              <option value="balance-sheet">Balance Sheet</option>
              <option value="cash-flow">Cash Flow</option>
            </select>
          </label>

          <label style={{ fontSize: 13 }}>
            <span style={{ display: 'block', marginBottom: 6 }}>Start Date</span>
            <input
              className="input"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </label>

          <label style={{ fontSize: 13 }}>
            <span style={{ display: 'block', marginBottom: 6 }}>End Date</span>
            <input
              className="input"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </label>

          <div style={{ display: 'flex', alignItems: 'end' }}>
            <button
              className="btn"
              onClick={generateReport}
              disabled={loading}
              style={{ borderRadius: 10, width: '100%' }}
            >
              {loading ? 'Generating...' : 'Generate Report'}
            </button>
          </div>
        </div>

        {profitLossReport ? (
          <>
            <div style={{ marginTop: 14, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button
                className="btn"
                onClick={exportToPDF}
                style={{ borderRadius: 10, display: 'inline-flex', gap: 6 }}
              >
                <FileText size={16} /> Export PDF
              </button>
              <button
                className="btn"
                onClick={exportToExcel}
                style={{ borderRadius: 10, display: 'inline-flex', gap: 6 }}
              >
                <Download size={16} /> Export Excel
              </button>
            </div>

            <div className="grid gap-4 md:grid-cols-2" style={{ marginTop: 16 }}>
              <div className="card" style={{ padding: 16, borderRadius: 16 }}>
                <div style={{ fontWeight: 700, fontSize: 16 }}>Profit &amp; Loss Statement</div>
                <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>
                  {new Date(profitLossReport.period.start).toLocaleDateString()} -{' '}
                  {new Date(profitLossReport.period.end).toLocaleDateString()}
                </div>

                <div style={{ marginTop: 14 }}>
                  <div
                    style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}
                  >
                    <span>Revenue</span>
                    <span style={{ color: 'var(--color-green)' }}>
                      {formatCurrency(profitLossReport.revenue.total)}
                    </span>
                  </div>
                </div>

                <div style={{ marginTop: 14, borderTop: '1px solid var(--line)', paddingTop: 12 }}>
                  <div
                    style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}
                  >
                    <span>Expenses</span>
                    <span style={{ color: 'var(--danger-strong)' }}>
                      {formatCurrency(profitLossReport.expenses.total)}
                    </span>
                  </div>

                  <div style={{ marginTop: 8, display: 'grid', gap: 6 }}>
                    {profitLossReport.expenses.breakdown.map((expense) => (
                      <div
                        key={expense.category}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          fontSize: 13,
                          opacity: 0.8,
                        }}
                      >
                        <span>{expense.category}</span>
                        <span>{formatCurrency(expense.amount)}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div style={{ marginTop: 14, borderTop: '1px solid var(--line)', paddingTop: 12 }}>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontWeight: 800,
                      fontSize: 18,
                    }}
                  >
                    <span>Net Income</span>
                    <span
                      style={{
                        color:
                          profitLossReport.netIncome >= 0
                            ? 'var(--color-green)'
                            : 'var(--danger-strong)',
                      }}
                    >
                      {formatCurrency(profitLossReport.netIncome)}
                    </span>
                  </div>
                  <div style={{ textAlign: 'right', fontSize: 12, opacity: 0.7 }}>
                    Net Margin: {profitLossReport.netMargin.toFixed(2)}%
                  </div>
                </div>
              </div>

              <div className="card" style={{ padding: 16, borderRadius: 16 }}>
                <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 10 }}>
                  Expense Breakdown
                </div>
                <div style={{ width: '100%', height: 300 }}>
                  <ExpenseBreakdownChart data={profitLossReport.expenses.breakdown} />
                </div>
              </div>
            </div>
          </>
        ) : null}
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        {REPORTS.map((report) => (
          <div key={report.title} className="card" style={{ padding: 18, borderRadius: 16 }}>
            <div style={{ fontSize: 16, fontWeight: 700 }}>{report.title}</div>
            <div style={{ fontSize: 13, opacity: 0.7, marginTop: 6 }}>{report.description}</div>
            <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                className="btn"
                onClick={() => handleDownload(report.endpoint)}
                style={{ borderRadius: 999 }}
              >
                Download CSV
              </button>
              <span style={{ fontSize: 11, opacity: 0.6, alignSelf: 'center' }}>
                {report.filename}
              </span>
            </div>
          </div>
        ))}
      </div>

      <div
        className="card"
        style={{
          marginTop: 20,
          padding: 16,
          borderRadius: 16,
          background: 'var(--table-header-bg)',
        }}
      >
        <div style={{ fontWeight: 700, marginBottom: 6 }}>Export Notes</div>
        <ul style={{ fontSize: 13, opacity: 0.75, paddingLeft: 18, listStyle: 'disc' }}>
          <li>
            Profit &amp; Loss report uses paid invoices and categorized expenses in the selected
            period.
          </li>
          <li>
            PDF export provides board-ready formatting for executive and investor distribution.
          </li>
          <li>Excel export is delivered as CSV for direct spreadsheet compatibility.</li>
          <li>All reports are scoped to the authenticated admin tenant.</li>
        </ul>
      </div>
    </div>
  );
}
