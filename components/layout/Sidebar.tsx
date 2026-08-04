'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Users,
  Briefcase,
  TrendingUp,
  FolderKanban,
  Factory,
  DollarSign,
  UserCircle,
  BarChart3,
  Settings,
  CreditCard,
  Shield,
  X,
  SlidersHorizontal,
  FileText,
  CalendarDays,
  FolderOpen,
  GitPullRequest,
  UserPlus,
  LifeBuoy,
  type LucideProps,
} from 'lucide-react';
import type { ForwardRefExoticComponent, RefAttributes } from 'react';
import { useSidebar } from '@/lib/context/SidebarContext';
import { useI18n } from '@/components/i18n/I18nProvider';
import { getNavigationForRole } from '@/lib/navigation/sidebarConfig';

type IconComponent = ForwardRefExoticComponent<
  Omit<LucideProps, 'ref'> & RefAttributes<SVGSVGElement>
>;

const ICON_MAP: Record<string, IconComponent> = {
  LayoutDashboard,
  Users,
  Briefcase,
  TrendingUp,
  FolderKanban,
  Factory,
  DollarSign,
  UserCircle,
  BarChart3,
  Settings,
  CreditCard,
  Shield,
  SlidersHorizontal,
  FileText,
  CalendarDays,
  FolderOpen,
  GitPullRequest,
  UserPlus,
  LifeBuoy,
};

type SidebarProps = {
  currentRole: string;
  userName: string;
  userEmail: string;
  tenantName: string;
  brandTagline?: string;
  tenantLogoUrl: string | null;
  collapsed: boolean;
  tenantPlan?: string;
  tenantModules?: Record<string, boolean>;
};

export default function Sidebar({
  currentRole,
  tenantName,
  brandTagline,
  tenantLogoUrl,
  collapsed,
  tenantModules = {},
}: SidebarProps) {
  const pathname = usePathname();
  const { isMobileOpen, closeMobile, openMobile, toggleCollapse } = useSidebar();
  const { t } = useI18n();

  const navItems = getNavigationForRole(currentRole)
    .filter((item) => {
      // Module gating — only applies to admin role (other roles have their own dedicated dashboards)
      // super_admin bypasses all module checks
      if (item.module && currentRole === 'admin' && Object.keys(tenantModules).length > 0) {
        return tenantModules[item.module] !== false;
      }
      return true;
    })
    .map((item) => ({
      ...item,
      label: item.labelKey ? t(item.labelKey, { defaultValue: item.label }) : item.label,
    }));

  const labelsClass = [
    isMobileOpen ? 'sidebar-mobile-open' : '',
    !collapsed ? 'sidebar-desktop-open' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const sidebarTagline = brandTagline?.trim() || 'Powered by Bizosto®';

  const LogoIcon = () => (
    <img
      src={tenantLogoUrl || '/icons/icon-192.svg'}
      alt={tenantLogoUrl ? tenantName : 'Bizosto B-mark'}
      className="h-10 w-10 flex-shrink-0 rounded-xl object-contain"
    />
  );

  return (
    <>
      {isMobileOpen && (
        <div
          className="fixed inset-0 z-[35] md:hidden"
          style={{
            background: 'rgba(0,0,0,0.5)',
            backdropFilter: 'blur(4px)',
            WebkitBackdropFilter: 'blur(4px)',
          }}
          onClick={closeMobile}
        />
      )}

      <aside
        id="main-sidebar"
        className={[
          'sidebar-transition',
          'fixed left-0 top-0 z-40 h-full',
          'border-r border-[var(--border-subtle)] bg-[var(--surface-card)]',
          isMobileOpen ? 'w-[260px]' : 'w-16',
          collapsed ? 'md:w-[var(--sidebar-collapsed-width)]' : 'md:w-[var(--sidebar-width)]',
          labelsClass,
        ].join(' ')}
      >
        {/* No horizontal padding on outer — icons must center in 64px */}
        <div className="flex h-full flex-col py-3">
          {/* px-3 on header keeps B icon at 12px left → center = 12+20 = 32px = half of 64px */}
          <div className="mb-4 border-b border-[var(--border-subtle)] pb-3 px-3">
            <div className="flex h-14 items-center">
              {/* B icon is the ONLY toggle — desktop: collapse, mobile: open/close drawer */}
              <button
                type="button"
                onClick={() => {
                  if (typeof window !== 'undefined' && window.innerWidth >= 768) {
                    toggleCollapse();
                  } else {
                    isMobileOpen ? closeMobile() : openMobile();
                  }
                }}
                className="flex-shrink-0 cursor-pointer focus:outline-none"
                aria-label="Toggle sidebar"
              >
                <LogoIcon />
              </button>

              <div className="sidebar-label ml-3 min-w-0 flex-1">
                <div className="truncate text-sm font-bold text-[var(--text-primary)] leading-tight">
                  {tenantName}
                </div>
                <div className="truncate text-xs text-[var(--text-muted)]">{sidebarTagline}</div>
              </div>

              {isMobileOpen && (
                <button
                  onClick={closeMobile}
                  className="ml-2 flex-shrink-0 flex h-8 w-8 items-center justify-center rounded-lg hover:bg-[var(--surface-muted)] transition-colors md:hidden"
                  aria-label="Close menu"
                >
                  <X className="h-4 w-4 text-[var(--text-muted)]" />
                </button>
              )}
            </div>
          </div>

          {/* px-4 on links → icon starts at 16px, center = 16+16 = 32px = half of 64px */}
          <nav className="flex-1 space-y-0.5 overflow-y-auto overflow-x-hidden">
            {navItems.map((item) => {
              const Icon: IconComponent = ICON_MAP[item.icon] ?? LayoutDashboard;
              const isIndexHref =
                item.href === '/admin' ||
                item.href === '/dashboard' ||
                item.href === '/super_admin' ||
                item.href.split('/').filter(Boolean).length === 1;
              const isActive = isIndexHref
                ? pathname === item.href
                : pathname === item.href || pathname.startsWith(item.href + '/');
              const opensInNewTab = item.href === '/help';
              return (
                <Link
                  key={item.id}
                  id={item.href === '/dashboard' ? 'sidebar-dashboard' : undefined}
                  href={item.href}
                  title={item.label}
                  target={opensInNewTab ? '_blank' : undefined}
                  rel={opensInNewTab ? 'noopener noreferrer' : undefined}
                  onClick={isMobileOpen ? closeMobile : undefined}
                  className={[
                    'flex w-full items-center rounded-xl transition-colors px-4 py-2.5',
                    isActive
                      ? 'bg-[var(--erp-blue)] text-white shadow-lg shadow-blue-500/20'
                      : 'text-[var(--text-primary)] opacity-60 hover:bg-[var(--surface-muted)] hover:opacity-100',
                  ].join(' ')}
                >
                  <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg">
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="sidebar-label ml-2 text-sm font-semibold whitespace-nowrap">
                    {item.label}
                  </span>
                </Link>
              );
            })}
          </nav>
        </div>
      </aside>
    </>
  );
}
