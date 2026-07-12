import { FirestoreEmulator } from '../../api/test-utils/firestore-emulator';

/**
 * E9 — Billing lifecycle fixtures.
 *
 * The canonical service is unit-tested in apply-subscription-state.test.ts. This
 * suite drives it through the *sequences* a real subscription actually takes —
 * upgrade, downgrade, cancel then resubscribe — plus the two delivery hazards
 * Stripe imposes: duplicate deliveries (replay) and unordered deliveries.
 *
 * Replay is guarded at the webhook boundary by claimWebhookEvent (atomic
 * Firestore create), which is exercised here directly.
 *
 * Out-of-order is NOT guarded (see the final describe block): applySubscriptionState
 * is last-write-wins by design. Stripe does not guarantee delivery order and the
 * Subscription object carries no monotonic version, so a second-granularity
 * event.created comparison could not be made fully correct and would risk
 * dropping legitimate events. The correct mitigation is the daily reconciliation
 * job (Block C / E14), which re-reads the subscription from Stripe as the source
 * of truth and corrects drift. These tests pin the current behavior so the gap is
 * explicit and tracked rather than an unexamined assumption.
 */

const buildSeed = () => ({
  tenants: [
    {
      id: 'tenant_a',
      data: {
        name: 'Tenant A',
        plan: 'starter',
        subscriptionState: 'active',
        billingStatus: 'active',
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

import { applySubscriptionState } from '@/lib/billing/apply-subscription-state';
import { claimWebhookEvent, finalizeWebhookEvent } from '@/lib/stripe/webhook-idempotency';

const tenant = async () => (await db.collection('tenants').doc('tenant_a').get()).data() as any;

/** One customer.subscription.updated delivery. */
const subscriptionUpdated = (plan: string, eventId: string) =>
  applySubscriptionState({
    tenantId: 'tenant_a',
    source: 'subscription.updated',
    eventId,
    plan,
    stripeStatus: 'active',
    stripeSubscriptionId: 'sub_1',
    currentPeriodEnd: 1_800_000_000,
    cancelAtPeriodEnd: false,
  });

beforeEach(() => {
  db = new FirestoreEmulator(buildSeed());
});

describe('E9: upgrade Starter → Pro', () => {
  it('raises plan, modules and limits together', async () => {
    const before = await tenant();
    expect(before.plan).toBe('starter');

    await subscriptionUpdated('pro', 'evt_upgrade');

    const t = await tenant();
    expect(t.plan).toBe('pro');
    expect(t.subscriptionState).toBe('active');
    // Pro unlocks production and raises the seat cap (10 → 20).
    expect(t.modules.production).toBe(true);
    expect(t.limits.users).toBe(20);
  });
});

describe('E9: downgrade Pro → Starter', () => {
  it('lowers plan, revokes the pro-only module and drops limits back', async () => {
    await subscriptionUpdated('pro', 'evt_up');
    expect((await tenant()).modules.production).toBe(true);

    await subscriptionUpdated('starter', 'evt_down');

    const t = await tenant();
    expect(t.plan).toBe('starter');
    // The pro-only module must be revoked, not left dangling from the old plan.
    expect(t.modules.production).toBe(false);
    expect(t.limits.users).toBe(10);
    expect(t.subscriptionState).toBe('active');
  });
});

describe('E9: upgrade Pro → Enterprise', () => {
  it('grants unlimited seats', async () => {
    await subscriptionUpdated('pro', 'evt_up1');
    await subscriptionUpdated('enterprise', 'evt_up2');

    const t = await tenant();
    expect(t.plan).toBe('enterprise');
    expect(t.limits.users).toBe(-1);
  });
});

describe('E9: cancel then resubscribe', () => {
  it('cancellation strips entitlements and a new subscription restores them', async () => {
    await subscriptionUpdated('pro', 'evt_a');

    await applySubscriptionState({
      tenantId: 'tenant_a',
      source: 'subscription.deleted',
      eventId: 'evt_cancel',
      stripeSubscriptionId: 'sub_1',
    });

    const cancelled = await tenant();
    expect(cancelled.subscriptionState).toBe('hard_locked');
    expect(cancelled.billingStatus).toBe('canceled');
    expect(Object.values(cancelled.modules)).not.toContain(true);

    // The customer comes back on a new subscription.
    await applySubscriptionState({
      tenantId: 'tenant_a',
      source: 'subscription.created',
      eventId: 'evt_resub',
      plan: 'pro',
      stripeStatus: 'active',
      stripeSubscriptionId: 'sub_2',
      currentPeriodEnd: 1_900_000_000,
      cancelAtPeriodEnd: false,
    });

    const restored = await tenant();
    expect(restored.plan).toBe('pro');
    expect(restored.subscriptionState).toBe('active');
    expect(restored.billingStatus).toBe('active');
    expect(restored.modules.production).toBe(true);
    expect(restored.stripeSubscriptionId).toBe('sub_2');
  });
});

describe('E9: an unknown tier mid-lifecycle never downgrades a paying tenant', () => {
  it('fails closed and leaves the existing plan and entitlements intact', async () => {
    await subscriptionUpdated('pro', 'evt_pro');

    // A price id we do not recognise (e.g. a new Stripe price created by hand).
    // The service fails closed by SKIPPING the plan/module/limit write entirely —
    // it does not error, it simply refuses to re-derive entitlements it cannot map.
    await subscriptionUpdated('platinum', 'evt_unknown');

    const t = await tenant();
    // The paying Pro tenant keeps Pro — an unrecognised tier must never silently
    // strip modules or seats, nor silently grant a different tier's.
    expect(t.plan).toBe('pro');
    expect(t.modules.production).toBe(true);
    expect(t.limits.users).toBe(20);
  });
});

describe('E9: replay — a duplicate Stripe delivery is claimed only once', () => {
  it('the second delivery of the same event id is a duplicate', async () => {
    const first = await claimWebhookEvent('evt_dup', 'customer.subscription.updated');
    const second = await claimWebhookEvent('evt_dup', 'customer.subscription.updated');

    expect(first).toBe('claimed');
    expect(second).toBe('duplicate');
  });

  it('a finalized event still reports duplicate on redelivery (no reprocessing)', async () => {
    await claimWebhookEvent('evt_final', 'invoice.payment_succeeded');
    await finalizeWebhookEvent('evt_final', 'invoice.payment_succeeded');

    const redelivery = await claimWebhookEvent('evt_final', 'invoice.payment_succeeded');
    expect(redelivery).toBe('duplicate');
  });

  it('different event ids each get their own claim', async () => {
    expect(await claimWebhookEvent('evt_1', 'x')).toBe('claimed');
    expect(await claimWebhookEvent('evt_2', 'x')).toBe('claimed');
  });
});

describe('E9: out-of-order delivery is last-write-wins (KNOWN GAP — mitigated by E14)', () => {
  it('a stale subscription.updated arriving last overwrites the newer one', async () => {
    // Real sequence: the customer upgrades to Pro, then immediately downgrades to
    // Starter. Stripe delivers the two updates REVERSED.
    await subscriptionUpdated('starter', 'evt_downgrade_newer'); // newer event, arrives first
    await subscriptionUpdated('pro', 'evt_upgrade_older'); // older event, arrives last

    const t = await tenant();

    // Documented current behavior: the last delivery wins, so the tenant is left
    // on Pro while actually being billed for Starter. applySubscriptionState has
    // no ordering guard and Stripe provides no monotonic subscription version.
    // The daily Stripe reconciliation job (E14) is the mitigation: it re-reads the
    // subscription from Stripe and corrects this drift. If an ordering guard is
    // ever added, THIS ASSERTION SHOULD FLIP to expect 'starter'.
    expect(t.plan).toBe('pro');
    expect(t.modules.production).toBe(true);
  });

  it('in-order delivery of the same two events lands correctly', async () => {
    // Control: the identical pair delivered in order yields the right end state,
    // proving the service itself is correct and only ordering is at issue.
    await subscriptionUpdated('pro', 'evt_upgrade');
    await subscriptionUpdated('starter', 'evt_downgrade');

    const t = await tenant();
    expect(t.plan).toBe('starter');
    expect(t.modules.production).toBe(false);
  });
});
