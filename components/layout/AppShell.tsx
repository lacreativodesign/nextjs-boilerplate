'use client';

import dynamic from 'next/dynamic';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { SidebarProvider, useSidebar } from '@/lib/context/SidebarContext';
import Header from '@/components/layout/Header';
import Sidebar from '@/components/layout/Sidebar';
import ActivityFeedSidebar from '@/components/activity/ActivityFeedSidebar';
import NotificationBell from '@/components/notifications/NotificationBell';
import { useTenantContext, type TenantContextResponse } from '@/lib/tenant/useTenantContext';
import { normalizeRole } from '@/lib/erpAccess';
import { useKeyboardShortcuts } from '@/lib/hooks/useKeyboardShortcuts';
import { I18nProvider } from '@/components/i18n/I18nProvider';
import { generateThemeCssVariables } from '@/lib/white-label/theme';
import PullToRefresh from '@/components/mobile/PullToRefresh';
import BugReportButton from '@/components/support/BugReportButton';
import NotificationToast from '@/components/notifications/NotificationToast';
import ImpersonationBanner from '@/components/super_admin/ImpersonationBanner';
import ActiveTabScroller from '@/components/layout/ActiveTabScroller';
import { PlatformTourGate } from '@/components/onboarding/PlatformTourGate';

const GlobalSearchModal = dynamic(() => import('@/components/search/GlobalSearchModal'), {
  ssr: false,
  loading: () => null,
});

function AppShellInner({
  children,
  data,
}: {
  children: React.ReactNode;
  data: TenantContextResponse | null;
}) {
  const router = useRouter();
  const { isCollapsed, closeMobile, toggleCollapse } = useSidebar();
  const [activityOpen, setActivityOpen] = useState(false);

  /**
   * P1-1: the shell's identity comes from one place — /api/tenant/context, resolved server-side
   * with the Admin SDK by useTenantContext.
   *
   * It previously seeded the role from a browser localStorage key, re-derived it with a
   * second Firebase auth listener and a second Firestore read of users/{uid}, and then fell back
   * to 'admin' if neither had resolved. Three consequences:
   *
   *   - a browser-writable value fed the shell's idea of who you are
   *   - every authenticated page paid for two Firebase auth initialisations and two identity
   *     reads before first paint
   *   - a legitimate non-admin whose context request was slow was rendered an admin shell
   *
   * There is no fallback now. An unresolved or unrecognised identity yields an empty role
   * (normalizeRole returns null, coerced to ''), and every consumer already degrades safely:
   * getNavigationForRole('') returns no items, the header badge reads 'User', and getRoleRoute('')
   * returns '/login' so the product tour cannot fire. Page-level authorisation is unaffected —
   * that is RequireAuth's job and it verifies independently.
   */
  const currentUser = useMemo(() => {
    return {
      name: data?.user?.displayName || (data?.user?.email ? data.user.email.split('@')[0] : 'User'),
      email: data?.user?.email || '',
      role: normalizeRole(data?.user?.role || '') || '',
      avatarUrl: undefined,
      displayName: data?.user?.displayName || null,
    };
  }, [data?.user?.displayName, data?.user?.email, data?.user?.role]);

  useEffect(() => {
    const whiteLabel = data?.tenant?.whiteLabel;
    if (!whiteLabel) return;
    const variables = generateThemeCssVariables({
      primaryColor: whiteLabel.primaryColor,
      secondaryColor: whiteLabel.secondaryColor,
      accentColor: whiteLabel.accentColor,
      fontFamily: whiteLabel.fontFamily,
    });
    Object.entries(variables).forEach(([key, value]) => {
      document.documentElement.style.setProperty(key, value);
    });
    document.documentElement.style.setProperty(
      '--brand-font',
      `"${whiteLabel.fontFamily}", system-ui`,
    );
    document.body.style.fontFamily = `var(--brand-font)`;
  }, [data?.tenant?.whiteLabel]);

  useEffect(() => {
    let startX = 0;
    let startY = 0;
    const onTouchStart = (event: TouchEvent) => {
      startX = event.touches[0]?.clientX || 0;
      startY = event.touches[0]?.clientY || 0;
    };
    const onTouchEnd = (event: TouchEvent) => {
      const endX = event.changedTouches[0]?.clientX || 0;
      const endY = event.changedTouches[0]?.clientY || 0;
      const deltaX = endX - startX;
      const deltaY = Math.abs(endY - startY);
      if (startX < 24 && deltaX > 110 && deltaY < 70) {
        router.back();
      }
    };
    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchend', onTouchEnd, { passive: true });
    return () => {
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchend', onTouchEnd);
    };
  }, [router]);

  useEffect(() => {
    const prefetchSearchModal = () => {
      import('@/components/search/GlobalSearchModal');
    };
    if (typeof window === 'undefined') return;
    if ('requestIdleCallback' in window) {
      const idleCallback = window.requestIdleCallback(prefetchSearchModal, { timeout: 1200 });
      return () => window.cancelIdleCallback(idleCallback);
    }
    const timeoutId = setTimeout(prefetchSearchModal, 900);
    return () => clearTimeout(timeoutId);
  }, []);

  useKeyboardShortcuts({
    onToggleSidebar: toggleCollapse,
    onOpenSearch: () => {
      window.dispatchEvent(new CustomEvent('bizosto:search-open'));
    },
    onEscape: closeMobile,
  });

  return (
    <div className="min-h-screen bg-[var(--app-bg)]">
      <Sidebar
        currentRole={currentUser.role}
        userName={currentUser.name}
        userEmail={currentUser.email}
        tenantName={data?.tenant?.name || 'Bizosto'}
        brandTagline={data?.tenant?.whiteLabel?.tagline || undefined}
        tenantLogoUrl={data?.tenant?.whiteLabel?.logoUrl || data?.tenant?.brand?.logoUrl || null}
        collapsed={isCollapsed}
        tenantPlan={data?.tenant?.plan || 'trial'}
        tenantModules={data?.tenant?.modules || {}}
      />

      {/* Content always offset by sidebar */}
      <div
        className={`transition-[margin] duration-300 ease-in-out flex min-h-screen flex-col ml-16 pt-[56px] ${
          isCollapsed ? 'md:ml-16' : 'md:ml-[260px]'
        }`}
      >
        <Header
          currentUser={currentUser}
          notificationBell={<NotificationBell />}
          activityTrigger={
            <ActivityFeedSidebar
              open={activityOpen}
              onClose={() => setActivityOpen((prev) => !prev)}
            />
          }
        />
        <main className="flex-1 py-[var(--page-padding-y)]">
          <PullToRefresh>
            <div className="page-frame">{children}</div>
          </PullToRefresh>
        </main>
      </div>

      <ActiveTabScroller />
      <PlatformTourGate role={currentUser.role} companyName={data?.tenant?.name || 'Bizosto'} />
      <ImpersonationBanner />
      <BugReportButton />
      <NotificationToast />
      <GlobalSearchModal />
    </div>
  );
}

function AppShellWithI18n({ children }: { children: React.ReactNode }) {
  const { data } = useTenantContext();
  return (
    <I18nProvider
      userId={data?.user?.uid}
      userLocale={data?.user?.locale || data?.user?.language || null}
    >
      <AppShellInner data={data}>{children}</AppShellInner>
    </I18nProvider>
  );
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <AppShellWithI18n>{children}</AppShellWithI18n>
    </SidebarProvider>
  );
}
