"use client";

import React, { useEffect, useMemo, useState } from "react";
import { fetchUserRole, getFirebaseAuth } from "@/lib/firebaseClient";
import { onAuthStateChanged } from "firebase/auth";
import { useRouter } from "next/navigation";
import type { Unsubscribe } from "firebase/auth";
import SubscriptionBanner from "@/components/SubscriptionBanner";
import { normalizeRole } from "@/lib/erpAccess";
import SessionTimeoutModal from "@/components/auth/SessionTimeoutModal";
import { useSessionTimeout } from "@/lib/hooks/useSessionTimeout";

type Props = {
  allowed: string[];
  children: React.ReactNode;
};

export default function RequireAuth({ allowed, children }: Props) {
  const [ready, setReady] = useState(false);
  const [ok, setOk] = useState(false);
  const router = useRouter();
  const allowedRoles = useMemo(() => allowed.map((role) => normalizeRole(role)).filter(Boolean), [allowed]);
  const { showTimeoutWarning, timeRemaining, extendSession, logout } = useSessionTimeout();

  useEffect(() => {
    let unsub: Unsubscribe | null = null;
    let cancelled = false;

    getFirebaseAuth()
      .then((auth) => {
        if (cancelled) return;
        unsub = onAuthStateChanged(auth, async (user) => {
          if (!user) {
            router.replace("/login");
            setReady(true);
            return;
          }

          const role = normalizeRole(await fetchUserRole(user.uid));

          if (role === "super_admin") {
            setOk(true);
            setReady(true);
            return;
          }

          if (!role || !allowedRoles.includes(role)) {
            router.replace(role ? "/unauthorized" : "/login");
            setReady(true);
            return;
          }

          setOk(true);
          setReady(true);
        });
      })
      .catch((err) => {
        console.error("Failed to load Firebase auth", err);
        router.replace("/login");
        setReady(true);
      });

    return () => {
      cancelled = true;
      if (unsub) unsub();
    };
  }, [allowedRoles, router]);

  if (!ready) return <div style={{ padding: 24 }}>Loading…</div>;
  if (!ok) return null;

  return (
    <>
      <SessionTimeoutModal
        open={showTimeoutWarning}
        timeRemaining={timeRemaining}
        onStayLoggedIn={extendSession}
        onLogout={logout}
      />
      <SubscriptionBanner />
      {children}
    </>
  );
}
