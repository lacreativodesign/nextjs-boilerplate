"use client";

import { useEffect, useMemo, useState } from "react";
import { attachForegroundNotifications, registerFcmToken, requestPushPermission } from "@/lib/pwa/push";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

function InstallPromptBanner({ onInstall }: { onInstall: () => Promise<void> }) {
  return (
    <div className="fixed inset-x-4 bottom-24 z-50 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-4 shadow-[var(--shadow-md)] md:inset-x-auto md:right-6 md:w-[360px]">
      <p className="text-sm font-semibold text-[var(--text-primary)]">Install Bizosto app</p>
      <p className="mt-1 text-xs text-[var(--text-muted)]">Install Bizosto for offline access, faster loading, and push notifications.</p>
      <button className="mt-3 min-h-11 w-full rounded-lg bg-[var(--erp-blue)] px-4 py-2 text-sm font-semibold text-white" onClick={() => void onInstall()}>
        Install app
      </button>
    </div>
  );
}

function OfflineIndicator({ offline }: { offline: boolean }) {
  if (!offline) return null;
  return <div className="fixed inset-x-0 top-0 z-[60] bg-amber-500 px-4 py-2 text-center text-xs font-semibold text-white">Offline mode enabled</div>;
}

function NotificationPermissionPrompt({ canAsk, onEnable }: { canAsk: boolean; onEnable: () => Promise<void> }) {
  if (!canAsk) return null;
  return (
    <div className="fixed inset-x-4 bottom-4 z-50 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-4 shadow-[var(--shadow-md)] md:inset-x-auto md:left-6 md:w-[360px]">
      <p className="text-sm font-semibold text-[var(--text-primary)]">Enable push notifications</p>
      <button className="mt-3 min-h-11 w-full rounded-lg border border-[var(--input-border)] px-4 py-2 text-sm font-semibold text-[var(--text-primary)]" onClick={() => void onEnable()}>
        Enable notifications
      </button>
    </div>
  );
}

export default function PWAInitializer() {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [offline, setOffline] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>("default");

  useEffect(() => {
    if (typeof window === "undefined") return;

    setOffline(!navigator.onLine);
    if ("Notification" in window) {
      setPermission(Notification.permission);
    }

    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as BeforeInstallPromptEvent);
    };

    const onOnline = () => setOffline(false);
    const onOffline = () => setOffline(true);

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    let unsubscribe = () => undefined;

    void navigator.serviceWorker
      .register("/sw.js")
      .then(async (registration) => {
        if (permission === "granted") {
          await registerFcmToken(registration);
        }

        unsubscribe = await attachForegroundNotifications((title, body, href) => {
          if (document.visibilityState === "visible") {
            void registration.showNotification(title, {
              body,
              icon: "/icons/icon-192.svg",
              badge: "/icons/icon-192.svg",
              data: { url: href || "/" },
            });
          }

          const nav = navigator as Navigator & { setAppBadge?: (count?: number) => Promise<void> };
          if (typeof nav.setAppBadge === "function") {
            nav.setAppBadge(1).catch(() => undefined);
          }
        });
      })
      .catch((error) => {
        console.error("service worker registration failed", error);
      });

    return () => {
      unsubscribe();
    };
  }, [permission]);

  const canRequestPermission = useMemo(() => permission === "default", [permission]);

  const handleInstall = async () => {
    if (!installEvent) return;
    await installEvent.prompt();
    const choice = await installEvent.userChoice;
    if (choice.outcome === "accepted") {
      setInstallEvent(null);
    }
  };

  const handleEnableNotifications = async () => {
    const granted = await requestPushPermission();
    setPermission(granted);
  };

  return (
    <>
      <OfflineIndicator offline={offline} />
      {installEvent ? <InstallPromptBanner onInstall={handleInstall} /> : null}
      <NotificationPermissionPrompt canAsk={canRequestPermission} onEnable={handleEnableNotifications} />
    </>
  );
}
