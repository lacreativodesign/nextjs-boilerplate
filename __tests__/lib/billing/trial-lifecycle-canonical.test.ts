import { FirestoreEmulator } from '../../api/test-utils/firestore-emulator';

/**
 * SOC2 F-09 regression suite.
 *
 * The trial-emails cron wrote billing state straight onto the tenant document for
 * two lifecycle transitions — trial expiry and grace-period end:
 *
 *   await adminDb.collection('tenants').doc(tenantId).set(
 *     { status: 'grace_period', subscriptionState: 'grace',
 *       billingStatus: 'past_due', plan: 'starter', modules: PLAN_MODULES.starter },
 *     { merge: true },
 *   );
 *
 * `applySubscriptionState` is documented as the sole writer of billing state, and
 * every guarantee it provides was skipped: no `billing_state_audit` record for the
 * transition, no protected-tenant guard, no plan-derived limits, and no
 * transactional re-read — so a checkout completing between the cron's read and its
 * write was silently overwritten with a downgrade.
 */

const buildSeed = (overrides: Record<string, unknown> = {}) => ({
  tenants: [
    {
      id: 'tenant_a',
      data: {
        name: 'Tenant A',
        plan: 'pro',
        status: 'active',
        subscriptionState: 'trial',
        billingStatus: 'trial',
        ...overrides,
      },
    },
    {
      id: 'bizosto',
      data: {
        name: 'Bizosto',
        plan: 'enterprise',
        status: 'active',
        subscriptionState: 'trial',
        billingStatus: 'trial',
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

const tenant = async (id = 'tenant_a') =>
  (await db.collection('tenants').doc(id).get()).data() as Record<string, unknown>;
const auditRecords = async () =>
  (await db.collection('billing_state_audit').limit(100).get()).docs.map((d) => d.data());

describe('trial.expired', () => {
  beforeEach(() => {
    db = new FirestoreEmulator(buildSeed());
  });

  it('moves the tenant into grace and records the transition in billing_state_audit', async () => {
    const result = await applySubscriptionState({
      tenantId: 'tenant_a',
      source: 'trial.expired',
      plan: 'starter',
    });

    expect(result.ok).toBe(true);

    const after = await tenant();
    expect(after.status).toBe('grace_period');
    expect(after.subscriptionState).toBe('grace');
    expect(after.billingStatus).toBe('past_due');
    expect(after.plan).toBe('starter');

    // The direct write produced no audit trail at all.
    const audit = await auditRecords();
    expect(audit).toHaveLength(1);
    expect(audit[0].source).toBe('trial.expired');
  });

  it('re-derives starter modules and limits from the plan', async () => {
    await applySubscriptionState({
      tenantId: 'tenant_a',
      source: 'trial.expired',
      plan: 'starter',
    });

    const after = await tenant();
    const modules = after.modules as Record<string, boolean>;
    // Starter hides the paid modules; the sidebar reads this map.
    expect(modules.crm).toBe(true);
    expect(modules.finance).toBe(false);
    expect(modules.hr).toBe(false);
    // The direct write set modules but never limits, leaving pro limits in place.
    expect(after.limits).toBeDefined();
  });
});

describe('trial.grace_ended', () => {
  beforeEach(() => {
    db = new FirestoreEmulator(buildSeed({ status: 'grace_period', subscriptionState: 'grace' }));
  });

  it('hard locks the tenant and records the transition', async () => {
    const result = await applySubscriptionState({
      tenantId: 'tenant_a',
      source: 'trial.grace_ended',
      plan: 'starter',
    });

    expect(result.ok).toBe(true);

    const after = await tenant();
    expect(after.status).toBe('hard_locked');
    expect(after.subscriptionState).toBe('hard_locked');
    expect(after.billingStatus).toBe('canceled');

    const audit = await auditRecords();
    expect(audit).toHaveLength(1);
    expect(audit[0].source).toBe('trial.grace_ended');
  });
});

describe('trial lifecycle guards', () => {
  it('never downgrades a tenant that has started paying', async () => {
    db = new FirestoreEmulator(buildSeed({ billingStatus: 'active' }));

    const result = await applySubscriptionState({
      tenantId: 'tenant_a',
      source: 'trial.expired',
      plan: 'starter',
    });

    // A checkout landing between the cron's read and its write must win the race.
    expect(result.ok).toBe(false);
    const after = await tenant();
    expect(after.billingStatus).toBe('active');
    expect(after.plan).toBe('pro');
    expect(await auditRecords()).toHaveLength(0);
  });

  it('never downgrades a protected tenant', async () => {
    db = new FirestoreEmulator(buildSeed());

    const result = await applySubscriptionState({
      tenantId: 'bizosto',
      source: 'trial.grace_ended',
      plan: 'starter',
    });

    expect(result.ok).toBe(false);
    const after = await tenant('bizosto');
    expect(after.status).toBe('active');
    expect(after.plan).toBe('enterprise');
  });
});
