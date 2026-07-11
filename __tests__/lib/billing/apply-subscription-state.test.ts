import { FirestoreEmulator } from '../../api/test-utils/firestore-emulator';

const buildSeed = () => ({
  tenants: [
    {
      id: 'tenant_a',
      data: {
        name: 'Tenant A',
        plan: 'starter',
        subscriptionState: 'trial',
        billingStatus: 'trial',
        failedPaymentCount: 0,
      },
    },
  ],
});

let db: FirestoreEmulator;
jest.mock('@/lib/firebaseAdmin', () => ({
  get adminDb() {
    return db;
  },
}));

import {
  applySubscriptionState,
  applyPaymentSucceeded,
  applyPaymentFailed,
  applyLockAdvance,
  classifyLockAdvance,
  deriveLockDates,
  isKnownPaidTier,
} from '@/lib/billing/apply-subscription-state';

const tenant = async () => (await db.collection('tenants').doc('tenant_a').get()).data() as any;
const auditRecords = async () =>
  (await db.collection('billing_state_audit').limit(100).get()).docs.map((d) => d.data());

beforeEach(() => {
  db = new FirestoreEmulator(buildSeed());
});

describe('canonical billing state service (P0-3)', () => {
  it('subscription.updated with a known tier re-derives plan, modules and limits', async () => {
    const result = await applySubscriptionState({
      tenantId: 'tenant_a',
      source: 'subscription.updated',
      eventId: 'evt_1',
      plan: 'pro',
      stripeStatus: 'active',
      stripeSubscriptionId: 'sub_1',
      currentPeriodEnd: 1_800_000_000,
      cancelAtPeriodEnd: false,
    });

    expect(result.ok).toBe(true);
    const t = await tenant();
    expect(t.plan).toBe('pro');
    expect(t.subscriptionState).toBe('active');
    expect(t.billingStatus).toBe('active');
    expect(t.stripeSubscriptionId).toBe('sub_1');
    expect(t.cancelAtPeriodEnd).toBe(false);
    expect(t.currentPeriodEnd).toBe(new Date(1_800_000_000 * 1000).toISOString());
    expect(t.modules).toBeDefined();
    expect(t.modulesEnabled).toEqual(t.modules);
    expect(t.limits.users).toBe(20);
  });

  it('unknown tier fails closed: no plan, module or limit write', async () => {
    await applySubscriptionState({
      tenantId: 'tenant_a',
      source: 'subscription.updated',
      eventId: 'evt_2',
      plan: 'platinum',
      stripeStatus: 'active',
    });

    const t = await tenant();
    expect(t.plan).toBe('starter'); // unchanged
    expect(t.modules).toBeUndefined();
    expect(t.limits).toBeUndefined();

    const audits = await auditRecords();
    expect(audits).toHaveLength(1);
    expect(String(audits[0].warning)).toContain('platinum');
  });

  it('subscription.deleted hard-locks, cancels billing and clears entitlements', async () => {
    // Seed a paid tenant with live module access and a scheduled downgrade so we
    // can prove cancellation strips all of it, not just plan/status.
    await db
      .collection('tenants')
      .doc('tenant_a')
      .set(
        {
          plan: 'enterprise',
          modules: { crm: true, finance: true, hr: true, client_stripe_connect: true },
          modulesEnabled: { crm: true, finance: true, hr: true, client_stripe_connect: true },
          limits: { users: 999, storage: 268435456000, api_calls: 999999 },
          cancelAtPeriodEnd: true,
          pendingDowngradePlan: 'pro',
          pendingDowngradeAt: '2026-08-01T00:00:00.000Z',
        },
        { merge: true },
      );

    await applySubscriptionState({
      tenantId: 'tenant_a',
      source: 'subscription.deleted',
      eventId: 'evt_3',
      stripeSubscriptionId: 'sub_1',
    });

    const t = await tenant();
    expect(t.subscriptionState).toBe('hard_locked');
    expect(t.billingStatus).toBe('canceled');
    expect(t.plan).toBe('trial');
    // No stale paid-module access survives cancellation.
    expect(Object.values(t.modules)).not.toContain(true);
    expect(Object.values(t.modulesEnabled)).not.toContain(true);
    expect(t.modules.finance).toBe(false);
    expect(t.modules.hr).toBe(false);
    expect(t.modules.client_stripe_connect).toBe(false);
    // Limits fall back to the trial baseline, not the old enterprise numbers.
    expect(t.limits.users).toBe(10);
    // Cancellation supersedes any scheduled downgrade and any pending cancel flag.
    expect(t.cancelAtPeriodEnd).toBe(false);
    expect(t.pendingDowngradePlan).toBeNull();
    expect(t.pendingDowngradeAt).toBeNull();
  });

  it('checkout.linked activates billing and stores Stripe IDs and cycle', async () => {
    const result = await applySubscriptionState({
      tenantId: 'tenant_a',
      source: 'checkout.linked',
      eventId: 'evt_4',
      stripeCustomerId: 'cus_1',
      stripeSubscriptionId: 'sub_1',
      billingCycle: 'annual',
    });

    expect(result.tenantExists).toBe(true);
    const t = await tenant();
    expect(t.billingStatus).toBe('active');
    expect(t.subscriptionState).toBe('active');
    expect(t.status).toBe('active');
    expect(t.stripeCustomerId).toBe('cus_1');
    expect(t.billingCycle).toBe('annual');
  });

  it('returns tenantExists=false and writes nothing for a missing tenant', async () => {
    const result = await applySubscriptionState({
      tenantId: 'ghost_tenant',
      source: 'checkout.linked',
      stripeCustomerId: 'cus_x',
      stripeSubscriptionId: 'sub_x',
      billingCycle: 'monthly',
    });

    expect(result.ok).toBe(false);
    expect(result.tenantExists).toBe(false);
    expect((await db.collection('tenants').doc('ghost_tenant').get()).exists).toBe(false);
    expect(await auditRecords()).toHaveLength(0);
  });

  it('payment failures walk the ladder: grace, grace, soft lock at 3 — lock dates stamped once', async () => {
    const first = await applyPaymentFailed({ tenantId: 'tenant_a', eventId: 'evt_5' });
    expect(first.failedPaymentCount).toBe(1);
    let t = await tenant();
    expect(t.subscriptionState).toBe('grace');
    expect(t.billingStatus).toBe('past_due');
    expect(t.graceStartedAt).toBeTruthy();
    expect(t.graceEndsAt).toBe(deriveLockDates(t.graceStartedAt).graceEndsAt);
    const ladderStart = t.graceStartedAt;

    await applyPaymentFailed({ tenantId: 'tenant_a', eventId: 'evt_6' });
    t = await tenant();
    expect(t.subscriptionState).toBe('grace');
    expect(t.graceStartedAt).toBe(ladderStart); // not restarted

    const third = await applyPaymentFailed({ tenantId: 'tenant_a', eventId: 'evt_7' });
    expect(third.failedPaymentCount).toBe(3);
    t = await tenant();
    expect(t.subscriptionState).toBe('soft_locked');
    expect(t.hardLockAt).toBe(deriveLockDates(ladderStart).hardLockAt);
    expect(t.dataRetentionUntil).toBe(deriveLockDates(ladderStart).dataRetentionUntil);
  });

  it('a successful payment resets the ladder and reactivates', async () => {
    await applyPaymentFailed({ tenantId: 'tenant_a', eventId: 'evt_8' });
    await applyPaymentSucceeded({ tenantId: 'tenant_a', eventId: 'evt_9' });

    const t = await tenant();
    expect(t.subscriptionState).toBe('active');
    expect(t.billingStatus).toBe('active');
    expect(t.failedPaymentCount).toBe(0);
    expect(t.graceStartedAt).toBeNull();
    expect(t.hardLockAt).toBeNull();
    expect(t.lastPaymentAt).toBeTruthy();
  });

  it('writes a billing_state_audit record with before/after for every transition', async () => {
    await applySubscriptionState({
      tenantId: 'tenant_a',
      source: 'subscription.updated',
      eventId: 'evt_10',
      plan: 'enterprise',
      stripeStatus: 'active',
    });
    await applyPaymentFailed({ tenantId: 'tenant_a', eventId: 'evt_11' });

    const audits = await auditRecords();
    expect(audits).toHaveLength(2);
    const upgrade = audits.find((a) => a.eventId === 'evt_10') as any;
    expect(upgrade.before.plan).toBe('starter');
    expect(upgrade.after.plan).toBe('enterprise');
    const failure = audits.find((a) => a.eventId === 'evt_11') as any;
    expect(failure.source).toBe('payment.failed');
    expect(failure.after.failedPaymentCount).toBe(1);
  });

  it('classifyLockAdvance walks the date ladder and never touches safe tenants', () => {
    const now = Date.parse('2026-07-05T00:00:00.000Z');
    const past = new Date(now - 1000).toISOString();
    const future = new Date(now + 1000).toISOString();
    const base = {
      tenantId: 'tenant_a',
      billingStatus: 'past_due',
      subscriptionState: 'grace',
      softLockAt: past,
      hardLockAt: future,
    };

    expect(classifyLockAdvance(base, now)).toBe('soft_locked');
    expect(classifyLockAdvance({ ...base, hardLockAt: past }, now)).toBe('hard_locked');
    expect(
      classifyLockAdvance({ ...base, subscriptionState: 'soft_locked', hardLockAt: past }, now),
    ).toBe('hard_locked');
    // Already soft-locked and hard date not reached: no repeat soft lock.
    expect(classifyLockAdvance({ ...base, subscriptionState: 'soft_locked' }, now)).toBe('none');
    // Active billing, protected tenants, or missing dates are never advanced.
    expect(classifyLockAdvance({ ...base, billingStatus: 'active' }, now)).toBe('none');
    expect(classifyLockAdvance({ ...base, tenantId: 'bizosto' }, now)).toBe('none');
    expect(classifyLockAdvance({ ...base, softLockAt: null, hardLockAt: null }, now)).toBe('none');
    expect(classifyLockAdvance({ ...base, subscriptionState: 'active' }, now)).toBe('none');
  });

  it('applyLockAdvance advances via the canonical service with an audit record', async () => {
    const past = new Date(Date.now() - 1000).toISOString();
    await db
      .collection('tenants')
      .doc('tenant_a')
      .set(
        {
          billingStatus: 'past_due',
          subscriptionState: 'grace',
          softLockAt: past,
          hardLockAt: new Date(Date.now() + 86_400_000).toISOString(),
        },
        { merge: true },
      );

    const result = await applyLockAdvance({ tenantId: 'tenant_a', to: 'soft_locked' });
    expect(result.ok).toBe(true);

    const t = await tenant();
    expect(t.subscriptionState).toBe('soft_locked');
    expect(t.billingStatus).toBe('past_due');

    const audits = await auditRecords();
    expect(audits).toHaveLength(1);
    expect(audits[0].source).toBe('lock.advanced');
  });

  it('applyLockAdvance refuses when the transaction re-check disagrees (payment recovered)', async () => {
    await db
      .collection('tenants')
      .doc('tenant_a')
      .set(
        {
          billingStatus: 'active',
          subscriptionState: 'active',
          softLockAt: new Date(Date.now() - 1000).toISOString(),
          hardLockAt: new Date(Date.now() - 500).toISOString(),
        },
        { merge: true },
      );

    const result = await applyLockAdvance({ tenantId: 'tenant_a', to: 'hard_locked' });
    expect(result.ok).toBe(false);

    const t = await tenant();
    expect(t.subscriptionState).toBe('active');
    expect(await auditRecords()).toHaveLength(0);
  });

  it('isKnownPaidTier accepts exactly the three launch tiers', () => {
    expect(isKnownPaidTier('starter')).toBe(true);
    expect(isKnownPaidTier('pro')).toBe(true);
    expect(isKnownPaidTier('enterprise')).toBe(true);
    expect(isKnownPaidTier('trial')).toBe(false);
    expect(isKnownPaidTier('platinum')).toBe(false);
    expect(isKnownPaidTier('')).toBe(false);
  });
});
