"use client";
import React, { useEffect, useState } from "react";
import { auth, fetchUserRole } from "@/lib/firebaseClient";
import { onAuthStateChanged } from "firebase/auth";
import { useRouter } from "next/navigation";

type Props = {
  allowed: string[]; // e.g. ["admin"] or ["sales","admin"]
  children: React.ReactNode;
};

export default function RequireAuth({ allowed, children }: Props) {
  const [ready, setReady] = useState(false);
  const [ok, setOk] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.replace("/login");
        setReady(true);
        setOk(false);
        return;
      }
      const role = await fetchUserRole(user.uid);
      if (!role || !allowed.includes(role)) {
        // If logged in but wrong role → send them to their own dashboard
        switch (role) {
          case "admin":
            router.replace("/admin");
            break;
          case "sales":
            router.replace("/sales");
            break;
          case "am":
            router.replace("/am");
            break;
          case "client":
            router.replace("/client");
            break;
          case "production":
            router.replace("/production");
            break;
          case "hr":
            router.replace("/hr");
            break;
          case "finance":
            router.replace("/finance");
            break;
          default:
            router.replace("/login");
        }
        setReady(true);
        setOk(false);
        return;
      }
      setOk(true);
      setReady(true);
    });
    return () => unsub();
  }, [router, allowed]);

  if (!ready) return <div style={{ padding: 24 }}>Loading…</div>;
  if (!ok) return null;
  return <>{children}</>;
}
