"use client";

import Link from "next/link";
import { useTenantContext } from "@/lib/tenant/useTenantContext";
import { getSubscriptionBannerCopy, isNonActiveSubscription } from "@/lib/subscription";
import { Skeleton } from "@/components/ui/Skeleton";

const BILLING_PATH = "/billing";

export default function SubscriptionBanner() {
  const { data, loading } = useTenantContext();

  if (loading) {
    return (
      <div className="sticky top-0 z-50 w-full border-b border-slate-200/70 bg-white/80 dark:border-slate-800 dark:bg-slate-950/60">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-3 px-4 py-3">
          <Skeleton variant="text" className="h-4 w-1/3" />
          <Skeleton variant="text" className="h-6 w-24 rounded-full" />
        </div>
      </div>
    );
  }

  const subscriptionState = data?.tenant?.subscriptionState || "active";
  const role = data?.user?.role || "";

  if (role === "super_admin" || !isNonActiveSubscription(subscriptionState)) {
    return null;
  }

  const { title, message } = getSubscriptionBannerCopy(subscriptionState);

  return (
    <div className="sticky top-0 z-50 w-full border-b border-amber-200 bg-amber-50 text-amber-900">
      <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
        <div>
          <span className="font-semibold">{title}</span>
          {message ? <span className="ml-2 text-amber-800">{message}</span> : null}
        </div>
        <Link
          href={BILLING_PATH}
          className="rounded-full border border-amber-300 bg-white px-3 py-1 text-xs font-semibold text-amber-900 transition hover:bg-amber-100"
        >
          Review billing
        </Link>
      </div>
    </div>
  );
}
