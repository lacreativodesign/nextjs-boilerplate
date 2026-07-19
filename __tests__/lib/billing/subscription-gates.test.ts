import {
  normalizeSubscriptionState,
  deriveSubscriptionState,
  isReadOnlySubscription,
  isHardLockedSubscription,
  isTrialSubscription,
  isNonActiveSubscription,
  getSubscriptionBannerCopy,
  type SubscriptionState,
} from '@/lib/subscription';

// QUAL-03: lib/subscription.ts is the highest-risk pure-function gate — it decides tenant access
// (read-only / hard-lock / trial), the billing-status fallback used when no explicit
// subscriptionState is stored, and the banner copy shown to tenants. These tests exercise every
// branch: the explicit/fallback/fail-closed derivation paths, the fail-closed normalizer, all lock
// gates, and every banner-copy case, so this access path cannot silently regress.
describe('QUAL-03: subscription access gates', () => {
  describe('normalizeSubscriptionState', () => {
    it('preserves every valid state verbatim (case-insensitively)', () => {
      const valid: SubscriptionState[] = ['active', 'grace', 'soft_locked', 'hard_locked', 'trial'];
      for (const state of valid) {
        expect(normalizeSubscriptionState(state)).toBe(state);
      }
      // Casing is normalized down before matching.
      expect(normalizeSubscriptionState('TRIAL')).toBe('trial');
    });

    it('fails closed to hard_locked for unknown or empty input', () => {
      expect(normalizeSubscriptionState('bogus')).toBe('hard_locked');
      expect(normalizeSubscriptionState('')).toBe('hard_locked');
      expect(normalizeSubscriptionState(undefined)).toBe('hard_locked');
      expect(normalizeSubscriptionState(null)).toBe('hard_locked');
    });
  });

  describe('deriveSubscriptionState', () => {
    it('uses an explicit subscriptionState (normalized) over billingStatus', () => {
      expect(
        deriveSubscriptionState({ subscriptionState: 'soft_locked', billingStatus: 'active' }),
      ).toBe('soft_locked');
      // An explicit-but-invalid state still fails closed rather than falling through to billing.
      expect(
        deriveSubscriptionState({ subscriptionState: 'nonsense', billingStatus: 'active' }),
      ).toBe('hard_locked');
    });

    it('falls back to grace when billingStatus is past_due', () => {
      expect(deriveSubscriptionState({ billingStatus: 'past_due' })).toBe('grace');
    });

    it('falls back to hard_locked when billingStatus is canceled', () => {
      expect(deriveSubscriptionState({ billingStatus: 'canceled' })).toBe('hard_locked');
    });

    it('falls back to active when billingStatus is active', () => {
      expect(deriveSubscriptionState({ billingStatus: 'active' })).toBe('active');
    });

    it('fails closed to grace when there is no subscription data at all', () => {
      expect(deriveSubscriptionState({})).toBe('grace');
      // An unrecognized billingStatus is also restricted to grace, never granted access.
      expect(deriveSubscriptionState({ billingStatus: 'whatever' })).toBe('grace');
    });
  });

  describe('lock gates', () => {
    it('classifies read-only, hard-lock, trial and non-active states correctly', () => {
      expect(isReadOnlySubscription('soft_locked')).toBe(true);
      expect(isReadOnlySubscription('active')).toBe(false);

      expect(isHardLockedSubscription('hard_locked')).toBe(true);
      expect(isHardLockedSubscription('grace')).toBe(false);

      expect(isTrialSubscription('trial')).toBe(true);
      expect(isTrialSubscription('active')).toBe(false);

      // A trial and an active plan are healthy full-access states; every lock/grace state is
      // "non-active" (surfaced as an amber billing problem).
      expect(isNonActiveSubscription('active')).toBe(false);
      expect(isNonActiveSubscription('trial')).toBe(false);
      expect(isNonActiveSubscription('grace')).toBe(true);
      expect(isNonActiveSubscription('soft_locked')).toBe(true);
      expect(isNonActiveSubscription('hard_locked')).toBe(true);
    });
  });

  describe('getSubscriptionBannerCopy', () => {
    it('returns distinct informational copy for trial, grace, soft_locked and hard_locked', () => {
      expect(getSubscriptionBannerCopy('trial').title).toBe('Free trial');
      expect(getSubscriptionBannerCopy('grace').title).toBe('Subscription past due');
      expect(getSubscriptionBannerCopy('soft_locked').title).toBe('Read-only mode');
      expect(getSubscriptionBannerCopy('hard_locked').title).toBe('Subscription locked');

      for (const state of ['trial', 'grace', 'soft_locked', 'hard_locked'] as SubscriptionState[]) {
        expect(getSubscriptionBannerCopy(state).message.length).toBeGreaterThan(0);
      }
    });

    it('returns the active default with an empty message for a healthy subscription', () => {
      const copy = getSubscriptionBannerCopy('active');
      expect(copy.title).toBe('Subscription active');
      expect(copy.message).toBe('');
    });
  });
});
