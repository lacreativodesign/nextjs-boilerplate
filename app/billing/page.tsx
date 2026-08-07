'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { BillingTerminalContent } from './terminal/BillingTerminalContent';
import { plans, type BillingPlanKey } from '@/lib/billing/plans';
import { apiFetch } from '@/lib/api/client';

type BillingTab = 'subscription' | 'invoices' | 'payment-methods' | 'referrals' | 'terminal';
type SubscriptionState = 'trial' | 'active' | 'grace' | 'canceled' | 'past_due' | string;

type SubscriptionStatusResponse = {
  plan: string;
  subscriptionState: SubscriptionState;
  billingStatus: string | null;
  currentPeriodEnd: string | null;
  trialEndsAt: string | null;
};

type BillingSubscriptionResponse = {
  ok?: boolean;
  subscription?: {
    cancelAtPeriodEnd?: boolean;
    totalAmount?: number;
    subtotalAmount?: number;
    defaultPaymentMethod?: PaymentMethodSummary | null;
  };
};

type PaymentMethodSummary = {
  brand: string | null;
  last4: string | null;
  expMonth: number | null;
  expYear: number | null;
};

type BillingInvoice = {
  id: string;
  createdAt?: string;
  date?: string;
  plan?: string;
  amount?: number;
  total?: number;
  status?: string;
  pdfUrl?: string;
  invoicePdf?: string;
  hostedInvoiceUrl?: string;
};

type InvoiceResponse = { ok?: boolean; invoices?: BillingInvoice[]; error?: string };

type ReferralStatus = 'pending' | 'converted' | 'churned';

type ReferralRecord = {
  id: string;
  company: string;
  signedUp: string | null;
  daysActive: number;
  status: ReferralStatus;
  reward: number;
};

type ReferralStatsResponse = {
  ok?: boolean;
  referralCode: string;
  referralUrl: string;
  totalCreditsEarned: number;
  pendingCredits: number;
  convertedCount: number;
  pendingCount: number;
  referrals: ReferralRecord[];
  error?: string;
};

const TABS: Array<{ key: BillingTab; label: string }> = [
  { key: 'subscription', label: 'Subscription' },
  { key: 'invoices', label: 'Invoice History' },
  { key: 'payment-methods', label: 'Payment Methods' },
  { key: 'referrals', label: 'Referral Program' },
  { key: 'terminal', label: 'Payment Terminal' },
];

const PLAN_FEATURE_MATRIX = [
  '14-day free trial',
  'CRM, Sales & Project management',
  'Full Finance & Production suite',
  'Unlimited client portal seats',
  'Approvals & full Reports',
  'AI Workforce — COO, Finance & Sales agents',
  'Client Stripe Connect payments',
  'White-label options',
  'Dedicated same-day support',
];

const usdFormatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

function formatCurrency(value: number): string {
  return usdFormatter.format(Number.isFinite(value) ? value : 0);
}

