import { PLAN_MODULES } from '@/app/config/plans';
import {
  LOCKED_MODULES,
  canAccessPlanModule,
  normalizePlan,
  resolvePlanTier,
  resolveTenantModules,
} from '@/lib/tenant/plan-access';
import { isModuleEnabled } from '@/lib/tenant/access';

/**
 * S6 — Entitlements fail closed.
 *
 * Four independent fail-OPEN defects let tenants receive paid modules for free:
 *  1. normalizePlan() fell back to 'pro' for an unknown/missing/malformed plan,
 *     granting Finance, Production and Approvals.
 *  2. PLAN_MODULES.trial granted EVERY paid module including HR (Enterprise-only), so
 *     any tenant with a missing module map got Enterprise access.
 *  3. isModuleEnabled() returned true for an ABSENT key, so a tenant with no module
 *     map had every module switched on.
 *  4. A legacy `modulesEnabled` flag could ADD an entitlement the plan never granted.
 *
 * The locked packages are: Starter (no Finance/Production/Approvals/HR/Connect),
 * Pro (adds Finance/Production/Approvals, no HR/Connect), Enterprise (adds HR/Connect).
 */
const PAID_MODULES = ['finance', 'production', 'approvals', 'hr', 'client_stripe_connect'] as const;

describe('S6: unknown plans never grant a paid module', () => {
  it('resolvePlanTier returns null for unknown/missing/malformed plans', () => {
    expect(resolvePlanTier(undefined)).toBeNull();
    expect(resolvePlanTier(null)).toBeNull();
    expect(resolvePlanTier('')).toBeNull();
    expect(resolvePlanTier('platinum')).toBeNull();
    expect(resolvePlanTier({})).toBeNull();
    expect(resolvePlanTier('pro')).toBe('pro');
  });

  it('normalizePlan no longer falls back to pro', () => {
    expect(normalizePlan(undefined)).not.toBe('pro');
    expect(normalizePlan('garbage')).toBe('starter');
  });

  it.each(PAID_MODULES)('an unknown plan does not grant %s', (moduleKey) => {
    const plan = normalizePlan('totally-unknown-plan');
    const modules = resolveTenantModules({ plan });
    expect(modules[moduleKey]).toBe(false);
  });
});

describe('S6: the trial fallback tier grants no paid module', () => {
  it.each(PAID_MODULES)('trial does not grant %s', (moduleKey) => {
    expect(PLAN_MODULES.trial[moduleKey]).toBe(false);
  });
});

describe('S6: locked packages hold', () => {
  it('starter has no paid modules', () => {
    PAID_MODULES.forEach((m) => expect(PLAN_MODULES.starter[m]).toBe(false));
  });

  it('pro adds finance/production/approvals but not hr or connect', () => {
    expect(PLAN_MODULES.pro.finance).toBe(true);
    expect(PLAN_MODULES.pro.production).toBe(true);
    expect(PLAN_MODULES.pro.approvals).toBe(true);
    expect(PLAN_MODULES.pro.hr).toBe(false);
    expect(PLAN_MODULES.pro.client_stripe_connect).toBe(false);
  });

  it('enterprise adds hr and connect', () => {
    expect(PLAN_MODULES.enterprise.hr).toBe(true);
    expect(PLAN_MODULES.enterprise.client_stripe_connect).toBe(true);
  });
});

describe('S6: isModuleEnabled fails closed', () => {
  it('an absent key is NOT enabled', () => {
    expect(isModuleEnabled({}, 'finance')).toBe(false);
    expect(isModuleEnabled({ crm: true }, 'hr')).toBe(false);
  });

  it('only an explicit true enables', () => {
    expect(isModuleEnabled({ finance: true }, 'finance')).toBe(true);
    expect(isModuleEnabled({ finance: false }, 'finance')).toBe(false);
  });
});

describe('S6: legacy module flags may remove but never add', () => {
  it('a stale legacy HR flag cannot grant HR to a starter tenant', () => {
    const modules = resolveTenantModules({
      plan: 'starter',
      legacyModulesEnabled: { humanResource: true, finance: true },
    });
    expect(modules.hr).toBe(false);
    expect(modules.finance).toBe(false);
  });

  it('a legacy flag can still switch OFF a module the plan grants', () => {
    const modules = resolveTenantModules({
      plan: 'pro',
      legacyModulesEnabled: { finance: false },
    });
    expect(modules.finance).toBe(false);
  });

  it('a legacy flag leaves a granted module intact when true', () => {
    const modules = resolveTenantModules({
      plan: 'pro',
      legacyModulesEnabled: { finance: true },
    });
    expect(modules.finance).toBe(true);
  });
});

describe('S6: canAccessPlanModule fails closed', () => {
  it('denies when the module map is missing or malformed', () => {
    expect(canAccessPlanModule({ modules: null, moduleKey: 'finance' })).toBe(false);
    expect(canAccessPlanModule({ modules: undefined, moduleKey: 'finance' })).toBe(false);
  });

  it('LOCKED_MODULES grants nothing', () => {
    Object.values(LOCKED_MODULES).forEach((v) => expect(v).toBe(false));
    expect(canAccessPlanModule({ modules: LOCKED_MODULES, moduleKey: 'finance' })).toBe(false);
  });

  it('still allows super_admin', () => {
    expect(
      canAccessPlanModule({ modules: LOCKED_MODULES, moduleKey: 'finance', role: 'super_admin' }),
    ).toBe(true);
  });
});
