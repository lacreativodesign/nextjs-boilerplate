export type SubscriptionState = 'active' | 'grace' | 'soft_locked' | 'hard_locked' | 'trial';

const VALID_STATES: SubscriptionState[] = [
  'active',
  'grace',
  'soft_locked',
  'hard_locked',
  'trial',
];

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
  return state === 'hard_locked';
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
