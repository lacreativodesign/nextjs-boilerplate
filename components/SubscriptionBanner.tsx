"use client";

import Link from "next/link";
import { useTenantContext } from "@/lib/tenant/useTenantContext";
import { getSubscriptionBannerCopy, isNonActiveSubscription } from "@/lib/subscription";

const BILLING_PATH = "/billing";

export default function SubscriptionBanner() {
  const { data, loading } = useTenantContext();

  if (loading) return null;

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
