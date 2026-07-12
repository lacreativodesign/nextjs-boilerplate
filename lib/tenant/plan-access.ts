import { PLAN_MODULES } from '@/app/config/plans';

// Centralized, shared plan/module helpers for both client and server.
// Keep this file free of server-only dependencies so UI gating can import it safely.

export type PlanTier = keyof typeof PLAN_MODULES;
export type PlanModuleKey = keyof typeof PLAN_MODULES.starter;
export type PlanModules = Record<PlanModuleKey, boolean>;

const PLAN_KEYS = Object.keys(PLAN_MODULES) as PlanTier[];

/** Every module denied. The fail-closed baseline. */
export const LOCKED_MODULES: PlanModules = (
  Object.keys(PLAN_MODULES.starter) as PlanModuleKey[]
).reduce((acc, key) => {
  acc[key] = false;
  return acc;
}, {} as PlanModules);

/**
 * S6: strict tier resolution. Returns null for an unknown, missing or malformed plan
 * so callers can decide explicitly, instead of silently inheriting someone else's tier.
 */
export function resolvePlanTier(plan: unknown): PlanTier | null {
  const normalized = String(plan || '')
    .trim()
    .toLowerCase();
  return PLAN_KEYS.includes(normalized as PlanTier) ? (normalized as PlanTier) : null;
}

/**
 * S6: an unknown/missing/malformed plan previously fell back to 'pro', silently
 * granting Finance, Production and Approvals — paid modules — to any tenant whose plan
 * field was absent or corrupt. The fallback is now the least-privilege tier, so a bad
 * plan value can never hand out a paid entitlement. Callers that need to distinguish
 * "unknown" from "starter" must use resolvePlanTier().
 */
export function normalizePlan(plan: unknown): PlanTier {
  return resolvePlanTier(plan) ?? 'starter';
}

function normalizeModules(input: unknown): Partial<PlanModules> {
  if (!input || typeof input !== 'object') return {};
  const entries = Object.entries(input as Record<string, unknown>);
  return entries.reduce<Partial<PlanModules>>((acc, [key, value]) => {
    if (key in PLAN_MODULES.starter) {
      acc[key as PlanModuleKey] = Boolean(value);
    }
    return acc;
  }, {});
}

export function resolvePlanModules(
  plan: PlanTier,
  overrides?: Record<string, unknown>,
): PlanModules {
  return {
    ...PLAN_MODULES[plan],
    ...normalizeModules(overrides),
  };
}

// Backwards-compatible resolver: honors plan defaults but preserves legacy module flags
// when explicit "modules" overrides are missing (to avoid breaking existing tenants).
export function resolveTenantModules({
  plan,
  modules,
  legacyModulesEnabled,
}: {
  plan: PlanTier;
  modules?: Record<string, unknown>;
  legacyModulesEnabled?: Record<string, unknown>;
}): PlanModules {
  const hasExplicitModules = Boolean(modules && typeof modules === 'object');
  const baseModules = resolvePlanModules(plan, hasExplicitModules ? modules : {});

  if (!hasExplicitModules && legacyModulesEnabled && typeof legacyModulesEnabled === 'object') {
    const legacy = legacyModulesEnabled as Record<string, unknown>;
    const legacyOverrides: Partial<PlanModules> = {};
    if (legacy.finance !== undefined) legacyOverrides.finance = Boolean(legacy.finance);
    if (legacy.notifications !== undefined)
      legacyOverrides.notifications = Boolean(legacy.notifications);
    if (legacy.humanResource !== undefined) legacyOverrides.hr = Boolean(legacy.humanResource);

    // S6: a legacy flag may only REMOVE an entitlement the plan already grants — never
    // add one. Previously a stale `modulesEnabled.humanResource: true` on a Starter
    // tenant granted HR, an Enterprise-only module, with no subscription behind it.
    const intersected: Partial<PlanModules> = {};
    (Object.keys(legacyOverrides) as PlanModuleKey[]).forEach((key) => {
      intersected[key] = baseModules[key] === true && legacyOverrides[key] === true;
    });

    return {
      ...baseModules,
      ...intersected,
    };
  }

  return baseModules;
}

export function isSuperAdminRole(role?: string | null) {
  return String(role || '').toLowerCase() === 'super_admin';
}

// Used by UI + server checks. Fails closed: a missing or malformed module map denies
// access, and a module must be explicitly true to be granted.
export function canAccessPlanModule({
  modules,
  moduleKey,
  role,
}: {
  modules?: Partial<PlanModules> | null;
  moduleKey: PlanModuleKey;
  role?: string | null;
}) {
  if (isSuperAdminRole(role)) return true;
  if (!modules || typeof modules !== 'object') return false;
  return modules[moduleKey] === true;
}
