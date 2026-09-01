'use client';

import Image, { type ImageLoaderProps } from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BarChart3,
  Briefcase,
  CalendarDays,
  CreditCard,
  DollarSign,
  Factory,
  FileText,
  FolderKanban,
  FolderOpen,
  GitPullRequest,
  LayoutDashboard,
  LifeBuoy,
  LockKeyhole,
  LogOut,
  Settings,
  Shield,
  SlidersHorizontal,
  TrendingUp,
  UserCircle,
  UserPlus,
  Users,
  X,
  type LucideProps,
} from 'lucide-react';
import { useMemo, type ForwardRefExoticComponent, type RefAttributes } from 'react';
import { useSidebar } from '@/lib/context/SidebarContext';
import { useI18n } from '@/components/i18n/I18nProvider';
import { getNavigationForTenant, groupNavigationItems } from '@/lib/navigation/sidebarConfig';
import { apiFetch } from '@/lib/api/client';

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

const imageLoader = ({ src }: ImageLoaderProps) => src;

function formatRole(role: string) {
  return role.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()) || 'User';
}

function initials(name: string, email: string) {
  const source = name.trim() || email.trim();
  if (!source) return 'U';
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ''}${parts[parts.length - 1][0] || ''}`.toUpperCase();
}

export default function Sidebar({
  currentRole,
  userName,
  userEmail,
  tenantName,
  brandTagline,
  tenantLogoUrl,
  collapsed,
  tenantPlan = 'trial',
  tenantModules = {},
}: SidebarProps) {
  const pathname = usePathname();
  const { isMobileOpen, closeMobile, toggleCollapse } = useSidebar();
  const { t } = useI18n();

  const navItems = useMemo(
    () =>
      getNavigationForTenant(currentRole, tenantModules).map((item) => ({
        ...item,
        label: item.labelKey ? t(item.labelKey, { defaultValue: item.label }) : item.label,
      })),
    [currentRole, tenantModules, t],
  );
  const groups = useMemo(() => groupNavigationItems(navItems), [navItems]);
  const sidebarTagline = brandTagline?.trim() || 'Executive Workspace';
  const roleLabel = formatRole(currentRole);
  const userInitials = initials(userName, userEmail);
  const showSubscriberHelp =
    currentRole !== 'client' && !navItems.some((item) => item.href === '/help');

  const handleLogout = async () => {
    await apiFetch('/api/logout', { method: 'POST' });
    window.location.href = '/login';
  };

  return (
    <>
      {isMobileOpen ? (
        <button
          type="button"
          className="workspace-sidebar-overlay"
          onClick={closeMobile}
          aria-label="Close navigation"
        />
      ) : null}

      <aside
        id="main-sidebar"
        className={[
          'workspace-sidebar sidebar-transition',
          isMobileOpen ? 'workspace-sidebar--mobile-open' : '',
          collapsed ? 'workspace-sidebar--collapsed' : 'sidebar-desktop-open',
        ]
          .filter(Boolean)
          .join(' ')}
        aria-label="Primary navigation"
      >
        <div className="workspace-sidebar__inner">
          <div className="workspace-sidebar__brand">
            <button
              type="button"
              onClick={() => {
                if (window.innerWidth < 768) closeMobile();
                else toggleCollapse();
              }}
              className="workspace-sidebar__logo"
              aria-label={
                isMobileOpen
                  ? 'Close navigation'
                  : collapsed
                    ? 'Expand sidebar'
                    : 'Collapse sidebar'
              }
            >
              <Image
                loader={imageLoader}
                unoptimized
                src={tenantLogoUrl || '/icons/icon-192.svg'}
                alt={tenantLogoUrl ? `${tenantName} logo` : 'Bizosto B-mark'}
                width={40}
                height={40}
                className="h-10 w-10 rounded-xl object-contain"
              />
            </button>

            <div className="sidebar-label min-w-0 flex-1">
              <p className="workspace-sidebar__tenant">{tenantName}</p>
              <p className="workspace-sidebar__tagline">{sidebarTagline}</p>
            </div>

            {isMobileOpen ? (
              <button
                type="button"
                onClick={closeMobile}
                className="workspace-icon-button md:hidden"
                aria-label="Close menu"
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </div>

          <nav className="workspace-sidebar__nav">
            {groups.map((group) => (
              <div key={group.id} className="workspace-sidebar__group">
                <p className="workspace-sidebar__group-label sidebar-label">{group.label}</p>
                <div className="space-y-1">
                  {group.items.map((item) => {
                    const Icon = ICON_MAP[item.icon] ?? LayoutDashboard;
                    const isIndexHref =
                      item.href === '/admin' ||
                      item.href === '/dashboard' ||
                      item.href === '/super_admin' ||
                      item.href.split('/').filter(Boolean).length === 1;
                    const isActive = isIndexHref
                      ? pathname === item.href
                      : pathname === item.href || pathname.startsWith(`${item.href}/`);
                    const href = item.locked
                      ? `/billing?upgrade=module&module=${encodeURIComponent(item.module || '')}`
                      : item.href;

                    return (
                      <Link
                        key={item.id}
                        id={item.href === '/dashboard' ? 'sidebar-dashboard' : undefined}
                        href={href}
                        title={item.locked ? `${item.label} — upgrade required` : item.label}
                        aria-current={isActive ? 'page' : undefined}
                        aria-label={item.locked ? `${item.label}, upgrade required` : item.label}
                        onClick={isMobileOpen ? closeMobile : undefined}
                        className={[
                          'workspace-sidebar__link',
                          isActive && !item.locked ? 'workspace-sidebar__link--active' : '',
                          item.locked ? 'workspace-sidebar__link--locked' : '',
                        ]
                          .filter(Boolean)
                          .join(' ')}
                      >
                        <span className="workspace-sidebar__link-icon">
                          <Icon className="h-[18px] w-[18px]" />
                        </span>
                        <span className="sidebar-label min-w-0 flex-1 truncate">{item.label}</span>
                        {item.locked ? (
                          <LockKeyhole className="sidebar-label h-3.5 w-3.5 shrink-0" />
                        ) : null}
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>

          <footer className="workspace-sidebar__footer">
            {showSubscriberHelp ? (
              <Link href="/help" className="workspace-sidebar__utility" onClick={closeMobile}>
                <LifeBuoy className="h-[18px] w-[18px] shrink-0" />
                <span className="sidebar-label flex-1">Help Center</span>
              </Link>
            ) : null}

            <div className="workspace-sidebar__profile">
              <span className="workspace-sidebar__avatar" aria-hidden="true">
                {userInitials}
              </span>
              <div className="sidebar-label min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-[var(--text-primary)]">
                  {userName || userEmail || 'User'}
                </p>
                <p className="truncate text-[11px] text-[var(--text-muted)]">
                  {roleLabel} · {tenantPlan}
                </p>
              </div>
              <button
                type="button"
                className="workspace-sidebar__logout"
                onClick={handleLogout}
                aria-label="Log out"
                title="Log out"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          </footer>
        </div>
      </aside>
    </>
  );
}
