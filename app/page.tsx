// app/page.tsx
"use client";

import { useEffect } from "react";

export default function RootRedirect() {
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/me", { credentials: "include" });
        if (!res.ok) {
          window.location.href = "/login";
          return;
        }
        const me = await res.json();
        const routes: Record<string, string> = {
          admin: "/admin",
          sales: "/sales",
          am: "/am",
          hr: "/hr",
          production: "/production",
          client: "/client",
          finance: "/finance",
        };
        const dest = routes[me.role] || "/client";
        window.location.href = dest;
      } catch {
        window.location.href = "/login";
      }
    })();
  }, []);

  return null;
}
