"use client";

import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { getUserRole } from "@/lib/auth";
import { useRouter } from "next/navigation";

export default function RequireAuth({ children, allowed }: { children: any; allowed: string[] }) {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [allowedView, setAllowedView] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.replace("/");
        return;
      }

      const role = await getUserRole(user.uid);

      if (!role) {
        router.replace("/");
        return;
      }

      if (allowed.includes(role)) {
        setAllowedView(true);
      } else {
        router.replace(`/denied`);
      }

      setChecking(false);
    });

    return () => unsub();
  }, [router, allowed]);

  if (checking) return <div>Loading...</div>;

  return allowedView ? children : null;
}
