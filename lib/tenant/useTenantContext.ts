"use client";

import { useEffect, useState } from "react";
import { toastError } from "@/lib/toast";
import type { SubscriptionState } from "@/lib/subscription";

export type TenantContext = {
  id: string;
  name: string;
  slug: string;
  status: "active" | "suspended";
  brand: { name: string; logoUrl: string | null; locked: boolean } | null;
  whiteLabel?: {
    logoUrl: string | null;
    primaryColor: string;
    secondaryColor: string;
    accentColor: string;
    fontFamily: string;
    themeMode: "light" | "dark" | "system";
    emailBranding: {
      fromName: string;
      fromEmail: string;
      emailFooter: string;
      status: "pending" | "verified";
      spfValid: boolean;
      dkimValid: boolean;
      verifiedAt: string | null;
    };
    customDomains: Array<{
      domain: string;
      status: "pending" | "verified";
      verificationToken: string;
      verifiedAt: string | null;
    }>;
  } | null;
  modulesEnabled: Record<string, boolean>;
  plan?: "starter" | "pro" | "enterprise";
  modules?: Record<string, boolean>;
  subscriptionState?: SubscriptionState;
};

export type TenantContextResponse = {
  ok: boolean;
  user: {
    uid: string;
    role: string;
    tenantId: string;
    status: string;
    displayName: string | null;
    email: string | null;
    language?: string | null;
    locale?: string | null;
  };
  tenant: TenantContext | null;
};

export function useTenantContext() {
  const [data, setData] = useState<TenantContextResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const res = await fetch("/api/tenant/context", {
          cache: "no-store",
          credentials: "include",
        });
        const json = (await res.json().catch(() => null)) as TenantContextResponse | null;
        if (!res.ok || !json?.ok) {
          const requestError = new Error((json as any)?.error || res.statusText || "Failed to load tenant") as Error & {
            status?: number;
          };
          requestError.status = res.status;
          throw requestError;
        }
        if (active) setData(json);
      } catch (err: any) {
        if (active) {
          const message = err?.message || "Failed to load tenant";
          setError(message);

          // Only show toast for non-auth errors to avoid noise for super_admin
          if (
            !message.includes("Unauthorized") &&
            !message.includes("Session expired") &&
            !message.includes("expired")
          ) {
            toastError(`Unable to load tenant context. ${message}`);
          }
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    load();
    return () => {
      active = false;
    };
  }, []);

  return { data, loading, error };
}
