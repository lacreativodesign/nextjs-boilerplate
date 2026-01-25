"use client";

import React, { useEffect, useState } from "react";
import { fetchUserRole, getFirebaseAuth } from "@/lib/firebaseClient";
import { normalizeRole } from "@/lib/roleRouting";
import { onAuthStateChanged } from "firebase/auth";
import { useRouter } from "next/navigation";
import type { Unsubscribe } from "firebase/auth";

type Props = {
  allowed: string[];
  children: React.ReactNode;
};

export default function RequireAuth({ allowed, children }: Props) {
  const [ready, setReady] = useState(false);
  const [ok, setOk] = useState(false);
  const router = useRouter();

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

          if (!role || !allowed.includes(role)) {
            if (!role) {
              router.replace("/login");
            } else {
              router.replace("/forbidden");
            }
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
  }, [allowed, router]);

  if (!ready) return <div style={{ padding: 24 }}>Loading…</div>;
  if (!ok) return null;

  return <>{children}</>;
}
