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
import { I18nProvider } from "@/components/i18n/I18nProvider";
import { generateThemeCssVariables } from "@/lib/white-label/theme";
import PullToRefresh from "@/components/mobile/PullToRefresh";
import BugReportButton from "@/components/support/BugReportButton";
import { fetchUserRole, getFirebaseAuth } from "@/lib/firebaseClient";
import { onAuthStateChanged } from "firebase/auth";

const GlobalSearchModal = dynamic(() => import("@/components/search/GlobalSearchModal"), {
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
  const { isCollapsed, openMobile, closeMobile, toggleCollapse } = useSidebar();
  const [activityOpen, setActivityOpen] = useState(false);

  const [clientRole, setClientRole] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return window.localStorage.getItem("bizosto_role") || null;
  });
  useEffect(() => {
    let cancelled = false;
    getFirebaseAuth().then((auth) => {
      const unsub = onAuthStateChanged(auth, async (user) => {
        if (user && !cancelled) {
          const role = await fetchUserRole(user.uid);
          if (!cancelled) {
            setClientRole(role);
            if (role) window.localStorage.setItem("bizosto_role", role);
          }
        }
      });
      return () => { cancelled = true; unsub(); };
    }).catch(() => {});
  }, []);

  const currentUser = useMemo(
    () => {
      const serverRole = normalizeRole(data?.user?.role || "");
      const fallbackRole = normalizeRole(clientRole || "");
      return {
        name:
          data?.user?.displayName ||
          (data?.user?.email ? data.user.email.split("@")[0] : "User"),
        email: data?.user?.email || "",
        role: serverRole || fallbackRole || "admin",
        avatarUrl: undefined,
      };
    },
    [data?.user?.displayName, data?.user?.email, data?.user?.role, clientRole],
  );

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

  return (
    <div className="min-h-screen bg-[var(--app-bg)]">
      <Sidebar
        currentRole={currentUser.role}
        userName={currentUser.name}
        userEmail={currentUser.email}
        tenantName={data?.tenant?.name || "Bizosto"}
        tenantLogoUrl={data?.tenant?.whiteLabel?.logoUrl || null}
        collapsed={isCollapsed}
        tenantPlan={data?.tenant?.plan || "trial"}
        tenantModules={data?.tenant?.modules || {}}
      />

      {/* Content always offset by sidebar */}
      <div className={`transition-[margin] duration-300 ease-in-out flex min-h-screen flex-col ml-16 pt-[56px] ${
        isCollapsed ? "md:ml-16" : "md:ml-[260px]"
      }`}>
        <Header
          currentUser={currentUser}
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

      <BugReportButton />
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
      <AppShellInner data={data}>
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
