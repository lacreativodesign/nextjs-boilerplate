"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { SidebarProvider, useSidebar } from "@/lib/context/SidebarContext";
import Header from "@/components/layout/Header";
import Sidebar from "@/components/layout/Sidebar";
import ActivityFeedSidebar from "@/components/activity/ActivityFeedSidebar";
import { useTenantContext, type TenantContextResponse } from "@/lib/tenant/useTenantContext";
import { normalizeRole } from "@/lib/erpAccess";
import { useKeyboardShortcuts } from "@/lib/hooks/useKeyboardShortcuts";
import { I18nProvider, useI18n } from "@/components/i18n/I18nProvider";
import { generateThemeCssVariables } from "@/lib/white-label/theme";
import PullToRefresh from "@/components/mobile/PullToRefresh";
import MobileBottomNav from "@/components/layout/MobileBottomNav";

const GlobalSearchModal = dynamic(() => import("@/components/search/GlobalSearchModal"), {
  ssr: false,
  loading: () => null,
});

function AppShellInner({
  children,
  data,
  loading,
}: {
  children: React.ReactNode;
  data: TenantContextResponse | null;
  loading: boolean;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const { isCollapsed, openMobile, closeMobile, toggleCollapse } = useSidebar();
  const [activityOpen, setActivityOpen] = useState(false);

  const role = useMemo(() => normalizeRole(data?.user?.role || ""), [data?.user?.role]);

  const currentUser = useMemo(
    () => ({
      name: data?.user?.displayName || data?.user?.email || "User",
      email: data?.user?.email || "",
      role: role || "admin",
      avatarUrl: undefined,
    }),
    [data?.user?.displayName, data?.user?.email, role],
  );

  const tenantName = useMemo(() => {
    const brandName = data?.tenant?.brand?.name;
    return brandName || data?.tenant?.name || t("common.appName");
  }, [data?.tenant?.brand?.name, data?.tenant?.name, t]);

  const tenantLogoUrl = data?.tenant?.whiteLabel?.logoUrl || data?.tenant?.brand?.logoUrl || null;

  useEffect(() => {
    const whiteLabel = data?.tenant?.whiteLabel;
    if (!whiteLabel) return;
    const variables = generateThemeCssVariables({
      ...whiteLabel,
      updatedAt: undefined,
      updatedBy: undefined,
    });
    Object.entries(variables).forEach(([key, value]) => {
      document.documentElement.style.setProperty(key, value);
    });
    document.documentElement.style.setProperty("--brand-font", `"${whiteLabel.fontFamily}", system-ui`);
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
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchend", onTouchEnd);
    };
  }, [router]);

  useEffect(() => {
    const prefetchSearchModal = () => {
      import("@/components/search/GlobalSearchModal");
    };
    if (typeof window === "undefined") return;
    if ("requestIdleCallback" in window) {
      const idleCallback = window.requestIdleCallback(prefetchSearchModal, { timeout: 1200 });
      return () => window.cancelIdleCallback(idleCallback);
    }
    const timeoutId = window.setTimeout(prefetchSearchModal, 900);
    return () => window.clearTimeout(timeoutId);
  }, []);

  useKeyboardShortcuts({
    onToggleSidebar: toggleCollapse,
    onOpenSearch: () => {
      window.dispatchEvent(new CustomEvent("bizosto:search-open"));
    },
    onEscape: closeMobile,
  });

  const contentShift = isCollapsed
    ? "md:ml-[var(--sidebar-collapsed-width)]"
    : "md:ml-[var(--sidebar-width)]";

  return (
    <div className="min-h-screen bg-[var(--app-bg)]">
      <Sidebar
        currentRole={currentUser.role}
        userName={currentUser.name}
        userEmail={currentUser.email}
        tenantName={tenantName}
        tenantLogoUrl={tenantLogoUrl}
        collapsed={isCollapsed}
      />

      {/* Mobile: ml-[64px], Desktop: shifts based on sidebar state */}
      <div className={`main-content-transition flex min-h-screen flex-col ml-[64px] ${contentShift}`}>
        <Header
          onMenuToggle={openMobile}
          currentUser={currentUser}
          activityTrigger={
            <ActivityFeedSidebar
              open={activityOpen}
              onClose={() => setActivityOpen((prev) => !prev)}
            />
          }
        />
        <main className="flex-1 py-[var(--page-padding-y)] pb-20 md:pb-[var(--page-padding-y)]">
          <PullToRefresh>
            <div className="page-frame">
              {loading ? (
                <div className="card p-6">{t("common.loading")}</div>
              ) : (
                children
              )}
            </div>
          </PullToRefresh>
        </main>
      </div>

      <MobileBottomNav onMenuTap={openMobile} />
      <GlobalSearchModal />
    </div>
  );
}

function AppShellWithI18n({ children }: { children: React.ReactNode }) {
  const { data, loading } = useTenantContext();
  return (
    <I18nProvider
      userId={data?.user?.uid}
      userLocale={data?.user?.locale || data?.user?.language || null}
    >
      <AppShellInner data={data} loading={loading}>
        {children}
      </AppShellInner>
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
