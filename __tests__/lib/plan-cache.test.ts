/**
 * S9 — the plan cache in app/lib/plan-enforcement.ts.
 *
 * checkModuleAccess() runs inside every module guard, so before this cache each guarded
 * API request performed its own `tenants/{tenantId}` read: one Firestore read per request
 * across nine namespaces, for a document that changes only when an operator edits a plan
 * or Stripe reports a subscription change.
 *
 * The cache is deliberately TTL-bounded rather than invalidation-guaranteed. It lives in
 * the process, so a serverless deployment holds one copy per warm instance and no
 * instance can clear another's. These tests pin the properties that make that safe: a
 * second read inside the window costs nothing, the window really does expire, an explicit
 * invalidation forces a re-read, tenants never bleed into each other, and a missing
 * tenant is never cached.
 */

type TenantDoc = { exists: boolean; data: Record<string, unknown> };

const tenants = new Map<string, TenantDoc>();
const getSpy = jest.fn();

jest.mock('@/lib/firebaseAdmin', () => ({
  adminDb: {
    collection: (name: string) => ({
      doc: (id: string) => ({
        get: async () => {
          getSpy(name, id);
          const doc = tenants.get(id);
          return {
            exists: Boolean(doc?.exists),
            data: () => doc?.data ?? {},
          };
        },
      }),
    }),
  },
}));

const loadModule = () => {
  jest.resetModules();
  return require('@/app/lib/plan-enforcement');
};

describe('S9: the plan cache serves repeat reads without a Firestore round trip', () => {
  let planEnforcement: typeof import('@/app/lib/plan-enforcement');

  beforeEach(() => {
    jest.useFakeTimers();
    tenants.clear();
    getSpy.mockClear();
    tenants.set('tenant_a', { exists: true, data: { plan: 'pro' } });
    tenants.set('tenant_b', { exists: true, data: { plan: 'starter' } });
    planEnforcement = loadModule();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('reads Firestore once for repeated lookups of the same tenant', async () => {
    const first = await planEnforcement.getTenantPlanState('tenant_a');
    const second = await planEnforcement.getTenantPlanState('tenant_a');

    expect(getSpy).toHaveBeenCalledTimes(1);
    expect(first.plan).toBe('pro');
    expect(second.plan).toBe('pro');
  });

  it('re-reads once the 30s window has passed', async () => {
    await planEnforcement.getTenantPlanState('tenant_a');
    jest.advanceTimersByTime(29_000);
    await planEnforcement.getTenantPlanState('tenant_a');
    expect(getSpy).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(2_000);
    await planEnforcement.getTenantPlanState('tenant_a');
    expect(getSpy).toHaveBeenCalledTimes(2);
  });

  it('serves a plan change after the window, so entitlement converges without invalidation', async () => {
    expect((await planEnforcement.getTenantPlanState('tenant_a')).plan).toBe('pro');

    tenants.set('tenant_a', { exists: true, data: { plan: 'starter' } });
    expect((await planEnforcement.getTenantPlanState('tenant_a')).plan).toBe('pro');

    jest.advanceTimersByTime(31_000);
    expect((await planEnforcement.getTenantPlanState('tenant_a')).plan).toBe('starter');
  });

  it('never lets one tenant read another tenant from the cache', async () => {
    const a = await planEnforcement.getTenantPlanState('tenant_a');
    const b = await planEnforcement.getTenantPlanState('tenant_b');

    expect(a.plan).toBe('pro');
    expect(b.plan).toBe('starter');
    expect(a.modules.finance).toBe(true);
    expect(b.modules.finance).toBe(false);
    expect(getSpy).toHaveBeenCalledTimes(2);
  });

  it('does not cache a missing tenant, so a workspace created moments later is not locked out', async () => {
    await expect(planEnforcement.getTenantPlanState('tenant_new')).rejects.toThrow(
      'Tenant not found',
    );

    tenants.set('tenant_new', { exists: true, data: { plan: 'enterprise' } });
    const state = await planEnforcement.getTenantPlanState('tenant_new');

    expect(state.plan).toBe('enterprise');
    expect(getSpy).toHaveBeenCalledTimes(2);
  });
});

describe('S9: invalidation drops the entry immediately on this instance', () => {
  let planEnforcement: typeof import('@/app/lib/plan-enforcement');

  beforeEach(() => {
    jest.useFakeTimers();
    tenants.clear();
    getSpy.mockClear();
    tenants.set('tenant_a', { exists: true, data: { plan: 'pro' } });
    tenants.set('tenant_b', { exists: true, data: { plan: 'starter' } });
    planEnforcement = loadModule();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('forces a re-read for the named tenant only', async () => {
    await planEnforcement.getTenantPlanState('tenant_a');
    await planEnforcement.getTenantPlanState('tenant_b');
    expect(getSpy).toHaveBeenCalledTimes(2);

    tenants.set('tenant_a', { exists: true, data: { plan: 'starter' } });
    planEnforcement.invalidateTenantPlanCache('tenant_a');

    expect((await planEnforcement.getTenantPlanState('tenant_a')).plan).toBe('starter');
    expect(getSpy).toHaveBeenCalledTimes(3);

    // tenant_b was untouched and is still served from cache.
    await planEnforcement.getTenantPlanState('tenant_b');
    expect(getSpy).toHaveBeenCalledTimes(3);
  });

  it('clears every tenant when called with no argument', async () => {
    await planEnforcement.getTenantPlanState('tenant_a');
    await planEnforcement.getTenantPlanState('tenant_b');
    expect(getSpy).toHaveBeenCalledTimes(2);

    planEnforcement.invalidateTenantPlanCache();

    await planEnforcement.getTenantPlanState('tenant_a');
    await planEnforcement.getTenantPlanState('tenant_b');
    expect(getSpy).toHaveBeenCalledTimes(4);
  });
});

describe('S9: the plan writers drop the cache after changing entitlement', () => {
  const fs = require('fs') as typeof import('fs');
  const path = require('path') as typeof import('path');
  const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8');

  const WRITERS = [
    'app/api/super_admin/tenants/[tenantId]/plan/route.ts',
    'app/api/super_admin/tenants/[tenantId]/modules/route.ts',
  ];

  it.each(WRITERS)('%s invalidates after writing the tenant', (rel) => {
    const src = read(rel);
    expect(src).toContain('invalidateTenantPlanCache(tenantId)');

    // The invalidation must follow the write, not precede it, or it caches the old value.
    const writeIdx = src.indexOf('tenantRef.set(');
    const invalidateIdx = src.indexOf('invalidateTenantPlanCache(tenantId)');
    expect(writeIdx).toBeGreaterThan(-1);
    expect(invalidateIdx).toBeGreaterThan(writeIdx);
  });
});
