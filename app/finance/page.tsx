'use client';
import { useEffect, useState } from 'react';
import FirstRunHint from '@/components/onboarding/FirstRunHint';
import dynamic from 'next/dynamic';

const FinanceAgentWidget = dynamic(() => import('@/components/ai/FinanceAgentWidget'), {
  ssr: false,
});

type Overview = {
  kpisUsd: {
    totalRevenueMonth: number;
    outstandingInvoices: number;
    paymentsReceivedMonth: number;
    agingBuckets: {
      bucket0to30: number;
      bucket31to60: number;
      bucket61to90: number;
      bucket90plus: number;
    };
  };
  kpisPkr: {
    payrollDueMonth: number;
    expensesMonth: number;
  };
  revenueSeries: { label: string; invoices: number; payments: number }[];
  recentEvents: { id: string; title: string; description: string; createdAt: string | null }[];
};

const fmt = (n: number) => (n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${n.toFixed(2)}`);

const fmtPkr = (n: number) => (n >= 1000 ? `PKR ${(n / 1000).toFixed(1)}k` : `PKR ${n.toFixed(0)}`);

function KpiCard({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string;
  sub: string;
  color?: string;
}) {
  return (
    <div className="card">
      <div className="helper-text mb-2">{label}</div>
      <div className="text-3xl font-bold" style={{ color: color || 'var(--text-primary)' }}>
        {value}
      </div>
      <div className="mt-1 text-xs text-[var(--text-muted)]">{sub}</div>
    </div>
  );
}

export default function FinanceOverviewPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/finance/overview', { credentials: 'include' })
      .then((r) => r.json())
      .then((res) => {
        if (res.ok) setData(res.overview);
        else setError(res.error || 'Failed to load');
      })
      .catch(() => setError('Failed to load finance data'))
      .finally(() => setLoading(false));
  }, []);

  const kpi = data?.kpisUsd;
  const pkr = data?.kpisPkr;
  const aging = kpi?.agingBuckets;

  if (loading)
    return <div className="card p-6 text-[var(--text-muted)]">Loading finance data...</div>;

  if (error) return <div className="card p-6 text-red-400">{error}</div>;

  // S29: a new tenant has no invoices or payments yet, so every finance figure is zero.
  // Point them at invoice creation, which is where finance data begins.
  const isFirstRun =
    (kpi?.totalRevenueMonth || 0) === 0 &&
    (kpi?.outstandingInvoices || 0) === 0 &&
    (pkr?.payrollDueMonth || 0) === 0;

  return (
    <div className="space-y-6">
      <div className="mb-6">
        <FinanceAgentWidget />
      </div>

      <FirstRunHint
        show={isFirstRun}
        title="No financial activity yet"
        description="Revenue, outstanding balances and payroll fill in as you raise invoices and record payments. Create your first invoice to get started."
        action={{ label: 'Create an invoice', href: '/finance/invoices' }}
      />

      <section>
        <h2 className="section-title mb-4">USD Performance</h2>
        <div className="kpis">
          <KpiCard
            label="Total Revenue (This Month)"
            value={fmt(kpi?.totalRevenueMonth || 0)}
            sub="Paid invoices"
            color={kpi?.totalRevenueMonth ? '#10b981' : undefined}
          />
          <KpiCard
            label="Outstanding Invoices"
            value={fmt(kpi?.outstandingInvoices || 0)}
            sub="Sent / overdue"
            color={kpi?.outstandingInvoices ? '#f59e0b' : undefined}
          />
          <KpiCard
            label="Payments Received"
            value={fmt(kpi?.paymentsReceivedMonth || 0)}
            sub="This month"
            color={kpi?.paymentsReceivedMonth ? '#3b82f6' : undefined}
          />
          <KpiCard
            label="AR Aging (0–30d)"
            value={fmt(aging?.bucket0to30 || 0)}
            sub="Current outstanding"
          />
        </div>
      </section>

      {aging?.bucket31to60 || aging?.bucket61to90 || aging?.bucket90plus ? (
        <section>
          <h2 className="section-title mb-4">Aging Buckets</h2>
          <div className="kpis">
            <KpiCard
              label="31–60 Days"
              value={fmt(aging?.bucket31to60 || 0)}
              sub="Overdue"
              color="#f59e0b"
            />
            <KpiCard
              label="61–90 Days"
              value={fmt(aging?.bucket61to90 || 0)}
              sub="Overdue"
              color="#ef4444"
            />
            <KpiCard
              label="90+ Days"
              value={fmt(aging?.bucket90plus || 0)}
              sub="Critical"
              color="#ef4444"
            />
          </div>
        </section>
      ) : null}

      <section>
        <h2 className="section-title mb-4">PKR Operations</h2>
        <div className="kpis">
          <KpiCard
            label="Payroll Due (This Month)"
            value={fmtPkr(pkr?.payrollDueMonth || 0)}
            sub="Unpaid this month"
          />
          <KpiCard
            label="Expenses (This Month)"
            value={fmtPkr(pkr?.expensesMonth || 0)}
            sub="All categories"
          />
        </div>
      </section>

      {data?.revenueSeries && data.revenueSeries.length > 0 && (
        <section>
          <h2 className="section-title mb-4">Revenue Trend (6 Months)</h2>
          <div className="card p-4">
            <div className="flex items-end gap-2 h-32">
              {data.revenueSeries.map((row) => {
                const max = Math.max(
                  ...data.revenueSeries.map((r) => Math.max(r.invoices, r.payments)),
                  1,
                );
                const invH = Math.round((row.invoices / max) * 100);
                const payH = Math.round((row.payments / max) * 100);
                return (
                  <div key={row.label} className="flex-1 flex flex-col items-center gap-1">
                    <div className="w-full flex items-end gap-0.5 h-24">
                      <div
                        className="flex-1 rounded-t transition-all"
                        style={{ height: `${invH}%`, backgroundColor: '#3b82f6', minHeight: 2 }}
                        title={`Invoices: ${fmt(row.invoices)}`}
                      />
                      <div
                        className="flex-1 rounded-t transition-all"
                        style={{ height: `${payH}%`, backgroundColor: '#10b981', minHeight: 2 }}
                        title={`Payments: ${fmt(row.payments)}`}
                      />
                    </div>
                    <p className="text-xs text-[var(--text-muted)] truncate w-full text-center">
                      {row.label.slice(5)}
                    </p>
                  </div>
                );
              })}
            </div>
            <div className="flex gap-4 mt-2 justify-center">
              <span className="flex items-center gap-1 text-xs text-[var(--text-muted)]">
                <span className="h-2 w-4 rounded" style={{ background: '#3b82f6' }} />
                Invoices
              </span>
              <span className="flex items-center gap-1 text-xs text-[var(--text-muted)]">
                <span className="h-2 w-4 rounded" style={{ background: '#10b981' }} />
                Payments
              </span>
            </div>
          </div>
        </section>
      )}

      {data?.recentEvents && data.recentEvents.length > 0 && (
        <section>
          <h2 className="section-title mb-4">Recent Activity</h2>
          <div className="card divide-y divide-[var(--border-subtle)]">
            {data.recentEvents.slice(0, 5).map((e) => (
              <div key={e.id} className="p-3">
                <p className="text-sm font-medium text-[var(--text-primary)]">{e.title}</p>
                <p className="text-xs text-[var(--text-muted)]">{e.description}</p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
