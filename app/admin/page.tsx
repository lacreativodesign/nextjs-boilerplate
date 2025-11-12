"use client";

import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth, fetchUserRole } from "@/lib/firebaseClient";

export default function AdminPage() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const unsub = onAuthStateChanged(auth, async (user) => {
      if (cancelled) return;

      // Not signed in → go to login host
      if (!user) {
        window.location.replace("https://login.lacreativo.com/login");
        return;
      }

      try {
        const role = await fetchUserRole(user.uid);

        // Wrong role → send to their dashboard (NO default to client here)
        if (role !== "admin") {
          window.location.replace(`https://dashboard.lacreativo.com/${role || ""}`);
          return;
        }

        // Correct role → render and DO NOT redirect again
        setReady(true);
      } catch {
        window.location.replace("https://login.lacreativo.com/login");
      }
    });

    return () => {
      cancelled = true;
      unsub();
    };
  }, []);

  if (!ready) return null;

  // ---- Your real Admin UI goes below ----
  return (
    <div style={{ padding: 24 }}>
      <h1>Admin Dashboard</h1>
      {/* render your locked admin content here */}
    </div>
  );
}
