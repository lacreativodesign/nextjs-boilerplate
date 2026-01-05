"use client";

import { useEffect, useState } from "react";
import { getRoleRoute } from "@/lib/roleRouting";
import { useTenantContext } from "@/lib/tenant/useTenantContext";

export default function ForbiddenPage() {
  const { data, loading, error } = useTenantContext();
  const [destination, setDestination] = useState("/login");

  useEffect(() => {
    if (error === "Tenant suspended" || data?.tenant?.status === "suspended") {
      window.location.href = "/suspended";
      return;
    }
    if (!loading) {
      setDestination(getRoleRoute(data?.user?.role));
    }
  }, [data?.tenant?.status, data?.user?.role, error, loading]);

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 32,
      }}
    >
      <div
        className="card"
        style={{
          maxWidth: 520,
          padding: 32,
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: 28, fontWeight: 700, marginBottom: 12 }}>Access Denied</div>
        <p style={{ color: "var(--text-muted)", margin: 0 }}>
          You do not have access to this module. If you believe this is a mistake, contact your administrator.
        </p>
        <div style={{ height: 20 }} />
        <button className="btn" onClick={() => (window.location.href = destination)} disabled={loading}>
          Go to my dashboard
        </button>
      </div>
    </div>
  );
}
