import Link from "next/link";
import { plans, type BillingPlanKey } from "@/lib/billing/plans";

export default function PricingPage() {
  return (
    <div className="mx-auto min-h-screen w-full max-w-6xl px-6 py-10">
      <h1 className="text-3xl font-semibold">Pricing</h1>
      <p className="mt-2 text-sm text-[var(--text-muted)]">Choose a plan based on team size, storage, and API throughput.</p>
      <div className="mt-8 grid gap-4 md:grid-cols-3">
        {(Object.keys(plans) as BillingPlanKey[]).map((key) => {
          const plan = plans[key];
          return (
            <div key={key} className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-5">
              <h2 className="text-xl font-semibold">{plan.name}</h2>
              <p className="mt-1 text-2xl font-bold">${plan.price}/month</p>
              <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-[var(--text-muted)]">
                {plan.features.map((feature) => (
                  <li key={feature}>{feature}</li>
                ))}
              </ul>
              <Link href="/billing" className="mt-6 inline-block rounded bg-[var(--erp-blue)] px-4 py-2 text-sm font-medium text-white">
                Manage subscription
              </Link>
            </div>
          );
        })}
      </div>
    </div>
  );
}
