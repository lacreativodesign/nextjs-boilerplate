export type SubscriptionState =
  'active' | 'grace' | 'soft_locked' | 'hard_locked' | 'trial' | 'pending_checkout';

const VALID_STATES: SubscriptionState[] = [
  'active',
  'grace',
  'soft_locked',
  'hard_locked',
  'trial',
  'pending_checkout',
];

// Exact authenticated endpoints needed to start/repair Bizosto SaaS billing or revoke the caller's
// own sessions. Keeping this as an allowlist prevents a locked tenant from regaining general API
// access through a broad `/api/billing/*` or `/api/auth/*` exemption.
const SUBSCRIPTION_RECOVERY_API_PATHS = new Set([
  '/api/stripe/checkout',
  '/api/billing/address',
  '/api/billing/cancel-subscription',
  '/api/billing/invoices',
  '/api/billing/payment-method',
  '/api/billing/portal',
  '/api/billing/setup-intent',
  '/api/billing/subscription',
  '/api/billing/subscription/cancel',
  '/api/billing/subscription/change',
  '/api/billing/usage',
  '/api/auth/sessions',
  '/api/auth/sessions/invalidate-all',
]);

export function normalizeSubscriptionState(value: unknown): SubscriptionState {
  const normalized = String(value || '').toLowerCase();
  // BIL-02: 'trial' is a first-class state (an active Stripe trial: full access, plus a
  // countdown/reminders in the UI). It must NOT be collapsed to 'active', or the trial banner
  // and countdown can never fire. It grants access like 'active' — the lock checks below only
  // trip on soft_locked/hard_locked — so trial users are never restricted.
  return VALID_STATES.includes(normalized as SubscriptionState)
    ? (normalized as SubscriptionState)
    : 'hard_locked';
}

export function deriveSubscriptionState({
  subscriptionState,
  billingStatus,
}: {
  subscriptionState?: unknown;
  billingStatus?: unknown;
}): SubscriptionState {
  if (subscriptionState) {
    return normalizeSubscriptionState(subscriptionState);
  }

  const normalizedBilling = String(billingStatus || '').toLowerCase();
  if (normalizedBilling === 'past_due') return 'grace';
  if (normalizedBilling === 'canceled') return 'hard_locked';
  if (normalizedBilling === 'active') return 'active';
  // No subscription data at all — restrict to grace rather than granting full access
  return 'grace';
}

export function isReadOnlySubscription(state: SubscriptionState) {
  return state === 'soft_locked';
}

export function isHardLockedSubscription(state: SubscriptionState) {
  // A newly provisioned tenant must reach checkout, but it must not receive ordinary product
  // access until the verified Stripe webhook activates it.
  return state === 'hard_locked' || state === 'pending_checkout';
}

export function isSubscriptionRecoveryApiPath(pathname: string): boolean {
  return (
    SUBSCRIPTION_RECOVERY_API_PATHS.has(pathname) || /^\/api\/auth\/sessions\/[^/]+$/.test(pathname)
  );
}

export function isTrialSubscription(state: SubscriptionState) {
  return state === 'trial';
}

export function isNonActiveSubscription(state: SubscriptionState) {
  // A trial is a healthy, full-access state — not a billing problem. It is surfaced with its own
  // informational banner, so it must not be treated as a "non-active" (amber) subscription here.
  return state !== 'active' && state !== 'trial';
}

export function getSubscriptionBannerCopy(state: SubscriptionState) {
  switch (state) {
    case 'pending_checkout':
      return {
        title: 'Complete checkout',
        message: 'Complete secure checkout to start your 14-day trial and activate your workspace.',
      };
    case 'trial':
      return {
        title: 'Free trial',
        message:
          'You have full access during your trial. Add or confirm billing to continue after it ends.',
      };
    case 'grace':
      return {
        title: 'Subscription past due',
        message: 'Your plan is in grace period. Update billing to avoid a lock.',
      };
    case 'soft_locked':
      return {
        title: 'Read-only mode',
        message: 'Your subscription is paused. Updates are disabled until billing is restored.',
      };
    case 'hard_locked':
      return {
        title: 'Subscription locked',
        message: 'Access is restricted. Update billing to restore full access.',
      };
    default:
      return {
        title: 'Subscription active',
        message: '',
      };
  }
}
