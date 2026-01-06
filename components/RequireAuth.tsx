"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  allowed: string[];
  children: React.ReactNode;
};

export default function RequireAuth({ allowed, children }: Props) {
  const [ready, setReady] = useState(false);
  const [ok, setOk] = useState(false);
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;

    async function checkAccess() {
      try {
        const res = await fetch("/api/tenant/context", { cache: "no-store", credentials: "include" });
        const data = await res.json().catch(() => null);
        if (!res.ok || !data?.ok) {
          router.replace("/login");
          return;
        }

        const role = String(data?.user?.role || "").toLowerCase();
        if (!role || !allowed.includes(role)) {
          router.replace("/forbidden");
          return;
        }

        if (!cancelled) {
          setOk(true);
        }
      } catch (err) {
        console.error("RequireAuth access check failed", err);
        router.replace("/login");
      } finally {
        if (!cancelled) {
          setReady(true);
        }
      }
    }

    checkAccess();
    return () => {
      cancelled = true;
    };
  }, [allowed, router]);

  if (!ready) return <div style={{ padding: 24 }}>Loading…</div>;
  if (!ok) return null;

  return <>{children}</>;
}
