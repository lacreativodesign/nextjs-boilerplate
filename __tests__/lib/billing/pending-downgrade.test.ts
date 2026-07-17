import * as fs from 'fs';
import * as path from 'path';
import { FirestoreEmulator } from '../../api/test-utils/firestore-emulator';

const buildSeed = () => ({
  tenants: [
    {
      id: 'tenant_a',
      data: {
        name: 'Tenant A',
        plan: 'pro',
        subscriptionState: 'active',
        billingStatus: 'active',
        stripeSubscriptionId: 'sub_123',
        pendingDowngradePlan: 'starter',
        pendingDowngradeAt: '2025-01-01T00:00:00.000Z',
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

const stripeUpdate = jest.fn();
const stripeRetrieve = jest.fn();
jest.mock('@/lib/payments/stripe', () => ({
  getStripeClient: () => ({
    subscriptions: {
      retrieve: stripeRetrieve,
      update: stripeUpdate,
    },
  }),
}));

jest.mock('@/lib/billing/plans', () => {
  const actual = jest.requireActual('@/lib/billing/plans');
  return {
    ...actual,
    getStripePriceId: (plan: string) => `price_${plan}`,
  };
});

import {
  schedulePendingDowngrade,
  clearPendingDowngrade,
} from '@/lib/billing/apply-subscription-state';
import { executePendingDowngradeForTenant } from '@/lib/billing/pending-downgrade';

const tenant = async () => (await db.collection('tenants').doc('tenant_a').get()).data() as any;
const auditRecords = async () =>
  (await db.collection('billing_state_audit').limit(100).get()).docs.map((d) => d.data());

beforeEach(() => {
  db = new FirestoreEmulator(buildSeed());
  stripeUpdate.mockReset();
  stripeRetrieve.mockReset();
});

describe('pending downgrade lifecycle (P0-1 billing single-writer)', () => {
  it('schedulePendingDowngrade stamps pending fields and writes an audit record', async () => {
    const result = await schedulePendingDowngrade({
      tenantId: 'tenant_a',
      plan: 'starter',
      effectiveAtIso: '2025-02-01T00:00:00.000Z',
      actorUid: 'admin_1',
    });
    expect(result.ok).toBe(true);

    const t = await tenant();
    expect(t.pendingDowngradePlan).toBe('starter');
    expect(t.pendingDowngradeAt).toBe('2025-02-01T00:00:00.000Z');
    // Entitlement untouched until the effective date.
    expect(t.plan).toBe('pro');

    const audits = await auditRecords();
    expect(audits.some((a: any) => a.source === 'plan.downgrade_scheduled')).toBe(true);
  });

  it('schedulePendingDowngrade fails closed on unknown tiers', async () => {
    const result = await schedulePendingDowngrade({
      tenantId: 'tenant_a',
      plan: 'mystery' as never,
      effectiveAtIso: '2025-02-01T00:00:00.000Z',
      actorUid: 'admin_1',
    });
    expect(result.ok).toBe(false);
    expect((await tenant()).plan).toBe('pro');
  });

  it('clearPendingDowngrade clears pending fields with an audited reason', async () => {
    const result = await clearPendingDowngrade({
      tenantId: 'tenant_a',
      actorUid: 'admin_1',
      reason: 'Scheduled downgrade cancelled by tenant admin',
    });
    expect(result.ok).toBe(true);

    const t = await tenant();
    expect(t.pendingDowngradePlan).toBeNull();
    expect(t.pendingDowngradeAt).toBeNull();

    const audits = await auditRecords();
    const cleared = audits.find((a: any) => a.source === 'plan.downgrade_cleared') as any;
    expect(cleared).toBeDefined();
    expect(cleared.warning).toBe('Scheduled downgrade cancelled by tenant admin');
  });

  it('executePendingDowngradeForTenant applies entitlement through the canonical service and clears pending', async () => {
    stripeRetrieve.mockResolvedValue({
      status: 'active',
      items: { data: [{ id: 'si_1' }] },
    });
    stripeUpdate.mockResolvedValue({
      status: 'active',
      current_period_end: 1750000000,
      cancel_at_period_end: false,
    });

    const result = await executePendingDowngradeForTenant('tenant_a');
    expect(result.applied).toBe(true);
    expect(result.cleared).toBe(true);

    // Stripe metadata moved to the new tier.
    expect(stripeUpdate).toHaveBeenCalledWith(
      'sub_123',
      expect.objectContaining({
        proration_behavior: 'none',
        metadata: expect.objectContaining({
          bizosto_plan: 'starter',
          bizosto_pending_plan: '',
        }),
      }),
    );

    const t = await tenant();
    expect(t.plan).toBe('starter');
    expect(t.pendingDowngradePlan).toBeNull();
    expect(t.pendingDowngradeAt).toBeNull();
    // Modules re-derived by the canonical service for the new tier.
    expect(Array.isArray(t.modules) || typeof t.modules === 'object').toBe(true);
  });

  it('executePendingDowngradeForTenant clears without applying when the subscription is canceled', async () => {
    stripeRetrieve.mockResolvedValue({ status: 'canceled', items: { data: [{ id: 'si_1' }] } });

    const result = await executePendingDowngradeForTenant('tenant_a');
    expect(result.applied).toBe(false);
    expect(result.cleared).toBe(true);
    expect(stripeUpdate).not.toHaveBeenCalled();

    const t = await tenant();
    expect(t.plan).toBe('pro');
    expect(t.pendingDowngradePlan).toBeNull();
  });
});

describe('billing single-writer static gate', () => {
  const read = (relative: string): string =>
    fs.readFileSync(path.join(process.cwd(), relative), 'utf8');

  it('subscription change route has no direct tenant billing writes', () => {
    const source = read('app/api/billing/subscription/change/route.ts');
    expect(source).not.toContain('tenantRef.set');
    expect(source).not.toContain('PLAN_MODULES');
    expect(source).toContain('applySubscriptionState');
    expect(source).toContain('schedulePendingDowngrade');
  });

  it('subscription cancel route has no direct tenant billing writes', () => {
    const source = read('app/api/billing/subscription/cancel/route.ts');
    expect(source).not.toContain('set(\n      {\n        cancelAtPeriodEnd: true');
    expect(source).toContain('applySubscriptionState');
    expect(source).toContain('cancel_at_period_end: true');
  });

  it('plan changes stamp the metadata key the webhooks actually read (bizosto_plan)', () => {
    const source = read('app/api/billing/subscription/change/route.ts');
    expect(source).toContain('bizosto_plan');
    expect(source).not.toMatch(/metadata:\s*\{\s*tenantId,\s*plan:/);
  });

  it('billing cron executes due period-end downgrades', () => {
    const source = read('app/api/cron/billing-locks/route.ts');
    expect(source).toContain('executeDuePendingDowngrades');
  });
});
