"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type StripeConnectState = {
  enabled?: boolean;
  accountId?: string | null;
  accountEmail?: string | null;
  status?: "connected" | "disconnected";
  connectedAt?: string | null;
  disconnectedAt?: string | null;
};

type TenantContext = {
  tenant?: {
    id: string;
    name: string;
    modules?: Record<string, boolean>;
    stripeConnect?: StripeConnectState | null;
  } | null;
};

export default function SettingsPaymentsPage() {
  const [context, setContext] = useState<TenantContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadContext = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/tenant/context", { credentials: "include", cache: "no-store" });
    const data = (await res.json().catch(() => null)) as TenantContext | null;
    setContext(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadContext();
  }, [loadContext]);

  const stripeConnect = context?.tenant?.stripeConnect || null;
  const moduleEnabled = context?.tenant?.modules?.client_stripe_connect !== false;

  const statusLabel = useMemo(() => {
    if (!moduleEnabled) return "Locked";
    if (stripeConnect?.status === "connected") return "Connected";
    return "Disconnected";
  }, [moduleEnabled, stripeConnect?.status]);

  const startConnect = useCallback(() => {
    setError(null);
    if (!moduleEnabled) return;
    const form = document.createElement("form");
    form.method = "POST";
    form.action = "/api/stripe/connect/start";
    document.body.appendChild(form);
    form.submit();
  }, [moduleEnabled]);

  const disconnect = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/stripe/connect/disconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        setError(payload?.error || "Unable to disconnect.");
      }
      await loadContext();
    } finally {
      setBusy(false);
    }
  }, [loadContext]);

  return (
    <div style={{ maxWidth: 720 }}>
      <h2 style={{ fontSize: 24, fontWeight: 600, color: "#111827" }}>Payments</h2>
      <p style={{ marginTop: 8, color: "#6b7280", fontSize: 15 }}>
        Connect your Stripe account to collect payments directly into your own Stripe account.
      </p>

      <div
        style={{
          marginTop: 24,
          background: "#fff",
          borderRadius: 16,
          padding: 24,
          border: "1px solid #e5e7eb",
          boxShadow: "0 6px 16px rgba(15, 23, 42, 0.05)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#111827" }}>Stripe Connect</div>
            <div style={{ marginTop: 6, color: "#6b7280", fontSize: 14 }}>
              Status:{" "}
              <span style={{ fontWeight: 600, color: moduleEnabled ? "#111827" : "#9ca3af" }}>
                {loading ? "Loading..." : statusLabel}
              </span>
            </div>
            {stripeConnect?.status === "connected" && (
              <div style={{ marginTop: 6, color: "#6b7280", fontSize: 14 }}>
                Connected account:{" "}
                <span style={{ fontWeight: 600, color: "#111827" }}>
                  {stripeConnect?.accountEmail || "Stripe account linked"}
                </span>
              </div>
            )}
            {!moduleEnabled && (
              <div style={{ marginTop: 10, color: "#ef4444", fontSize: 13, fontWeight: 600 }}>
                Module disabled by super admin. Contact Bizosto to enable.
              </div>
            )}
          </div>

          <div style={{ display: "flex", gap: 12 }}>
            {stripeConnect?.status === "connected" ? (
              <button
                onClick={disconnect}
                disabled={!moduleEnabled || busy}
                style={{
                  padding: "10px 18px",
                  borderRadius: 10,
                  border: "1px solid #ef4444",
                  background: "transparent",
                  color: "#ef4444",
                  fontWeight: 600,
                  cursor: moduleEnabled ? "pointer" : "not-allowed",
                }}
              >
                {busy ? "Disconnecting..." : "Disconnect Stripe"}
              </button>
            ) : (
              <button
                onClick={startConnect}
                disabled={!moduleEnabled || busy}
                style={{
                  padding: "10px 18px",
                  borderRadius: 10,
                  border: "none",
                  background: moduleEnabled ? "#111827" : "#e5e7eb",
                  color: moduleEnabled ? "#fff" : "#9ca3af",
                  fontWeight: 600,
                  cursor: moduleEnabled ? "pointer" : "not-allowed",
                }}
              >
                {busy ? "Please wait..." : "Connect Stripe"}
              </button>
            )}
          </div>
        </div>

        {error && (
          <div style={{ marginTop: 16, color: "#ef4444", fontSize: 14, fontWeight: 600 }}>
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
