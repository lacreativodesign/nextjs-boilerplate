"use client";

import { useEffect, useState } from "react";
import { getRoleRoute } from "@/lib/roleRouting";
import { useTenantContext } from "@/lib/tenant/useTenantContext";

export default function UnauthorizedPage() {
  const { data, loading } = useTenantContext();
  const [destination, setDestination] = useState("/login");

  useEffect(() => {
    if (!loading) {
      setDestination(getRoleRoute(data?.user?.role));
    }
  }, [data?.user?.role, loading]);

  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
      <div className="card" style={{ maxWidth: 560, textAlign: "center", padding: 28 }}>
        <h1 style={{ fontSize: 30, marginTop: 0 }}>Unauthorized</h1>
        <p style={{ color: "var(--text-muted)" }}>
          You are signed in, but your role is not permitted to access this route.
        </p>
        <button className="btn" onClick={() => (window.location.href = destination)} disabled={loading}>
          Go to my dashboard
        </button>
      </div>
    </div>
  );
}
