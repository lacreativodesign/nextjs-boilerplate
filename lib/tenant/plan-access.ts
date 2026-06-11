import { PLAN_MODULES } from "@/app/config/plans";

// Centralized, shared plan/module helpers for both client and server.
// Keep this file free of server-only dependencies so UI gating can import it safely.

export type PlanTier = keyof typeof PLAN_MODULES;
export type PlanModuleKey = keyof typeof PLAN_MODULES.starter;
export type PlanModules = Record<PlanModuleKey, boolean>;

const PLAN_KEYS = Object.keys(PLAN_MODULES) as PlanTier[];

export function normalizePlan(plan: unknown): PlanTier {
  const normalized = String(plan || "").toLowerCase();
  return PLAN_KEYS.includes(normalized as PlanTier) ? (normalized as PlanTier) : "pro";
}

function normalizeModules(input: unknown): Partial<PlanModules> {
  if (!input || typeof input !== "object") return {};
  const entries = Object.entries(input as Record<string, unknown>);
  return entries.reduce<Partial<PlanModules>>((acc, [key, value]) => {
    if (key in PLAN_MODULES.starter) {
      acc[key as PlanModuleKey] = Boolean(value);
    }
    return acc;
  }, {});
}

export function resolvePlanModules(plan: PlanTier, overrides?: Record<string, unknown>): PlanModules {
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
  const hasExplicitModules = Boolean(modules && typeof modules === "object");
  const baseModules = resolvePlanModules(plan, hasExplicitModules ? modules : {});

  if (!hasExplicitModules && legacyModulesEnabled && typeof legacyModulesEnabled === "object") {
    const legacy = legacyModulesEnabled as Record<string, unknown>;
    const legacyOverrides: Partial<PlanModules> = {};
    if (legacy.finance !== undefined) legacyOverrides.finance = Boolean(legacy.finance);
    if (legacy.notifications !== undefined) legacyOverrides.notifications = Boolean(legacy.notifications);
    if (legacy.humanResource !== undefined) legacyOverrides.hr = Boolean(legacy.humanResource);
    return {
      ...baseModules,
      ...legacyOverrides,
    };
  }

  return baseModules;
}

export function isSuperAdminRole(role?: string | null) {
  return String(role || "").toLowerCase() === "super_admin";
}

// Used by UI + server checks. Defaults to allowing access when module maps are missing
// to avoid breaking existing tenants that have not been upgraded.
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
