"use client";

import Link from "next/link";
import { useState } from "react";
import { X } from "lucide-react";
import { useTenantContext } from "@/lib/tenant/useTenantContext";
import { getSubscriptionBannerCopy, isNonActiveSubscription } from "@/lib/subscription";
import { Skeleton } from "@/components/ui/Skeleton";

const BILLING_PATH = "/billing";

export default function SubscriptionBanner() {
  const { data, loading } = useTenantContext();
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  if (loading && data === null) return null;
  if (loading) {
    return (
      <div className="sticky top-0 z-30 w-full border-b border-[var(--border-subtle)] bg-[var(--surface-card)]/80 backdrop-blur-sm">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-3 px-4 py-2">
          <Skeleton variant="text" className="h-4 w-1/3" />
          <Skeleton variant="text" className="h-6 w-24 rounded-full" />
        </div>
      </div>
    );
  }

  const subscriptionState = data?.tenant?.subscriptionState || "active";
  const role = data?.user?.role || "";

  // super_admin never sees subscription/trial banners
  if (role === "super_admin") {
    return null;
  }

  // Billing-issue (non-active) states take precedence — amber banner.
  if (isNonActiveSubscription(subscriptionState)) {
    const { title, message } = getSubscriptionBannerCopy(subscriptionState);

    return (
      <div className="sticky top-0 z-30 w-full border-b border-amber-200 bg-amber-50 text-amber-900">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-2 px-4 py-1.5 text-sm">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="font-semibold">{title}</span>
            {message ? <span className="text-amber-800">{message}</span> : null}
          </div>
          <div className="flex flex-shrink-0 items-center gap-2">
            <Link
              href={BILLING_PATH}
              className="rounded-full border border-amber-300 bg-white px-3 py-0.5 text-xs font-semibold text-amber-900 transition hover:bg-amber-100"
            >
              Review billing
            </Link>
            <button
              type="button"
              onClick={() => setDismissed(true)}
              aria-label="Dismiss banner"
              className="flex h-6 w-6 items-center justify-center rounded-full text-amber-700 transition hover:bg-amber-100"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Trial tenants (full access, but show a countdown nudge) — blue banner.
  const isTrial = data?.tenant?.isTrial ?? false;
  const trialEndsAt = data?.tenant?.trialEndsAt ?? null;

  if (isTrial) {
    const daysLeft = trialEndsAt
      ? Math.max(0, Math.ceil((new Date(trialEndsAt).getTime() - Date.now()) / 86400000))
      : null;
    const message =
      daysLeft !== null
        ? `${daysLeft} ${daysLeft === 1 ? "day" : "days"} left — upgrade anytime to keep your data flowing.`
        : "Upgrade anytime to keep your data flowing.";

    return (
      <div className="sticky top-0 z-30 w-full border-b border-blue-200 bg-blue-50 text-blue-900">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-2 px-4 py-1.5 text-sm">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="font-semibold">Free trial</span>
            <span className="text-blue-800">{message}</span>
          </div>
          <div className="flex flex-shrink-0 items-center gap-2">
            <Link
              href={BILLING_PATH}
              className="rounded-full border border-blue-300 bg-white px-3 py-0.5 text-xs font-semibold text-blue-900 transition hover:bg-blue-100"
            >
              Upgrade
            </Link>
            <button
              type="button"
              onClick={() => setDismissed(true)}
              aria-label="Dismiss banner"
              className="flex h-6 w-6 items-center justify-center rounded-full text-blue-700 transition hover:bg-blue-100"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
