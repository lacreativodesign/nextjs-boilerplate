import {
  mapStripeStatusToSubscriptionState,
  normalizeBillingStatus,
} from '@/lib/billing/apply-subscription-state';
import {
  normalizeSubscriptionState,
  isTrialSubscription,
  isNonActiveSubscription,
  isReadOnlySubscription,
  isHardLockedSubscription,
  getSubscriptionBannerCopy,
} from '@/lib/subscription';

// BIL-02: 'trial' is a first-class subscription state. Stripe 'trialing' maps to it, the
// normalizer preserves it, it grants full access, it is not treated as an amber "non-active"
// billing problem, it has its own banner copy, and billing STATUS stays 'active' (card on file).
describe('F7: trial state machine (BIL-02)', () => {
  it('maps Stripe "trialing" to subscriptionState "trial"', () => {
    expect(mapStripeStatusToSubscriptionState('trialing')).toBe('trial');
  });

  it('normalizeSubscriptionState preserves "trial" instead of collapsing it to "active"', () => {
    expect(normalizeSubscriptionState('trial')).toBe('trial');
    expect(isTrialSubscription(normalizeSubscriptionState('trial'))).toBe(true);
  });

  it('a trial grants full access (never read-only or hard-locked)', () => {
    expect(isReadOnlySubscription('trial')).toBe(false);
    expect(isHardLockedSubscription('trial')).toBe(false);
  });

  it('a trial is not an amber "non-active" subscription', () => {
    expect(isNonActiveSubscription('trial')).toBe(false);
    // Real billing problems still count as non-active.
    expect(isNonActiveSubscription('grace')).toBe(true);
    expect(isNonActiveSubscription('soft_locked')).toBe(true);
    expect(isNonActiveSubscription('hard_locked')).toBe(true);
  });

  it('exposes its own informational trial banner copy', () => {
    const copy = getSubscriptionBannerCopy('trial');
    expect(copy.title).toBe('Free trial');
    expect(copy.message.length).toBeGreaterThan(0);
  });

  it('keeps billing STATUS "active" for a trialing subscription (card on file)', () => {
    expect(normalizeBillingStatus('trialing')).toBe('active');
  });
});
