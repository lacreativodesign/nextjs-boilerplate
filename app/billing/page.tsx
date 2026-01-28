"use client";

import Link from "next/link";
import RequireAuth from "@/components/RequireAuth";
import { useTenantContext } from "@/lib/tenant/useTenantContext";
import { getSubscriptionBannerCopy, isNonActiveSubscription } from "@/lib/subscription";

const ALL_ROLES = [
  "admin",
  "super_admin",
  "sales",
  "sales_manager",
  "am",
  "am_manager",
  "finance",
  "production",
  "production_manager",
  "hr",
  "client",
];

export default function BillingPage() {
  const { data } = useTenantContext();
  const role = data?.user?.role || "";
  const subscriptionState = data?.tenant?.subscriptionState || "active";
  const bannerCopy = getSubscriptionBannerCopy(subscriptionState);

  return (
    <RequireAuth allowed={ALL_ROLES}>
      <div className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-6 px-6 py-12">
        <div>
          <h1 className="text-2xl font-semibold">Billing & Subscription</h1>
          <p className="text-sm text-[var(--text-muted)]">
            Review your subscription status and update payment details.
          </p>
        </div>

        {isNonActiveSubscription(subscriptionState) ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-900">
            <div className="text-sm font-semibold">{bannerCopy.title}</div>
            <div className="mt-1 text-sm text-amber-800">{bannerCopy.message}</div>
          </div>
        ) : null}

        {role === "client" ? (
          <Link
            href="/client/billing"
            className="w-fit rounded-full bg-[var(--erp-blue)] px-5 py-2 text-sm font-semibold text-white"
          >
            Go to billing portal
          </Link>
        ) : (
          <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-5 text-sm">
            Contact your account owner or finance admin to update the subscription.
          </div>
        )}
      </div>
    </RequireAuth>
  );
}
