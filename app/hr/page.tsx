'use client';
import { useEffect, useState } from 'react';
import FirstRunHint from '@/components/onboarding/FirstRunHint';
import Link from 'next/link';

type HROverview = {
  totalEmployees: number;
  activeEmployees: number;
  newHires: number;
  openOnboarding: number;
};

function StatCard({
  label,
  value,
  sub,
  href,
  color,
}: {
  label: string;
  value: string | number;
  sub: string;
  href?: string;
  color?: string;
}) {
  const inner = (
    <div
      className={`card ${href ? 'cursor-pointer hover:border-[var(--erp-blue)] transition-all group' : ''}`}
    >
      <div className="helper-text mb-2">{label}</div>
      <div
        className="text-3xl font-bold group-hover:text-[var(--erp-blue)]"
        style={{ color: color || 'var(--text-primary)' }}
      >
        {value}
      </div>
      <div className="mt-1 text-xs text-[var(--text-muted)]">{sub}</div>
    </div>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}

export default function HrOverviewPage() {
  const [data, setData] = useState<HROverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/hr/overview', { credentials: 'include' })
      .then((r) => r.json())
      .then((res) => {
        if (res.ok) {
          setData({
            totalEmployees: res.overview?.totalEmployees ?? 0,
            activeEmployees: res.overview?.activeEmployees ?? 0,
            newHires: res.overview?.newHires ?? 0,
            openOnboarding: res.overview?.openOnboarding ?? 0,
          });
        } else {
          setError(res.error || 'Failed to load HR data');
        }
      })
      .catch(() => setError('Failed to load HR data'))
      .finally(() => setLoading(false));
  }, []);

  const v = (n: number) => (loading ? '...' : n);

  // S29: a workspace that has not added employees yet shows all zeros. Point HR at adding
  // their first employee, which is what every other HR figure derives from.
  const isFirstRun =
    !loading &&
    !error &&
    (data?.totalEmployees ?? 0) === 0 &&
    (data?.activeEmployees ?? 0) === 0 &&
    (data?.newHires ?? 0) === 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Overview</h1>
        <p className="page-subtitle mt-2">Headcount, leave, and onboarding at a glance.</p>
      </div>

      <FirstRunHint
        show={isFirstRun}
        title="No employees added yet"
        description="Leave, onboarding and performance all build on your employee list. Add your first employee to get started."
        action={{ label: 'Add an employee', href: '/hr/employees' }}
      />

      <div className="kpis">
        <StatCard
          label="Total Employees"
          value={v(data?.totalEmployees ?? 0)}
          sub="All staff"
          href="/hr/employees"
        />
        <StatCard
          label="Active Employees"
          value={v(data?.activeEmployees ?? 0)}
          sub="Currently active"
          color="var(--success)"
          href="/hr/employees"
        />
        <StatCard
          label="New Hires (30d)"
          value={v(data?.newHires ?? 0)}
          sub="Joined this month"
          color="var(--erp-blue)"
        />
        <StatCard
          label="Open Onboarding"
          value={v(data?.openOnboarding ?? 0)}
          sub="Tasks pending"
          color={data?.openOnboarding ? 'var(--warning)' : undefined}
        />
      </div>

      {error && <div className="card p-4 text-red-400 text-sm">{error}</div>}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {[
          { title: 'Employees', href: '/hr/employees', desc: 'View and manage all team members.' },
          { title: 'Leave', href: '/hr/leave', desc: 'Manage leave requests and approvals.' },
          {
            title: 'Performance',
            href: '/hr/performance',
            desc: 'KPI reviews and performance ratings.',
          },
        ].map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-5 hover:border-[var(--erp-blue)] transition-all group"
          >
            <p className="font-semibold text-[var(--text-primary)] group-hover:text-[var(--erp-blue)]">
              {item.title}
            </p>
            <p className="mt-1 text-sm text-[var(--text-muted)]">{item.desc}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
