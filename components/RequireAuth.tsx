"use client";

import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { getUserRole } from "@/lib/auth";
import { useRouter } from "next/navigation";

// ✅ Prevent server crash by running ONLY on the client
export default function RequireAuth({ children, allowed }: { children: any; allowed: string[] }) {
  const router = useRouter();
  const [check, setCheck] = useState(true);
  const [okay, setOkay] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return; // ✅ NEVER run on server

    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.replace("/login");
        return;
      }

      const role = await getUserRole(user.uid);

      if (!role) {
        router.replace("/login");
        return;
      }

      if (allowed.includes(role)) {
        setOkay(true);
      } else {
        router.replace("/denied");
      }

      setCheck(false);
    });

    return () => unsub();
  }, [router, allowed]);

  if (check) return null;

  return okay ? children : null;
}
