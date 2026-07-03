'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useCountUp } from '@/lib/hooks/useCountUp';
import { useTenantContext } from '@/lib/tenant/useTenantContext';
import { PlatformTour } from '@/components/onboarding/PlatformTour';
import { ActivationChecklist } from '@/components/onboarding/ActivationChecklist';
import { normalizeRole, type ErpRole } from '@/lib/erpAccess';
import dynamic from 'next/dynamic';
import {
  TrendingUp,
  Briefcase,
  UserCircle,
  Package,
  DollarSign,
  BarChart3,
  Settings,
} from 'lucide-react';
const COOSummaryWidget = dynamic(() => import('@/components/ai/COOSummaryWidget'), { ssr: false });

const ROLE_OVERVIEW_SUBTITLES: Record<ErpRole, string> = {
  admin: 'Your workspace overview.',
  super_admin: 'Platform-wide snapshot across all tenants.',
  finance: 'Financial overview for your workspace.',
  hr: 'HR overview for your workspace.',
  sales: 'Sales pipeline overview for your workspace.',
  sales_manager: 'Sales team and pipeline overview for your workspace.',
  production: 'Production overview for your workspace.',
  production_manager: 'Production team overview for your workspace.',
  am: 'Account management overview for your workspace.',
  am_manager: 'Account management team overview for your workspace.',
  client: 'Your client workspace overview.',
};

type Stats = {
  users: number;
  clients: number;
};

function StatCard({
  label,
  value,
  sub,
  href,
}: {
  label: string;
  value: string | number;
  sub: string;
  href?: string;
}) {
  const router = useRouter();
  const numericTarget = typeof value === 'number' ? value : 0;
  const animated = useCountUp(numericTarget);
  const display = typeof value === 'number' ? animated : value;
  return (
    <div
      onClick={() => href && router.push(href)}
      className={`rounded-xl border border-[var(--border-subtle)]
        bg-[var(--surface-card)] p-5
        ${href ? 'cursor-pointer hover:border-[var(--erp-blue)] transition-all group' : ''}`}
    >
      <p className="text-sm text-[var(--text-muted)]">{label}</p>
      <p
        className="mt-2 text-3xl font-bold text-[var(--text-primary)]
        group-hover:text-[var(--erp-blue)]"
      >
        {display}
      </p>
      <p className="mt-1 text-xs text-[var(--text-soft)]">{sub}</p>
    </div>
  );
}

export default function DashboardPage() {
  const { data: tenantData } = useTenantContext();
  const modulesEnabled = tenantData?.tenant?.modulesEnabled || {};
  const currentRole = normalizeRole(tenantData?.user?.role || '');
  const overviewSubtitle = currentRole
    ? ROLE_OVERVIEW_SUBTITLES[currentRole]
    : ROLE_OVERVIEW_SUBTITLES.admin;
  const tourRole = currentRole?.replace(/_/g, ' ') || tenantData?.user?.role || 'team member';
  const tourCompanyName =
    tenantData?.tenant?.brand?.name || tenantData?.tenant?.name || 'your workspace';

  function moduleEnabled(key: string): boolean {
    return modulesEnabled[key] !== false;
  }
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [showTour, setShowTour] = useState(false);

  useEffect(() => {
    const toured = localStorage.getItem('bizosto_tour_complete');
    if (!toured) {
      setShowTour(true);
    }
  }, []);

  useEffect(() => {
    async function load() {
      try {
        const [usersRes, clientsRes] = await Promise.all([
          fetch('/api/admin/users/list', { credentials: 'include' }),
          fetch('/api/admin/clients/list', { credentials: 'include' }).catch(() => null),
        ]);
        const usersData = await usersRes.json().catch(() => ({}));
        const clientsData = clientsRes ? await clientsRes.json().catch(() => ({})) : {};

        const userList = Array.isArray(usersData) ? usersData : usersData?.users || [];
        const clientList = Array.isArray(clientsData?.clients)
          ? clientsData.clients
          : Array.isArray(clientsData)
            ? clientsData
            : [];

        setStats({
          users: userList.length,
          clients: clientList.length,
        });
      } catch (err) {
        console.error('Dashboard stats error', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const val = (n: number) => (loading ? '...' : n || '—');

  return (
    <div className="space-y-6">
      <div className="mb-6">
        <h1 className="page-title">Overview</h1>
        <p className="page-subtitle">{overviewSubtitle}</p>
      </div>

      {currentRole === 'admin' && <ActivationChecklist />}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Team Members"
          value={val(stats?.users ?? 0)}
          sub="Active users"
          href="/users"
        />
        <StatCard
          label="Clients"
          value={val(stats?.clients ?? 0)}
          sub="Total accounts"
          href="/clients"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {[
          {
            title: 'Sales & Pipeline',
            href: '/sales',
            desc: 'Leads, deals, and revenue pipeline.',
            moduleKey: 'sales',
            icon: TrendingUp,
          },
          {
            title: 'Clients',
            href: '/clients',
            desc: 'Client accounts and lifecycle management.',
            moduleKey: null,
            icon: Briefcase,
          },
          {
            title: 'HR & Team',
            href: '/hr',
            desc: 'Attendance, leave, and performance.',
            moduleKey: 'hr',
            icon: UserCircle,
          },
          {
            title: 'Production',
            href: '/production',
            desc: 'Jobs, workload, and delivery.',
            moduleKey: 'production',
            icon: Package,
          },
          {
            title: 'Finance',
            href: '/finance',
            desc: 'Invoices, payments, and payroll.',
            moduleKey: 'finance',
            icon: DollarSign,
          },
          {
            title: 'Reports',
            href: '/reports',
            desc: 'Analytics across all departments.',
            moduleKey: 'reports',
            icon: BarChart3,
          },
          {
            title: 'Settings',
            href: '/settings',
            desc: 'System configuration and preferences.',
            moduleKey: null,
            icon: Settings,
          },
        ]
          .filter((item) => !item.moduleKey || moduleEnabled(item.moduleKey))
          .map((item) => {
            const Icon = item.icon;
            return (
              <a
                key={item.href}
                href={item.href}
                className="flex items-start gap-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-5 hover:border-[var(--erp-blue)] transition-all group"
              >
                <span className="mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-[var(--erp-blue-soft)] text-[var(--erp-blue)]">
                  <Icon className="h-4 w-4" />
                </span>
                <div>
                  <p className="font-semibold text-[var(--text-primary)] group-hover:text-[var(--erp-blue)]">
                    {item.title}
                  </p>
                  <p className="mt-0.5 text-sm text-[var(--text-muted)]">{item.desc}</p>
                </div>
              </a>
            );
          })}
      </div>

      {/* Admin Tools removed from dashboard — accessible via Admin Settings in sidebar */}

      {/* Extended Modules removed — accessible via Admin Settings in sidebar */}
      <div className="mt-6">
        <COOSummaryWidget />
      </div>

      {showTour && (
        <PlatformTour
          role={tourRole}
          companyName={tourCompanyName}
          onClose={() => setShowTour(false)}
        />
      )}
    </div>
  );
}
