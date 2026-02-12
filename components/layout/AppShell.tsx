"use client";

import { useMemo, useState } from "react";
import { SidebarProvider, useSidebar } from "@/lib/context/SidebarContext";
import Header from "@/components/layout/Header";
import Sidebar from "@/components/layout/Sidebar";
import GlobalSearchModal from "@/components/search/GlobalSearchModal";
import ActivityFeedSidebar from "@/components/activity/ActivityFeedSidebar";
import { useTenantContext } from "@/lib/tenant/useTenantContext";
import { normalizeRole } from "@/lib/erpAccess";
import { useKeyboardShortcuts } from "@/lib/hooks/useKeyboardShortcuts";

function AppShellInner({ children }: { children: React.ReactNode }) {
  const { data, loading } = useTenantContext();
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
    return brandName || data?.tenant?.name || "Bizosto";
  }, [data?.tenant?.brand?.name, data?.tenant?.name]);

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
    <div className="app-shell min-h-screen bg-[var(--app-bg)]">
      <Sidebar
        currentRole={currentUser.role}
        userName={currentUser.name}
        userEmail={currentUser.email}
        tenantName={tenantName}
        collapsed={isCollapsed}
      />

      <div className={`main-content-transition flex min-h-screen flex-col ${contentShift}`}>
        <Header
          onMenuToggle={openMobile}
          currentUser={currentUser}
          activityTrigger={
            <ActivityFeedSidebar
              open={activityOpen}
              onClose={() => setActivityOpen((prev) => !prev)}
              tenantId={data?.user?.tenantId || "default"}
              user={{
                uid: data?.user?.uid || "unknown",
                name: currentUser.name,
                email: currentUser.email,
                role: currentUser.role,
              }}
            />
          }
        />
        <main className="page-content flex-1 py-[var(--page-padding-y)]">
          <div className="page-frame">
            {loading ? <div className="card p-6">Loading workspace…</div> : children}
          </div>
        </main>
      </div>
      <GlobalSearchModal />
    </div>
  );
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <AppShellInner>{children}</AppShellInner>
    </SidebarProvider>
  );
}
