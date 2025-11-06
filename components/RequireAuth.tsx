"use client";

import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { getUserRole } from "@/lib/auth";
import { useRouter } from "next/navigation";

export default function RequireAuth({ children, allowed }) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [access, setAccess] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

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
        setAccess(true);
      } else {
        router.replace("/denied");
      }

      setLoading(false);
    });

    return () => unsub();
  }, [allowed, router]);

  if (loading) return null;
  return access ? children : null;
}
