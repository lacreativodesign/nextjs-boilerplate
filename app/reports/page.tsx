'use client';
import { useRouter } from 'next/navigation';

const REPORT_SECTIONS = [
  {
    title: 'Sales Reports',
    href: '/reports/sales',
    desc: 'Leads converted, deals closed, revenue by rep.',
  },
  {
    title: 'Project Reports',
    href: '/reports/projects',
    desc: 'Delivery timelines, milestones, change requests.',
  },
  {
    title: 'Team Performance',
    href: '/reports/team',
    desc: 'Attendance, KPIs, and performance reviews.',
  },
  {
    title: 'Finance Reports',
    href: '/reports/finance',
    desc: 'Revenue, outstanding invoices, payroll.',
  },
  {
    title: '🤖 AI Reports',
    href: '/reports/ai',
    desc: 'Ask any question in plain English — get a chart or table powered by your live data.',
  },
];

export default function ReportsPage() {
  const router = useRouter();
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        {REPORT_SECTIONS.map((section) => (
          <button
            key={section.href}
            onClick={() => router.push(section.href)}
            className="rounded-xl border border-[var(--border-subtle)]
              bg-[var(--surface-card)] p-6 text-left
              hover:border-[var(--erp-blue)] transition-all group"
          >
            <p
              className="font-bold text-[var(--text-primary)]
              group-hover:text-[var(--erp-blue)] text-base"
            >
              {section.title}
            </p>
            <p className="mt-2 text-sm text-[var(--text-muted)]">{section.desc}</p>
            <p
              className="mt-3 text-xs font-semibold text-[var(--erp-blue)] opacity-0
              group-hover:opacity-100 transition-opacity"
            >
              View Report →
            </p>
          </button>
        ))}
      </div>
    </div>
  );
}
