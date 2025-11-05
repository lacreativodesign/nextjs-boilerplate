"use client";

import React, { useEffect, useState } from "react";
import { auth, fetchUserRole } from "@/lib/firebaseClient";
import { onAuthStateChanged } from "firebase/auth";
import { useRouter } from "next/navigation";

type Props = {
  allowed: string[];
  children: React.ReactNode;
};

export default function RequireAuth({ allowed, children }: Props) {
  const [checking, setChecking] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      // ✅ 1 — User not logged in → send to login
      if (!user) {
        setAuthorized(false);
        setChecking(false);
        router.replace("/login");
        return;
      }

      try {
        // ✅ 2 — Fetch user role from Firestore
        const role = await fetchUserRole(user.uid);

        if (!role) {
          // No role assigned → send to login
          setAuthorized(false);
          setChecking(false);
          router.replace("/login");
          return;
        }

        // ✅ 3 — Allowed role → display page
        if (allowed.includes(role)) {
          setAuthorized(true);
          setChecking(false);
          return;
        }

        // ✅ 4 — Wrong role → redirect them to THEIR dashboard
        const redirectMap: Record<string, string> = {
          admin: "/admin",
          sales: "/sales",
          am: "/am",
          client: "/client",
          production: "/production",
          hr: "/hr",
          finance: "/finance",
        };

        const destination = redirectMap[role] ?? "/login";

        setAuthorized(false);
        setChecking(false);
        router.replace(destination);
      } catch (err) {
        console.error("RequireAuth error:", err);
        setAuthorized(false);
        setChecking(false);
        router.replace("/login");
      }
    });

    return () => unsub();
  }, [allowed, router]);

  // ✅ Prevents flicker & weird empty UI flashes
  if (checking) {
    return <div style={{ padding: 30 }}>Checking permissions…</div>;
  }

  // ✅ If not authorized, we already redirected → render nothing
  if (!authorized) return null;

  return <>{children}</>;
}
