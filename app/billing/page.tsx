"use client";

import { useEffect, useMemo, useState } from "react";
import RequireAuth from "@/components/RequireAuth";
import { plans, type BillingPlanKey } from "@/lib/billing/plans";

type SubscriptionResponse = {
  plan?: BillingPlanKey;
  status?: string;
  currentPeriodEnd?: string | null;
  cancelAtPeriodEnd?: boolean;
};

type InvoiceRecord = {
  id: string;
  amount?: number;
  currency?: string;
  status?: string;
  periodStart?: string | null;
  periodEnd?: string | null;
  pdfUrl?: string | null;
};

type UsageRecord = {
  api_calls: number;
  storage: number;
  users: number;
};

const ALL_ROLES = [
  "admin",
  "super_admin",
  "finance",
  "sales",
  "sales_manager",
  "am",
  "am_manager",
  "production",
  "production_manager",
  "hr",
  "client",
];

export default function BillingPage() {
  const [subscription, setSubscription] = useState<SubscriptionResponse | null>(null);
  const [usage, setUsage] = useState<UsageRecord>({ api_calls: 0, storage: 0, users: 0 });
  const [invoices, setInvoices] = useState<InvoiceRecord[]>([]);
  const [paymentMethodId, setPaymentMethodId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const activePlan: BillingPlanKey = (subscription?.plan || "starter") as BillingPlanKey;

  const usageView = useMemo(() => {
    const limit = plans[activePlan].limits;
    return [
      { key: "users", label: "Users", used: usage.users, limit: limit.users },
      { key: "storage", label: "Storage (bytes)", used: usage.storage, limit: limit.storage },
      { key: "api_calls", label: "API Calls", used: usage.api_calls, limit: limit.api_calls },
    ];
  }, [activePlan, usage]);

  const load = async () => {
    const [subRes, usageRes, invoicesRes] = await Promise.all([
      fetch("/api/billing/subscription", { cache: "no-store" }),
      fetch("/api/billing/usage", { cache: "no-store" }),
      fetch("/api/billing/invoices", { cache: "no-store" }),
    ]);

    const subJson = await subRes.json();
    const usageJson = await usageRes.json();
    const invoicesJson = await invoicesRes.json();

    if (subJson.ok) setSubscription(subJson.subscription || null);
    if (usageJson.ok) setUsage(usageJson.usage || { api_calls: 0, storage: 0, users: 0 });
    if (invoicesJson.ok) setInvoices(invoicesJson.invoices || []);
  };

  useEffect(() => {
    void load();
  }, []);

  async function subscribe(plan: BillingPlanKey) {
    setBusy(true);
    setError("");
    setSuccess("");
    const res = await fetch("/api/billing/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan }),
    });
    const json = await res.json();
    setBusy(false);
    if (!json.ok) return setError(json.error || "Subscribe failed");
    setSuccess(`Subscribed to ${plans[plan].name}`);
    void load();
  }

  async function changePlan(plan: BillingPlanKey) {
    setBusy(true);
    setError("");
    setSuccess("");
    const res = await fetch("/api/billing/subscription/change", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan }),
    });
    const json = await res.json();
    setBusy(false);
    if (!json.ok) return setError(json.error || "Plan change failed");
    setSuccess(`Plan changed to ${plans[plan].name}`);
    void load();
  }

  async function cancel(immediate: boolean) {
    if (!window.confirm(immediate ? "Cancel immediately?" : "Cancel at period end?")) return;

    setBusy(true);
    setError("");
    setSuccess("");

    const res = await fetch("/api/billing/subscription/cancel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ immediate }),
    });
    const json = await res.json();
    setBusy(false);
    if (!json.ok) return setError(json.error || "Cancel failed");
    setSuccess(immediate ? "Subscription canceled immediately" : "Subscription will cancel at period end");
    void load();
  }

  async function updatePaymentMethod() {
    setBusy(true);
    setError("");
    setSuccess("");

    const res = await fetch("/api/billing/payment-method", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paymentMethodId }),
    });

    const json = await res.json();
    setBusy(false);
    if (!json.ok) return setError(json.error || "Payment method update failed");
    setSuccess("Payment method updated");
    setPaymentMethodId("");
  }

  return (
    <RequireAuth allowed={ALL_ROLES}>
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-6 px-6 py-8">
        <header>
          <h1 className="text-2xl font-semibold">Billing & Subscription</h1>
          <p className="text-sm text-[var(--text-muted)]">Manage subscription, payment methods, invoices, and usage metering.</p>
        </header>

        {error ? <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}
        {success ? <div className="rounded border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{success}</div> : null}

        <section className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-5">
          <h2 className="mb-4 text-lg font-semibold">Current Subscription</h2>
          <div className="grid gap-2 text-sm md:grid-cols-4">
            <div>
              <div className="text-[var(--text-muted)]">Plan</div>
              <div className="font-medium">{plans[activePlan].name}</div>
            </div>
            <div>
              <div className="text-[var(--text-muted)]">Status</div>
              <div className="font-medium">{subscription?.status || "Not subscribed"}</div>
            </div>
            <div>
              <div className="text-[var(--text-muted)]">Renewal</div>
              <div className="font-medium">{subscription?.currentPeriodEnd || "-"}</div>
            </div>
            <div>
              <div className="text-[var(--text-muted)]">Cancel at period end</div>
              <div className="font-medium">{subscription?.cancelAtPeriodEnd ? "Yes" : "No"}</div>
            </div>
          </div>

          <div className="mt-4 flex gap-3">
            <button disabled={busy} onClick={() => cancel(false)} className="rounded bg-amber-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60">
              Cancel at period end
            </button>
            <button disabled={busy} onClick={() => cancel(true)} className="rounded bg-red-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60">
              Cancel immediately
            </button>
          </div>
        </section>

        <section className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-5">
          <h2 className="mb-4 text-lg font-semibold">Pricing & Plan Comparison</h2>
          <div className="grid gap-4 md:grid-cols-3">
            {(Object.keys(plans) as BillingPlanKey[]).map((key) => {
              const plan = plans[key];
              const isCurrent = activePlan === key;
              return (
                <div key={key} className={`rounded border p-4 ${isCurrent ? "border-[var(--erp-blue)]" : "border-[var(--border-subtle)]"}`}>
                  <div className="text-lg font-semibold">{plan.name}</div>
                  <div className="mt-1 text-2xl font-bold">${plan.price}/mo</div>
                  <ul className="mt-3 list-disc pl-5 text-sm text-[var(--text-muted)]">
                    {plan.features.map((feature) => (
                      <li key={feature}>{feature}</li>
                    ))}
                  </ul>
                  <div className="mt-4 flex gap-2">
                    <button
                      disabled={busy || isCurrent}
                      onClick={() => (subscription?.status ? changePlan(key) : subscribe(key))}
                      className="rounded bg-[var(--erp-blue)] px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
                    >
                      {isCurrent ? "Current" : subscription?.status ? "Change Plan" : "Subscribe"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-5">
          <h2 className="mb-4 text-lg font-semibold">Payment Method</h2>
          <div className="flex flex-col gap-3 md:flex-row">
            <input
              value={paymentMethodId}
              onChange={(e) => setPaymentMethodId(e.target.value)}
              placeholder="Stripe payment method id (pm_...)"
              className="w-full rounded border border-[var(--border-subtle)] bg-transparent px-3 py-2 text-sm"
            />
            <button disabled={busy || !paymentMethodId.trim()} onClick={updatePaymentMethod} className="rounded bg-[var(--erp-blue)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60">
              Update payment method
            </button>
          </div>
        </section>

        <section className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-5">
          <h2 className="mb-4 text-lg font-semibold">Usage Dashboard</h2>
          <div className="grid gap-3 md:grid-cols-3">
            {usageView.map((row) => {
              const pct = row.limit < 0 ? 0 : Math.round((row.used / row.limit) * 100);
              const warn = row.limit > 0 && pct >= 80;
              const blocked = row.limit > 0 && row.used >= row.limit;
              return (
                <div key={row.key} className={`rounded border p-3 ${blocked ? "border-red-300 bg-red-50" : warn ? "border-amber-300 bg-amber-50" : "border-[var(--border-subtle)]"}`}>
                  <div className="text-sm text-[var(--text-muted)]">{row.label}</div>
                  <div className="mt-1 text-lg font-semibold">
                    {row.used} / {row.limit < 0 ? "Unlimited" : row.limit}
                  </div>
                  {warn ? <div className="mt-1 text-xs font-medium text-amber-700">Usage warning: above 80%</div> : null}
                  {blocked ? <div className="mt-1 text-xs font-medium text-red-700">Limit reached. Upgrade required.</div> : null}
                </div>
              );
            })}
          </div>
        </section>

        <section className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-5">
          <h2 className="mb-4 text-lg font-semibold">Billing History</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--border-subtle)] text-[var(--text-muted)]">
                  <th className="py-2">Invoice</th>
                  <th className="py-2">Amount</th>
                  <th className="py-2">Status</th>
                  <th className="py-2">Period</th>
                  <th className="py-2">PDF</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((invoice) => (
                  <tr key={invoice.id} className="border-b border-[var(--border-subtle)]">
                    <td className="py-2">{invoice.id}</td>
                    <td className="py-2">{invoice.amount || 0} {invoice.currency || "USD"}</td>
                    <td className="py-2">{invoice.status || "unknown"}</td>
                    <td className="py-2">{invoice.periodStart || "-"} → {invoice.periodEnd || "-"}</td>
                    <td className="py-2">
                      {invoice.pdfUrl ? (
                        <a href={invoice.pdfUrl} target="_blank" rel="noreferrer" className="text-[var(--erp-blue)] underline">
                          Download
                        </a>
                      ) : (
                        "-"
                      )}
                    </td>
                  </tr>
                ))}
                {invoices.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-4 text-center text-[var(--text-muted)]">
                      No invoices yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </RequireAuth>
  );
}
