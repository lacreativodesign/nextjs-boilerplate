"use client";

import { useMemo, useState } from "react";
import { SidebarProvider, useSidebar } from "@/lib/context/SidebarContext";
import Header from "@/components/layout/Header";
import Sidebar from "@/components/layout/Sidebar";
import GlobalSearchModal from "@/components/search/GlobalSearchModal";
import ActivityFeedSidebar from "@/components/activity/ActivityFeedSidebar";
import { useTenantContext, type TenantContextResponse } from "@/lib/tenant/useTenantContext";
import { normalizeRole } from "@/lib/erpAccess";
import { useKeyboardShortcuts } from "@/lib/hooks/useKeyboardShortcuts";
import { I18nProvider, useI18n } from "@/components/i18n/I18nProvider";

function AppShellInner({ children, data, loading }: { children: React.ReactNode; data: TenantContextResponse | null; loading: boolean }) {
  const { t } = useI18n();
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

  useKeyboardShortcuts({
    onToggleSidebar: toggleCollapse,
    onOpenSearch: () => {
      window.dispatchEvent(new CustomEvent("bizosto:search-open"));
    },
    onEscape: closeMobile,
  });

  const contentShift = isCollapsed ? "md:ml-[var(--sidebar-collapsed-width)]" : "md:ml-[var(--sidebar-width)]";

  return (
    <div className="app-shell min-h-screen bg-[var(--app-bg)]">
      <Sidebar currentRole={currentUser.role} userName={currentUser.name} userEmail={currentUser.email} tenantName={tenantName} collapsed={isCollapsed} />

      <div className={`main-content-transition flex min-h-screen flex-col ${contentShift}`}>
        <Header
          onMenuToggle={openMobile}
          currentUser={currentUser}
          activityTrigger={<ActivityFeedSidebar open={activityOpen} onClose={() => setActivityOpen((prev) => !prev)} />}
        />
        <main className="page-content flex-1 py-[var(--page-padding-y)]">
          <div className="page-frame">{loading ? <div className="card p-6">{t("common.loading")}</div> : children}</div>
        </main>
      </div>
      <GlobalSearchModal />
    </div>
  );
}

function AppShellWithI18n({ children }: { children: React.ReactNode }) {
  const { data, loading } = useTenantContext();

  return (
    <I18nProvider userId={data?.user?.uid} userLocale={data?.user?.locale || data?.user?.language || null}>
      <AppShellInner data={data} loading={loading}>{children}</AppShellInner>
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