function formatDate(value: string | null | undefined): string {
  if (!value) return 'Not scheduled';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function formatPlanName(value: string | null | undefined): string {
  if (!value) return 'Unknown';
  const plan = plans[value as BillingPlanKey];
  return plan?.name ?? value.replace(/_/g, ' ');
}

function getBadgeConfig(state: SubscriptionState) {
  switch (state) {
    case 'trial':
      return {
        label: 'Trial',
        cls: 'bg-[var(--surface-muted)] text-[var(--color-yellow)]',
      };
    case 'active':
      return { label: 'Active', cls: 'badge-success' };
    case 'grace':
    case 'past_due':
      return {
        label: 'Grace',
        cls: 'bg-[var(--surface-muted)] text-[var(--color-yellow)]',
      };
    case 'canceled':
    case 'hard_locked':
      return { label: 'Cancelled', cls: 'bg-[var(--surface-muted)] text-[var(--text-muted)]' };
    default:
      return {
        label: state || 'Unknown',
        cls: 'bg-[var(--surface-muted)] text-[var(--text-muted)]',
      };
  }
}

function daysUntil(value: string | null): number | null {
  if (!value) return null;
  const parsed = new Date(value).getTime();
  if (Number.isNaN(parsed)) return null;
  return Math.max(0, Math.ceil((parsed - Date.now()) / 86400000));
}

function trialCountdownClass(daysRemaining: number): string {
  if (daysRemaining > 7) return 'text-[var(--color-green)]';
  if (daysRemaining > 3) return 'text-[var(--color-yellow)]';
  return 'text-[var(--danger)]';
}

function invoiceAmount(invoice: BillingInvoice): number {
  const amount = invoice.amount ?? invoice.total ?? 0;
  return Math.abs(amount) > 1000 ? amount / 100 : amount;
}

function referralStatusPill(referral: ReferralRecord) {
  if (referral.status === 'converted') {
    return (
      <span className="rounded-full bg-[var(--surface-muted)] px-2 py-1 text-xs font-semibold text-[var(--color-green)]">
        Converted ✅
      </span>
    );
  }
  if (referral.status === 'churned') {
    return (
      <span className="rounded-full bg-[var(--danger-soft)] px-2 py-1 text-xs font-semibold text-[var(--danger)]">
        Churned ✗
      </span>
    );
  }
  return (
    <span className="rounded-full bg-[color-mix(in_srgb,var(--color-yellow)_18%,transparent)] px-2 py-1 text-xs font-semibold text-[var(--color-yellow)]">
      Pending (Day {Math.min(referral.daysActive, 30)}/30)
    </span>
  );
}

export default function BillingOverviewPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<BillingTab>('subscription');
  const [data, setData] = useState<SubscriptionStatusResponse | null>(null);
  const [subscriptionMeta, setSubscriptionMeta] = useState<
    BillingSubscriptionResponse['subscription'] | null
  >(null);
  const [invoices, setInvoices] = useState<BillingInvoice[]>([]);
  const [referrals, setReferrals] = useState<ReferralStatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [copyState, setCopyState] = useState<'idle' | 'copied'>('idle');

  const loadBilling = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const [statusRes, subscriptionRes, invoicesRes, referralRes] = await Promise.all([
        fetch('/api/subscription/status', {
          method: 'GET',
          credentials: 'include',
          cache: 'no-store',
        }),
        fetch('/api/billing/subscription', {
          method: 'GET',
          credentials: 'include',
          cache: 'no-store',
        }),
        fetch('/api/billing/invoices', {
          method: 'GET',
          credentials: 'include',
          cache: 'no-store',
        }),
        fetch('/api/billing/referral-stats', {
          method: 'GET',
          credentials: 'include',
          cache: 'no-store',
        }),
      ]);

      if (!statusRes.ok) throw new Error('Failed to load billing info');
      const statusBody = (await statusRes.json()) as SubscriptionStatusResponse;
      setData({
        plan: statusBody.plan,
        subscriptionState: statusBody.subscriptionState,
        billingStatus: statusBody.billingStatus,
        currentPeriodEnd: statusBody.currentPeriodEnd,
        trialEndsAt: statusBody.trialEndsAt,
      });

      if (subscriptionRes.ok) {
        const subscriptionBody = (await subscriptionRes.json()) as BillingSubscriptionResponse;
        setSubscriptionMeta(subscriptionBody.subscription ?? null);
      }

      if (invoicesRes.ok) {
        const invoiceBody = (await invoicesRes.json()) as InvoiceResponse;
        setInvoices(invoiceBody.invoices ?? []);
      }

      if (referralRes.ok) {
        const referralBody = (await referralRes.json()) as ReferralStatsResponse;
        setReferrals(referralBody);
      }
    } catch (err: unknown) {
      setFetchError(err instanceof Error ? err.message : 'Failed to load billing info');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadBilling();
  }, [loadBilling]);

  const openPortal = useCallback(async () => {
    setPortalLoading(true);
    setFetchError(null);
    try {
      const res = await apiFetch('/api/billing/portal', { method: 'POST' });
      const body = (await res.json()) as { ok?: boolean; url?: string; error?: string };
      if (!res.ok || !body.url) throw new Error(body.error ?? 'Failed to open billing portal');
      window.location.href = body.url;
    } catch (err: unknown) {
      setFetchError(err instanceof Error ? err.message : 'Failed to open billing portal');
    } finally {
      setPortalLoading(false);
    }
  }, []);

  const confirmCancel = useCallback(async () => {
    setCancelLoading(true);
    setCancelError(null);
    try {
      const res = await apiFetch('/api/billing/subscription/cancel', { method: 'POST' });
      const body = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !body.ok) throw new Error(body.error ?? 'Unable to cancel subscription');
      setIsCancelModalOpen(false);
      await loadBilling();
    } catch (err: unknown) {
      setCancelError(err instanceof Error ? err.message : 'Unable to cancel subscription');
    } finally {
      setCancelLoading(false);
    }
  }, [loadBilling]);

  const badge = useMemo(
    () => getBadgeConfig(data?.subscriptionState ?? ''),
    [data?.subscriptionState],
  );
  const planConfig = useMemo(
    () => plans[(data?.plan || 'trial') as BillingPlanKey] ?? plans.trial,
    [data?.plan],
  );
  const includedFeatures = useMemo(() => new Set(planConfig.features), [planConfig.features]);
  const trialDaysRemaining =
    data?.subscriptionState === 'trial' ? daysUntil(data.trialEndsAt) : null;
  const nextBillingAmount = subscriptionMeta?.totalAmount || planConfig.price;
  const renewalDate = data?.currentPeriodEnd || data?.trialEndsAt || null;
  const cancelAtPeriodEnd = Boolean(subscriptionMeta?.cancelAtPeriodEnd);
  const referralUrl = referrals?.referralUrl || '';
  const referralProgress = Math.min(100, ((referrals?.convertedCount || 0) / 5) * 100);
  const defaultCard = subscriptionMeta?.defaultPaymentMethod ?? null;

  return (
    <main className="page-frame text-[var(--text-primary)]">
      <div className="tabs-bar" role="tablist" aria-label="Billing sections">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`tab-pill ${activeTab === tab.key ? 'active' : ''}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab !== 'terminal' && (
        <div className="mb-6">
          <h1 className="page-title">Billing</h1>
          <p className="page-subtitle">
            Manage your subscription, invoices, payment methods, referrals, and payment terminal.
          </p>
        </div>
      )}

      {loading && activeTab !== 'terminal' && (
        <div className="card p-6 text-sm text-[var(--text-muted)]">Loading billing info…</div>
      )}

      {fetchError && activeTab !== 'terminal' && (
        <div className="rounded-xl border border-[var(--danger)] bg-[var(--danger-soft)] p-6">
          <p className="text-sm text-[var(--danger)]">{fetchError}</p>
          <button type="button" onClick={() => void loadBilling()} className="btn mt-4">
            Retry
          </button>
        </div>
      )}

      {!loading && !fetchError && activeTab === 'subscription' && (
        <section className="card p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="helper-text mb-1">Current plan</p>
              <h2 className="text-3xl font-bold capitalize">{formatPlanName(data?.plan)}</h2>
              {trialDaysRemaining !== null && (
                <p
                  className={`mt-2 text-sm font-semibold ${trialCountdownClass(trialDaysRemaining)}`}
                >
                  {trialDaysRemaining} day{trialDaysRemaining === 1 ? '' : 's'} remaining
                </p>
              )}
            </div>
            <span
              className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${badge.cls}`}
            >
              {badge.label}
            </span>
          </div>

          <div className="mt-6 grid gap-2 text-sm sm:grid-cols-2">
            {PLAN_FEATURE_MATRIX.map((feature) => {
              const included = includedFeatures.has(feature);
              return (
                <div
                  key={feature}
                  className="flex items-center gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-3 py-2"
                >
                  <span
                    className={
                      included ? 'font-bold text-[var(--color-green)]' : 'text-[var(--text-muted)]'
                    }
                  >
                    {included ? '✓' : '🔒'}
                  </span>
                  <span
                    className={included ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)]'}
                  >
                    {feature}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="mt-6 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] p-4">
            <p className="text-sm font-semibold">
              Next billing: {formatDate(renewalDate)} · {formatCurrency(nextBillingAmount)}
            </p>
            {cancelAtPeriodEnd && (
              <p className="mt-1 text-sm text-[var(--danger)]">
                Cancellation scheduled at period end.
              </p>
            )}
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <button type="button" onClick={() => router.push('/billing/upgrade')} className="btn">
              Upgrade Plan
            </button>
            {cancelAtPeriodEnd ? (
              <button
                type="button"
                onClick={() => void openPortal()}
                disabled={portalLoading}
                className="btn ghost"
              >
                {portalLoading ? 'Opening…' : 'Reactivate'}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setIsCancelModalOpen(true)}
                className="btn ghost"
              >
                Cancel Subscription
              </button>
            )}
          </div>
        </section>
      )}

      {!loading && !fetchError && activeTab === 'invoices' && (
        <section className="card p-6">
          <h2 className="section-title mb-4">Invoice History</h2>
          <div className="table-shell">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Plan</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Download PDF</th>
                </tr>
              </thead>
              <tbody>
                {invoices.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="table-empty">
                      No invoices yet. Your first appears after your trial ends.
                    </td>
                  </tr>
                ) : (
                  invoices.map((invoice) => {
                    const pdfUrl =
                      invoice.pdfUrl || invoice.invoicePdf || invoice.hostedInvoiceUrl || '';
                    return (
                      <tr key={invoice.id}>
                        <td>{formatDate(invoice.date || invoice.createdAt)}</td>
                        <td>{formatPlanName(invoice.plan || data?.plan)}</td>
                        <td>{formatCurrency(invoiceAmount(invoice))}</td>
                        <td>
                          <span className="rounded-full bg-[var(--surface-muted)] px-2 py-1 text-xs font-semibold text-[var(--text-primary)]">
                            {invoice.status || 'paid'}
                          </span>
                        </td>
                        <td>
                          {pdfUrl ? (
                            <a
                              href={pdfUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="text-[var(--erp-blue)] hover:underline"
                            >
                              Download PDF
                            </a>
                          ) : (
                            <span className="text-[var(--text-muted)]">Unavailable</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          <p className="mt-4 text-xs text-[var(--text-muted)]">Secured by Stripe</p>
        </section>
      )}

      {!loading && !fetchError && activeTab === 'payment-methods' && (
        <section className="card p-6">
          <h2 className="section-title mb-4">Payment Methods</h2>
          <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] p-4">
            {defaultCard?.last4 ? (
              <p className="text-sm font-semibold capitalize">
                {defaultCard.brand || 'Card'} ending in {defaultCard.last4} · Expires{' '}
                {String(defaultCard.expMonth || '').padStart(2, '0')}/{defaultCard.expYear}
              </p>
            ) : (
              <p className="text-sm text-[var(--text-muted)]">No default card is on file.</p>
            )}
          </div>
          <button
            type="button"
            onClick={() => void openPortal()}
            disabled={portalLoading}
            className="btn mt-5"
          >
            {portalLoading ? 'Opening…' : 'Update Payment Method'}
          </button>
          <p className="mt-3 text-xs text-[var(--text-muted)]">
            Your card is secured by Stripe and never stored on our servers
          </p>
        </section>
      )}

      {!loading && !fetchError && activeTab === 'referrals' && (
        <div className="space-y-5">
          <section
            className="card p-6"
            style={{
              background:
                'linear-gradient(135deg, color-mix(in srgb, var(--color-purple) 18%, var(--surface-card)), var(--surface-elevated))',
            }}
          >
            <p className="text-5xl font-bold">
              {formatCurrency(referrals?.totalCreditsEarned || 0)}
            </p>
            <p className="mt-2 text-lg font-semibold">earned in referral credits</p>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              {referrals?.convertedCount || 0} referrals converted • {referrals?.pendingCount || 0}{' '}
              pending
            </p>
            {(referrals?.totalCreditsEarned || 0) === 0 && (
              <p className="mt-4 text-sm font-semibold text-[var(--text-primary)]">
                Your first referral earns you $75. Share your link below to get started.
              </p>
            )}
          </section>

          <section className="card p-6">
            <h2 className="section-title mb-2">Progress to Next Milestone</h2>
            <p className="text-sm text-[var(--text-muted)]">
              {referrals?.convertedCount || 0} of 5 referrals to unlock 20% permanent discount
            </p>
            <div className="mt-4 h-3 overflow-hidden rounded-full bg-[var(--chart-track)]">
              <div
                className="h-full rounded-full bg-[var(--color-purple)]"
                style={{ width: `${referralProgress}%` }}
              />
            </div>
            <div className="mt-3 grid grid-cols-5 gap-2 text-center text-xs text-[var(--text-muted)]">
              {[1, 2, 3, 5, 10].map((marker) => (
                <span key={marker}>Milestone {marker}</span>
              ))}
            </div>
          </section>

          <section className="card p-6">
            <h2 className="section-title mb-4">Your Referral Link</h2>
            <code className="block overflow-x-auto rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-muted)] p-4 text-sm text-[var(--text-primary)]">
              {referralUrl || 'bizosto.com/signup?ref='}
            </code>
            {referralUrl && (
              <img
                className="mt-4 h-[200px] w-[200px] rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-2"
                src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(referralUrl)}`}
                alt="Referral QR code"
              />
            )}
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                className="btn"
                disabled={!referralUrl}
                onClick={async () => {
                  await navigator.clipboard.writeText(referralUrl);
                  setCopyState('copied');
                  window.setTimeout(() => setCopyState('idle'), 1600);
                }}
              >
                {copyState === 'copied' ? 'Copied' : 'Copy Link'}
              </button>
              <a
                className={`btn ghost ${!referralUrl ? 'pointer-events-none opacity-60' : ''}`}
                href={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(referralUrl)}`}
                download="bizosto-referral-qr.png"
              >
                Download QR Code
              </a>
            </div>
          </section>

          <section className="card p-6">
            <h2 className="section-title mb-4">Referral History</h2>
            <div className="table-shell">
              <table>
                <thead>
                  <tr>
                    <th>Company</th>
                    <th>Signed Up</th>
                    <th>Days Active</th>
                    <th>Status</th>
                    <th>Reward</th>
                  </tr>
                </thead>
                <tbody>
                  {(referrals?.referrals || []).length === 0 ? (
                    <tr>
                      <td colSpan={5} className="table-empty">
                        No referrals yet. Share your link to start earning.
                      </td>
                    </tr>
                  ) : (
                    referrals!.referrals.map((referral) => (
                      <tr key={referral.id}>
                        <td>{referral.company}</td>
                        <td>{formatDate(referral.signedUp)}</td>
                        <td>{referral.daysActive}</td>
                        <td>{referralStatusPill(referral)}</td>
                        <td>{referral.status === 'converted' ? '$75 credited' : 'Pending'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="card p-6">
            <h2 className="section-title mb-4">How It Works</h2>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-muted)] p-4">
                <p className="font-semibold">Step 1: Share your link 🔗</p>
              </div>
              <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-muted)] p-4">
                <p className="font-semibold">Step 2: They sign up &amp; subscribe 🎉</p>
              </div>
              <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-muted)] p-4">
                <p className="font-semibold">Step 3: You earn credits 💰</p>
              </div>
            </div>
            <Link
              href="/referral-terms"
              className="mt-4 inline-flex text-sm font-semibold text-[var(--erp-blue)] hover:underline"
            >
              View full referral terms →
            </Link>
          </section>
        </div>
      )}

      {activeTab === 'terminal' && <BillingTerminalContent showShell={false} />}

      {isCancelModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--drawer-overlay)] p-4">
          <div className="w-full max-w-lg rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-6 shadow-[var(--shadow-lg)]">
            <h2 className="section-title">Cancel subscription?</h2>
            <p className="mt-3 text-sm text-[var(--text-muted)]">
              Your workspace stays active until {formatDate(renewalDate)}. After that it will be
              locked.
            </p>
            {cancelError && <p className="mt-3 text-sm text-[var(--danger)]">{cancelError}</p>}
            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsCancelModalOpen(false)}
                className="btn"
                disabled={cancelLoading}
              >
                Keep Subscription
              </button>
              <button
                type="button"
                onClick={() => void confirmCancel()}
                disabled={cancelLoading}
                className="btn ghost border-[var(--danger)] text-[var(--danger)]"
              >
                {cancelLoading ? 'Cancelling…' : 'Yes, Cancel'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
