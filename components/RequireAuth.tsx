"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { auth } from "@/lib/firebaseClient";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebaseClient";

export default function RequireAuth({ children, allowed }) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.push("/login");
        return;
      }

      // Fetch role from Firestore
      const userRef = doc(db, "users", user.uid);
      const snap = await getDoc(userRef);

      if (!snap.exists()) {
        router.push("/login");
        return;
      }

      const role = snap.data().role;

      // Allowed roles check
      if (!allowed.includes(role)) {
        router.push("/login");
        return;
      }

      setLoading(false);
    });

    return () => unsub();
  }, []);

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: "center" }}>
        Checking access…
      </div>
    );
  }

  return children;
}
