"use client";

import { useEffect, useState } from "react";
import type { SubscriptionState } from "@/lib/subscription";

export type TenantContext = {
  id: string;
  name: string;
  slug: string;
  status: "active" | "suspended";
  brand: { name: string; logoUrl: string | null; locked: boolean } | null;
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
          throw new Error((json as any)?.error || res.statusText || "Failed to load tenant");
        }
        if (active) setData(json);
      } catch (err: any) {
        if (active) setError(err?.message || "Failed to load tenant");
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
